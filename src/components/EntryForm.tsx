import { Banknote, Check, CreditCard, Landmark, Smartphone, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { GROUPS } from '../lib/accounting';
import { addDaysISO, todayISO } from '../lib/dates';
import { COLOR_SLOTS, colorVar } from '../lib/defaults';
import { currencySymbol, evalAmount, fmtDate, money, pct, round2 } from '../lib/format';
import { calcGst, GSTIN_RE } from '../lib/gst';
import type { EntryType, LedgerGroup, PaymentMode, Transaction } from '../lib/types';
import { useData } from '../store/data';
import { DatePicker } from './DatePicker';
import { Button, Chip, cn, Field, Input, Segmented, Select, Switch, Textarea, useConfirm } from './ui';

const MODES: { value: PaymentMode; label: string; icon: typeof Banknote }[] = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'upi', label: 'UPI', icon: Smartphone },
  { value: 'card', label: 'Card', icon: CreditCard },
  { value: 'bank', label: 'Bank', icon: Landmark },
];

const LAST_KEY = 'bb-last-entry';
interface LastPrefs {
  type?: EntryType;
  paymentMode?: PaymentMode;
  expenseCat?: string;
  incomeCat?: string;
}
function readLast(): LastPrefs {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}') as LastPrefs;
  } catch {
    return {};
  }
}
function writeLast(p: LastPrefs) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ ...readLast(), ...p }));
  } catch {
    /* storage blocked */
  }
}

const ACCOUNT_GROUPS: LedgerGroup[] = [
  'cash',
  'bank',
  'customers',
  'suppliers',
  'current_assets',
  'current_liabilities',
  'loans',
  'capital',
  'fixed_assets',
];

