import { onValue, push, ref, remove, set, update } from 'firebase/database';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { buildEntries, buildLedgers, type BookEntry } from '../lib/accounting';
import { DEFAULT_CATEGORIES, DEFAULT_COMPANY, DEFAULT_LEDGERS, DEFAULT_SETTINGS } from '../lib/defaults';
import { db } from '../lib/firebase';
import { invoicePayments } from '../lib/invoice';
import type { Category, Invoice, Ledger, Settings, Subcategory, Transaction, Voucher } from '../lib/types';
import { useAuth } from './auth';
import { readCache, writeCache, type CacheShape } from '../lib/cache';

type NewTxn = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;
type NewVoucher = Omit<Voucher, 'id' | 'createdAt' | 'updatedAt'>;
type NewLedger = Omit<Ledger, 'id' | 'createdAt' | 'virtual'>;

interface DataState {
  ready: boolean;
  error: string | null;
  slow: boolean;
  online: boolean;
  categories: Category[];
  subcategories: Subcategory[];
  storedLedgers: Ledger[];
  transactions: Transaction[];
  vouchers: Voucher[];
  invoices: Invoice[];
  settings: Settings;
  currency: string;
  // derived
  ledgers: Ledger[];
  ledgerById: Map<string, Ledger>;
  catById: Map<string, Category>;
  subById: Map<string, Subcategory>;
  entries: BookEntry[];
  payments: Map<string, number>;
  // actions
  addTransaction: (t: NewTxn) => string;
  updateTransaction: (id: string, t: Partial<NewTxn>) => void;
  deleteTransaction: (id: string) => void;
  restoreTransaction: (t: Transaction) => void;
  addCategory: (c: Pick<Category, 'name' | 'type' | 'color'>) => string;
  updateCategory: (id: string, c: Partial<Category>) => void;
  deleteCategory: (id: string, moveTo?: string) => Promise<void>;
  addSubcategory: (categoryId: string, name: string) => string;
  updateSubcategory: (id: string, s: Partial<Subcategory>) => void;
  deleteSubcategory: (id: string) => Promise<void>;
  addLedger: (l: NewLedger) => string;
  updateLedger: (id: string, l: Partial<NewLedger>) => void;
  deleteLedger: (id: string) => void;
  addDefaultLedgers: () => void;
  saveVoucher: (v: NewVoucher, id?: string) => string;
  deleteVoucher: (id: string) => void;
  saveInvoice: (inv: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => string;
  deleteInvoice: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => void;
}

const Ctx = createContext<DataState | null>(null);

const COLLECTIONS = ['categories', 'subcategories', 'ledgers', 'transactions', 'vouchers', 'invoices'] as const;
type CollName = (typeof COLLECTIONS)[number];

/* ---------------- helpers ---------------- */

/** Realtime Database rejects `undefined`; JSON round-trip drops it (null stays → deletes the key). */
const clean = <T,>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

/** RTDB stores arrays as objects and drops empty arrays / null fields — bring them back. */
const arr = <T,>(x: unknown): T[] =>
  Array.isArray(x) ? (x.filter((v) => v !== null && v !== undefined) as T[]) : x && typeof x === 'object' ? (Object.values(x) as T[]) : [];

type Row = Record<string, unknown> & { id: string };

const NORMALISE: Record<CollName, (r: Row) => unknown> = {
  categories: (r) => ({ order: 0, createdAt: 0, color: 'c0', type: 'expense', ...r }),
  subcategories: (r) => ({ order: 0, createdAt: 0, ...r }),
  ledgers: (r) => ({ openingBalance: 0, openingType: 'Dr', createdAt: 0, ...r }),
  transactions: (r) => ({
    notes: '',
    partyName: '',
    gstin: '',
    billNo: '',
    gstEnabled: false,
    gstRate: 0,
    gstInclusive: true,
    interState: false,
    cgst: 0,
    sgst: 0,
    igst: 0,
    taxableAmount: Number(r.amount) || 0,
    createdAt: 0,
    updatedAt: 0,
    ...r,
    subcategoryId: (r.subcategoryId as string | undefined) ?? null,
  }),
  vouchers: (r) => ({ narration: '', createdAt: 0, updatedAt: 0, ...r, lines: arr(r.lines), invoiceId: (r.invoiceId as string | undefined) ?? null }),
  invoices: (r) => ({
    notes: '',
    terms: '',
    dueDate: '',
    roundOff: true,
    withGst: true,
    createdAt: 0,
    updatedAt: 0,
    ...r,
    items: arr(r.items),
    customerLedgerId: (r.customerLedgerId as string | undefined) ?? null,
    customer: { name: '', address: '', gstin: '', state: '', phone: '', email: '', ...((r.customer as object) ?? {}) },
  }),
};

function toRows(name: CollName, v: unknown): never[] {
  if (!v || typeof v !== 'object') return [];
  return Object.entries(v as Record<string, Record<string, unknown>>)
    .filter(([, x]) => x && typeof x === 'object')
    .map(([id, x]) => NORMALISE[name]({ ...x, id })) as never[];
}

function errorText(e: unknown) {
  const msg = String((e as Error)?.message ?? e).toLowerCase();
  if (msg.includes('permission')) return 'permission';
  return (e as Error)?.message ?? String(e);
}

function report(e: unknown, what: string) {
  console.error(what, e);
  toast.error(
    errorText(e) === 'permission' ? `${what}: permission denied. Publish the Realtime Database rules (database.rules.json).` : `${what}. Please try again.`,
  );
}

/** Fire-and-forget write: the local copy updates instantly, errors surface as toasts. */
function fire(p: Promise<unknown>, what = 'Could not save') {
  p.catch((e) => report(e, what));
}

function mergeSettings(raw: Partial<Settings> | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...(raw ?? {}),
    company: { ...DEFAULT_COMPANY, ...(raw?.company ?? {}) },
    gstRates: arr<number>(raw?.gstRates).length ? arr<number>(raw?.gstRates) : DEFAULT_SETTINGS.gstRates,
  };
}