export function EntryForm({
  initial,
  onDone,
  autoFocus = true,
  defaultDate,
  inModal,
  onDateChange,
}: {
  initial?: Transaction;
  onDone?: (id: string, date: string) => void;
  autoFocus?: boolean;
  defaultDate?: string;
  inModal?: boolean;
  onDateChange?: (date: string) => void;
}) {
  const data = useData();
  const confirm = useConfirm();
  const { categories, subcategories, storedLedgers, settings, currency, transactions } = data;
  const last = useMemo(readLast, []);
  const editing = !!initial;

  const [type, setType] = useState<EntryType>(initial?.type ?? last.type ?? 'expense');
  const [amountText, setAmountText] = useState(
    initial ? String(initial.gstEnabled && !initial.gstInclusive ? initial.taxableAmount : initial.amount) : '',
  );
  const [date, setDateState] = useState(initial?.date ?? defaultDate ?? todayISO());
  const setDate = (d: string) => {
    setDateState(d);
    onDateChange?.(d);
  };
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [subcategoryId, setSubcategoryId] = useState(initial?.subcategoryId ?? '');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(initial?.paymentMode ?? last.paymentMode ?? 'cash');
  const [ledgerId, setLedgerId] = useState(initial?.ledgerId ?? '');
  const [ledgerTouched, setLedgerTouched] = useState(!!initial);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [gstEnabled, setGstEnabled] = useState(initial?.gstEnabled ?? false);
  const [gstRate, setGstRate] = useState(initial?.gstRate ?? settings.defaultGstRate);
  const [gstInclusive, setGstInclusive] = useState(initial?.gstInclusive ?? true);
  const [interState, setInterState] = useState(initial?.interState ?? false);
  const [partyName, setPartyName] = useState(initial?.partyName ?? '');
  const [gstin, setGstin] = useState(initial?.gstin ?? '');
  const [billNo, setBillNo] = useState(initial?.billNo ?? '');
  const [newCat, setNewCat] = useState<string | null>(null);
  const [newSub, setNewSub] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const amountRef = useRef<HTMLInputElement>(null);

  const typeCats = useMemo(() => categories.filter((c) => c.type === type || c.type === 'both'), [categories, type]);
  const subs = useMemo(() => subcategories.filter((s) => s.categoryId === categoryId), [subcategories, categoryId]);
  const accountLedgers = useMemo(
    () =>
      storedLedgers
        .filter((l) => ACCOUNT_GROUPS.includes(l.group))
        .sort((a, b) => GROUPS[a.group].order - GROUPS[b.group].order || a.name.localeCompare(b.name)),
    [storedLedgers],
  );

  // default category for the type
  useEffect(() => {
    if (categoryId && typeCats.some((c) => c.id === categoryId)) return;
    const pref = type === 'expense' ? last.expenseCat : last.incomeCat;
    const pick = typeCats.find((c) => c.id === pref) ?? typeCats[0];
    if (pick && pick.id !== categoryId) {
      setCategoryId(pick.id);
      setSubcategoryId('');
    }
  }, [type, typeCats, categoryId, last]);

  // auto-pick the account from payment mode unless user chose one
  useEffect(() => {
    if (ledgerTouched) return;
    const want = paymentMode === 'cash' ? 'cash' : 'bank';
    const l = accountLedgers.find((x) => x.group === want) ?? accountLedgers[0];
    if (l && l.id !== ledgerId) setLedgerId(l.id);
  }, [paymentMode, accountLedgers, ledgerTouched, ledgerId]);

  useEffect(() => {
    if (autoFocus) amountRef.current?.focus();
  }, [autoFocus]);

  const entryDates = useMemo(() => new Set(transactions.map((t) => t.date)), [transactions]);

  const amount = evalAmount(amountText);
  const showCalc = amount !== null && /[+\-*/]/.test(amountText.replace(/^-/, ''));
  const gst = calcGst(amount ?? 0, gstRate, gstInclusive, interState);

  // quick picks: recent distinct category/sub combos
  const recents = useMemo(() => {
    const seen = new Set<string>();
    const out: { categoryId: string; subcategoryId: string | null; label: string; color: string }[] = [];
    for (const t of transactions) {
      if (t.type !== type) continue;
      const key = `${t.categoryId}|${t.subcategoryId ?? ''}`;
      if (seen.has(key)) continue;
      const c = data.catById.get(t.categoryId);
      if (!c) continue;
      seen.add(key);
      const s = t.subcategoryId ? data.subById.get(t.subcategoryId) : undefined;
      out.push({ categoryId: t.categoryId, subcategoryId: t.subcategoryId, label: s ? s.name : c.name, color: c.color });
      if (out.length >= 6) break;
    }
    return out;
  }, [transactions, type, data.catById, data.subById]);

  const addCategoryInline = () => {
    const name = newCat?.trim();
    if (!name) return;
    const exists = typeCats.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      setCategoryId(exists.id);
    } else {
      const used = new Set(categories.map((c) => c.color));
      const color = COLOR_SLOTS.find((s) => s !== 'c0' && !used.has(s)) ?? COLOR_SLOTS[categories.length % 8]!;
      const id = data.addCategory({ name, type, color });
      setCategoryId(id);
      toast.success(`Category “${name}” added`);
    }
    setSubcategoryId('');
    setNewCat(null);
  };

  const addSubInline = () => {
    const name = newSub?.trim();
    if (!name || !categoryId) return;
    const exists = subs.find((s) => s.name.toLowerCase() === name.toLowerCase());
    const id = exists ? exists.id : data.addSubcategory(categoryId, name);
    if (!exists) toast.success(`Sub-category “${name}” added`);
    setSubcategoryId(id);
    setNewSub(null);
  };

  const reset = () => {
    setAmountText('');
    setNotes('');
    setSubcategoryId('');
    setPartyName('');
    setGstin('');
    setBillNo('');
    setErrors({});
    amountRef.current?.focus();
  };

  const submit = (another: boolean) => (e?: FormEvent) => {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (amount === null || amount <= 0) errs.amount = 'Enter an amount greater than 0';
    if (!categoryId) errs.category = 'Choose a category';
    if (!ledgerId) errs.ledger = 'Choose an account';
    if (gstEnabled && gstin && !GSTIN_RE.test(gstin)) errs.gstin = 'GSTIN looks invalid (15 characters, e.g. 32ABCDE1234F1Z5)';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const payload = {
      date,
      type,
      categoryId,
      subcategoryId: subcategoryId || null,
      amount: gstEnabled ? gst.total : round2(amount!),
      paymentMode,
      ledgerId,
      notes: notes.trim(),
      gstEnabled,
      gstRate: gstEnabled ? gstRate : 0,
      gstInclusive: gstEnabled ? gstInclusive : true,
      interState: gstEnabled ? interState : false,
      taxableAmount: gstEnabled ? gst.taxable : round2(amount!),
      cgst: gstEnabled ? gst.cgst : 0,
      sgst: gstEnabled ? gst.sgst : 0,
      igst: gstEnabled ? gst.igst : 0,
      partyName: gstEnabled ? partyName.trim() : '',
      gstin: gstEnabled ? gstin.trim().toUpperCase() : '',
      billNo: gstEnabled ? billNo.trim() : '',
    };
    writeLast({ type, paymentMode, [type === 'expense' ? 'expenseCat' : 'incomeCat']: categoryId });

    if (editing) {
      data.updateTransaction(initial!.id, payload);
      toast.success('Entry updated');
      onDone?.(initial!.id, date);
      return;
    }
    const id = data.addTransaction(payload);
    toast.success(`${type === 'expense' ? 'Expense' : 'Income'} of ${money(payload.amount, currency)} saved`, {
      action: { label: 'Undo', onClick: () => data.deleteTransaction(id) },
    });
    if (another) reset();
    else onDone?.(id, date);
  };

  const removeEntry = async () => {
    if (!initial) return;
    const ok = await confirm({
      title: 'Delete this entry?',
      message: 'It will be removed from all reports and ledgers.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    data.deleteTransaction(initial.id);
    toast.success('Entry deleted', { action: { label: 'Undo', onClick: () => data.restoreTransaction(initial) } });
    onDone?.(initial.id, initial.date);
  };

  const today = todayISO();
  const dateHint =
    date > today
      ? 'Future date'
      : date.slice(0, 7) !== today.slice(0, 7)
        ? `Back-dated — goes into ${fmtDate(date, 'MMMM yyyy')}`
        : undefined;

  const accent = type === 'expense' ? 'text-expense' : 'text-income';
  const sym = currencySymbol(currency);
  const homeState = settings.company.state || 'home state';

  return (
    <form onSubmit={submit(false)} className="space-y-5" noValidate>
      <Segmented
        full
        value={type}
        onChange={(t) => {
          setType(t);
          setCategoryId('');
        }}
        options={[
          { value: 'expense', label: 'Expense', activeClass: 'bg-expense-soft text-expense ring-1 ring-expense/40' },
          { value: 'income', label: 'Income', activeClass: 'bg-income-soft text-income ring-1 ring-income/40' },
        ]}
      />

      {/* Amount */}
      <div>
        <div
          className={cn(
            'flex items-center gap-2 rounded-2xl border bg-surface px-4 transition focus-within:ring-4',
            errors.amount
              ? 'border-expense focus-within:ring-red-400/20'
              : 'border-line focus-within:border-brand-strong focus-within:ring-yellow-400/20',
          )}
        >
          <span className={cn('text-2xl font-semibold', accent)}>{sym}</span>
          <input
            ref={amountRef}
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            aria-label="Amount"
            placeholder="0"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            onBlur={() => showCalc && amount !== null && setAmountText(String(amount))}
            className={cn(
              'tabular h-16 w-full min-w-0 bg-transparent text-[32px] font-bold tracking-tight outline-none placeholder:text-muted/50',
              accent,
            )}
          />
        </div>
        {errors.amount ? (
          <p className="mt-1.5 text-xs font-medium text-expense">{errors.amount}</p>
        ) : showCalc ? (
          <p className="mt-1.5 text-xs text-muted">= {money(amount!, currency)}</p>
        ) : null}
      </div>

      {/* Date */}
      <Field label="Date" hint={dateHint}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[200px] flex-1 sm:max-w-[260px]">
            <DatePicker value={date} onChange={setDate} marked={entryDates} />
          </div>
          <Chip active={date === today} onClick={() => setDate(today)}>
            Today
          </Chip>
          <Chip active={date === addDaysISO(today, -1)} onClick={() => setDate(addDaysISO(today, -1))}>
            Yesterday
          </Chip>
        </div>
      </Field>

      {/* Quick picks */}
      {!editing && recents.length > 0 && (
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">Recent</p>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {recents.map((r) => (
              <Chip
                key={`${r.categoryId}|${r.subcategoryId}`}
                active={categoryId === r.categoryId && (subcategoryId || null) === r.subcategoryId}
                onClick={() => {
                  setCategoryId(r.categoryId);
                  setSubcategoryId(r.subcategoryId ?? '');
                }}
                icon={<span className="size-2 rounded-full" style={{ background: colorVar(r.color) }} />}
              >
                {r.label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Category / sub-category */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" error={errors.category}>
          {newCat !== null ? (
            <InlineAdd
              value={newCat}
              onChange={setNewCat}
              onAdd={addCategoryInline}
              onCancel={() => setNewCat(null)}
              placeholder="New category name"
            />
          ) : (
            <Select
              value={categoryId}
              onChange={(e) => {
                if (e.target.value === '__new__') return setNewCat('');
                setCategoryId(e.target.value);
                setSubcategoryId('');
              }}
            >
              {!categoryId && <option value="">Select category</option>}
              {typeCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__new__">＋ Add new category…</option>
            </Select>
          )}
        </Field>
        <Field label="Sub-category">
          {newSub !== null ? (
            <InlineAdd
              value={newSub}
              onChange={setNewSub}
              onAdd={addSubInline}
              onCancel={() => setNewSub(null)}
              placeholder="New sub-category name"
            />
          ) : (
            <Select
              value={subcategoryId}
              disabled={!categoryId}
              onChange={(e) => {
                if (e.target.value === '__new__') return setNewSub('');
                setSubcategoryId(e.target.value);
              }}
            >
              <option value="">{subs.length ? 'None' : 'No sub-categories'}</option>
              {subs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="__new__">＋ Add new sub-category…</option>
            </Select>
          )}
        </Field>
      </div>

      {/* Payment mode */}
      <Field label="Payment mode">
        <div className="grid grid-cols-4 gap-2">
          {MODES.map((m) => {
            const active = paymentMode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                aria-pressed={active}
                onClick={() => setPaymentMode(m.value)}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-semibold transition active:scale-95',
                  active ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink-2 hover:border-line-strong',
                )}
              >
                <m.icon className="size-5" />
                {m.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label={type === 'expense' ? 'Paid from (account / ledger)' : 'Received in (account / ledger)'} error={errors.ledger}>
        {accountLedgers.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line-strong p-3 text-sm text-ink-2">
            <span>No Cash or Bank account yet.</span>
            <Button size="sm" variant="primary" onClick={() => data.addDefaultLedgers()}>
              Create Cash & Bank accounts
            </Button>
          </div>
        ) : (
          <Select
            value={ledgerId}
            onChange={(e) => {
              setLedgerId(e.target.value);
              setLedgerTouched(true);
            }}
          >
            {ACCOUNT_GROUPS.map((g) => {
              const items = accountLedgers.filter((l) => l.group === g);
              if (!items.length) return null;
              return (
                <optgroup key={g} label={GROUPS[g].label}>
                  {items.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </Select>
        )}
      </Field>

      {/* GST */}
      <div className={cn('rounded-2xl border p-4 transition', gstEnabled ? 'border-brand-strong/50 bg-brand-soft/40' : 'border-line')}>
        <Switch
          checked={gstEnabled}
          onChange={setGstEnabled}
          label="GST bill"
          description={gstEnabled ? 'GST is tracked separately for this entry' : 'Turn on if this bill has GST'}
        />
        {gstEnabled && (
          <div className="mt-4 space-y-4">
            <Field label="GST rate">
              <div className="flex flex-wrap gap-2">
                {settings.gstRates.map((r) => (
                  <Chip key={r} active={gstRate === r} onClick={() => setGstRate(r)}>
                    {r}%
                  </Chip>
                ))}
              </div>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Amount entered is">
                <Segmented
                  full
                  size="sm"
                  value={gstInclusive ? 'inc' : 'exc'}
                  onChange={(v) => setGstInclusive(v === 'inc')}
                  options={[
                    { value: 'inc', label: 'Incl. GST' },
                    { value: 'exc', label: '+ GST on top' },
                  ]}
                />
              </Field>
              <Field label="Supply">
                <Segmented
                  full
                  size="sm"
                  value={interState ? 'inter' : 'intra'}
                  onChange={(v) => setInterState(v === 'inter')}
                  options={[
                    { value: 'intra', label: `Within ${homeState}` },
                    { value: 'inter', label: 'Other state' },
                  ]}
                />
              </Field>
            </div>
            <div className="rounded-xl bg-surface p-3 text-sm">
              <Row label="Taxable value" value={money(gst.taxable, currency)} />
              {interState ? (
                <Row label={`IGST ${pct(gstRate, 2)}`} value={money(gst.igst, currency)} />
              ) : (
                <>
                  <Row label={`CGST ${pct(gstRate / 2, 2)}`} value={money(gst.cgst, currency)} />
                  <Row label={`SGST ${pct(gstRate / 2, 2)}`} value={money(gst.sgst, currency)} />
                </>
              )}
              <div className="mt-1.5 border-t border-line pt-1.5">
                <Row
                  label={<span className="font-semibold text-ink">Total</span>}
                  value={<span className="font-bold text-ink">{money(gst.total, currency)}</span>}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={type === 'expense' ? 'Supplier name' : 'Customer name'}>
                <Input value={partyName} onChange={(e) => setPartyName(e.target.value)} placeholder="Optional" />
              </Field>
              <Field label="GSTIN" error={errors.gstin}>
                <Input
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  placeholder="Optional"
                  maxLength={15}
                  className="uppercase"
                  autoCapitalize="characters"
                />
              </Field>
              <Field label="Bill / Invoice no.">
                <Input value={billNo} onChange={(e) => setBillNo(e.target.value)} placeholder="Optional" />
              </Field>
            </div>
          </div>
        )}
      </div>

      <Field label="Notes / remarks">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was this for?" rows={2} />
      </Field>

      <div
        className={cn(
          'flex gap-2',
          inModal
            ? 'sticky bottom-0 -mx-5 border-t border-line bg-surface px-5 pb-1 pt-3'
            : 'sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-2 rounded-2xl border border-line bg-surface/95 p-1.5 shadow-lg backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none',
        )}
      >
        {editing ? (
          <Button
            size="lg"
            variant="ghost"
            className="text-expense hover:bg-expense-soft hover:text-expense"
            icon={<Trash2 className="size-5" />}
            onClick={() => void removeEntry()}
          >
            Delete
          </Button>
        ) : (
          <Button size="lg" className="flex-1 whitespace-nowrap sm:flex-none" onClick={() => submit(true)()}>
            <span className="sm:hidden">Save & new</span>
            <span className="hidden sm:inline">Save & add another</span>
          </Button>
        )}
        <Button type="submit" size="lg" variant="primary" className="flex-1 whitespace-nowrap" icon={<Check className="size-5" />}>
          {editing ? 'Update entry' : `Save ${type}`}
        </Button>
      </div>
    </form>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-ink-2">
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

function InlineAdd({
  value,
  onChange,
  onAdd,
  onCancel,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  onCancel: () => void;
  placeholder: string;
}) {
  return (
    <div className="flex gap-2">
      <Input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onAdd();
          }
          if (e.key === 'Escape') onCancel();
        }}
      />
      <Button variant="primary" onClick={onAdd} disabled={!value.trim()} aria-label="Add">
        Add
      </Button>
      <Button variant="ghost" onClick={onCancel} aria-label="Cancel" className="px-3">
        <X className="size-4" />
      </Button>
    </div>
  );
}