/* ---------------- provider ---------------- */

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [storedLedgers, setLedgers] = useState<Ledger[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [rawSettings, setRawSettings] = useState<Partial<Settings> | undefined>();
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [online, setOnline] = useState(true);
  const seeding = useRef(false);
  const rawRef = useRef<CacheShape['data']>({});

  const base = `users/${uid}`;
  const path = useCallback((...p: string[]) => ref(db, [base, ...p].join('/')), [base]);

  useEffect(() => {
    if (!uid) return;
    setLoaded(new Set());
    setError(null);
    setSlow(false);
    rawRef.current = {};

    const setters: Record<CollName, (rows: never[]) => void> = {
      categories: setCategories as never,
      subcategories: setSubcategories as never,
      ledgers: setLedgers as never,
      transactions: setTransactions as never,
      vouchers: setVouchers as never,
      invoices: setInvoices as never,
    };

    // 1) paint immediately from the last session's copy
    const cached = readCache(uid);
    if (cached && cached.settings) {
      for (const name of COLLECTIONS) setters[name](toRows(name, cached[name]));
      setRawSettings(cached.settings);
      rawRef.current = { ...cached };
      setFromCache(true);
    } else setFromCache(false);

    // 2) live data
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const persist = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => writeCache(uid, rawRef.current), 800);
    };
    const mark = (k: string) => setLoaded((s) => (s.has(k) ? s : new Set(s).add(k)));
    const onErr = (k: string) => (e: Error) => {
      console.error(k, e);
      setError(
        errorText(e) === 'permission'
          ? 'The database refused access. Publish the Realtime Database rules from database.rules.json in the Firebase console (Realtime Database → Rules).'
          : `Could not load ${k}: ${e.message}`,
      );
      mark(k);
    };

    const unsubs = COLLECTIONS.map((name) =>
      onValue(
        ref(db, `users/${uid}/${name}`),
        (snap) => {
          const v = snap.val();
          rawRef.current = { ...rawRef.current, [name]: v ?? null };
          setters[name](toRows(name, v));
          mark(name);
          persist();
        },
        onErr(name),
      ),
    );
    unsubs.push(
      onValue(
        ref(db, `users/${uid}/settings`),
        (snap) => {
          const data = (snap.val() ?? undefined) as Partial<Settings> | undefined;
          setRawSettings(data);
          rawRef.current = { ...rawRef.current, settings: data };
          mark('settings');
          persist();
          if (!data?.seeded && !seeding.current) {
            seeding.current = true;
            seed(uid, data)
              .catch((e) => report(e, 'Could not create default categories'))
              .finally(() => (seeding.current = false));
          }
        },
        onErr('settings'),
      ),
    );

    // connection state (RTDB special path)
    let offlineTimer: ReturnType<typeof setTimeout> | undefined;
    unsubs.push(
      onValue(ref(db, '.info/connected'), (snap) => {
        clearTimeout(offlineTimer);
        if (snap.val() === true) setOnline(true);
        else offlineTimer = setTimeout(() => setOnline(false), 4000);
      }),
    );

    const t = setTimeout(() => setSlow(true), 10000);
    return () => {
      clearTimeout(t);
      clearTimeout(saveTimer);
      clearTimeout(offlineTimer);
      writeCache(uid, rawRef.current);
      unsubs.forEach((u) => u());
    };
  }, [uid]);

  const live = !!uid && loaded.size >= COLLECTIONS.length + 1;
  const ready = live || (!!uid && fromCache);
  const settings = useMemo(() => mergeSettings(rawSettings), [rawSettings]);

  const sortedCats = useMemo(
    () => [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)),
    [categories],
  );
  const sortedSubs = useMemo(
    () => [...subcategories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)),
    [subcategories],
  );
  const sortedTxns = useMemo(
    () => [...transactions].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1)),
    [transactions],
  );
  const ledgers = useMemo(() => buildLedgers(storedLedgers, sortedCats), [storedLedgers, sortedCats]);
  const ledgerById = useMemo(() => new Map(ledgers.map((l) => [l.id, l])), [ledgers]);
  const catById = useMemo(() => new Map(sortedCats.map((c) => [c.id, c])), [sortedCats]);
  const subById = useMemo(() => new Map(sortedSubs.map((s) => [s.id, s])), [sortedSubs]);
  const entries = useMemo(
    () =>
      buildEntries(transactions, vouchers, invoices, {
        ledgers,
        categories: sortedCats,
        subcategories: sortedSubs,
        companyState: settings.company.state,
      }),
    [transactions, vouchers, invoices, ledgers, sortedCats, sortedSubs, settings.company.state],
  );
  const payments = useMemo(() => invoicePayments(vouchers), [vouchers]);

  // ---------- actions ----------
  const newKey = useCallback((coll: CollName) => push(path(coll)).key!, [path]);
  const multi = useCallback((u: Record<string, unknown>, what: string) => fire(update(ref(db, base), clean(u)), what), [base]);

  const addTransaction = useCallback(
    (t: NewTxn) => {
      const id = newKey('transactions');
      const now = Date.now();
      fire(set(path('transactions', id), clean({ ...t, createdAt: now, updatedAt: now })), 'Could not save entry');
      return id;
    },
    [newKey, path],
  );
  const updateTransaction = useCallback(
    (id: string, t: Partial<NewTxn>) => fire(update(path('transactions', id), clean({ ...t, updatedAt: Date.now() })), 'Could not update entry'),
    [path],
  );
  const deleteTransaction = useCallback((id: string) => fire(remove(path('transactions', id)), 'Could not delete entry'), [path]);
  const restoreTransaction = useCallback(
    (t: Transaction) => {
      const { id, ...rest } = t;
      fire(set(path('transactions', id), clean(rest)), 'Could not restore entry');
    },
    [path],
  );

  const addCategory = useCallback(
    (c: Pick<Category, 'name' | 'type' | 'color'>) => {
      const id = newKey('categories');
      fire(set(path('categories', id), clean({ ...c, order: Date.now(), createdAt: Date.now() })), 'Could not add category');
      return id;
    },
    [newKey, path],
  );
  const updateCategory = useCallback(
    (id: string, c: Partial<Category>) => {
      const { id: _drop, ...rest } = c;
      fire(update(path('categories', id), clean(rest)), 'Could not update category');
    },
    [path],
  );
  const deleteCategory = useCallback(
    async (id: string, moveTo?: string) => {
      const u: Record<string, unknown> = {};
      for (const t of transactions) {
        if (t.categoryId !== id) continue;
        if (!moveTo) throw new Error('Category has entries');
        u[`transactions/${t.id}/categoryId`] = moveTo;
        u[`transactions/${t.id}/subcategoryId`] = null;
      }
      for (const s of subcategories) if (s.categoryId === id) u[`subcategories/${s.id}`] = null;
      u[`categories/${id}`] = null;
      multi(u, 'Could not delete category');
    },
    [transactions, subcategories, multi],
  );
  const addSubcategory = useCallback(
    (categoryId: string, name: string) => {
      const id = newKey('subcategories');
      fire(set(path('subcategories', id), { categoryId, name, order: Date.now(), createdAt: Date.now() }), 'Could not add sub-category');
      return id;
    },
    [newKey, path],
  );
  const updateSubcategory = useCallback(
    (id: string, s: Partial<Subcategory>) => {
      const { id: _drop, ...rest } = s;
      fire(update(path('subcategories', id), clean(rest)), 'Could not update sub-category');
    },
    [path],
  );
  const deleteSubcategory = useCallback(
    async (id: string) => {
      const u: Record<string, unknown> = {};
      for (const t of transactions) if (t.subcategoryId === id) u[`transactions/${t.id}/subcategoryId`] = null;
      u[`subcategories/${id}`] = null;
      multi(u, 'Could not delete sub-category');
    },
    [transactions, multi],
  );

  const addLedger = useCallback(
    (l: NewLedger) => {
      const id = newKey('ledgers');
      fire(set(path('ledgers', id), clean({ ...l, createdAt: Date.now() })), 'Could not create ledger');
      return id;
    },
    [newKey, path],
  );
  const updateLedger = useCallback((id: string, l: Partial<NewLedger>) => fire(update(path('ledgers', id), clean(l)), 'Could not update ledger'), [path]);
  const deleteLedger = useCallback((id: string) => fire(remove(path('ledgers', id)), 'Could not delete ledger'), [path]);
  const addDefaultLedgers = useCallback(() => {
    const u: Record<string, unknown> = {};
    const have = new Set(storedLedgers.map((l) => l.id));
    for (const l of DEFAULT_LEDGERS) {
      const { id, ...rest } = l;
      if (!have.has(id)) u[`ledgers/${id}`] = { ...rest, createdAt: Date.now() };
    }
    multi(u, 'Could not create accounts');
  }, [storedLedgers, multi]);

  const saveVoucher = useCallback(
    (v: NewVoucher, id?: string) => {
      const now = Date.now();
      if (id) {
        fire(update(path('vouchers', id), clean({ ...v, updatedAt: now })), 'Could not update voucher');
        return id;
      }
      const nid = newKey('vouchers');
      fire(set(path('vouchers', nid), clean({ ...v, createdAt: now, updatedAt: now })), 'Could not save voucher');
      return nid;
    },
    [newKey, path],
  );
  const deleteVoucher = useCallback((id: string) => fire(remove(path('vouchers', id)), 'Could not delete voucher'), [path]);

  const saveInvoice = useCallback(
    (inv: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => {
      const now = Date.now();
      if (id) {
        fire(update(path('invoices', id), clean({ ...inv, updatedAt: now })), 'Could not update invoice');
        return id;
      }
      const nid = newKey('invoices');
      fire(set(path('invoices', nid), clean({ ...inv, createdAt: now, updatedAt: now })), 'Could not save invoice');
      return nid;
    },
    [newKey, path],
  );
  const deleteInvoice = useCallback(
    async (id: string) => {
      const u: Record<string, unknown> = {};
      for (const v of vouchers) if (v.invoiceId === id) u[`vouchers/${v.id}`] = null;
      u[`invoices/${id}`] = null;
      multi(u, 'Could not delete invoice');
    },
    [vouchers, multi],
  );

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      if (!uid) return;
      fire(update(path('settings'), clean(patch)), 'Could not save settings');
    },
    [uid, path],
  );

  const value: DataState = {
    ready,
    error,
    slow: slow && !live,
    online,
    categories: sortedCats,
    subcategories: sortedSubs,
    storedLedgers,
    transactions: sortedTxns,
    vouchers,
    invoices,
    settings,
    currency: settings.currency,
    ledgers,
    ledgerById,
    catById,
    subById,
    entries,
    payments,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    restoreTransaction,
    addCategory,
    updateCategory,
    deleteCategory,
    addSubcategory,
    updateSubcategory,
    deleteSubcategory,
    addLedger,
    updateLedger,
    deleteLedger,
    addDefaultLedgers,
    saveVoucher,
    deleteVoucher,
    saveInvoice,
    deleteInvoice,
    updateSettings,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** First login: default categories, sub-categories and ledgers in one atomic multi-path write (fixed ids → idempotent). */
async function seed(uid: string, existing: Partial<Settings> | undefined) {
  const u: Record<string, unknown> = {};
  const now = Date.now();
  DEFAULT_CATEGORIES.forEach((c, i) => {
    u[`categories/cat_${c.key}`] = { name: c.name, type: c.type, color: c.color, order: i, createdAt: now + i };
    c.subs.forEach((s, j) => {
      u[`subcategories/sub_${c.key}_${j}`] = { categoryId: `cat_${c.key}`, name: s, order: j, createdAt: now + j };
    });
  });
  for (const l of DEFAULT_LEDGERS) {
    const { id, ...rest } = l;
    u[`ledgers/${id}`] = { ...rest, createdAt: now };
  }
  u.settings = { ...DEFAULT_SETTINGS, ...(existing ?? {}), seeded: true };
  await update(ref(db, `users/${uid}`), clean(u));
}

export function useData() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData outside DataProvider');
  return v;
}
