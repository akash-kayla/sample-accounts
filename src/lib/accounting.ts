import { calcInvoice } from './gst';
import { round2 } from './format';
import type { DateRange } from './dates';
import type {
  Category,
  Invoice,
  Ledger,
  LedgerGroup,
  Subcategory,
  Transaction,
  Voucher,
  VoucherLine,
} from './types';

export type Nature = 'asset' | 'liability' | 'income' | 'expense';

export const GROUPS: Record<LedgerGroup, { label: string; short: string; nature: Nature; order: number }> = {
  cash: { label: 'Cash-in-Hand', short: 'Cash', nature: 'asset', order: 1 },
  bank: { label: 'Bank Accounts', short: 'Bank', nature: 'asset', order: 2 },
  customers: { label: 'Sundry Debtors (Customers)', short: 'Customers', nature: 'asset', order: 3 },
  current_assets: { label: 'Current Assets', short: 'Current Assets', nature: 'asset', order: 4 },
  fixed_assets: { label: 'Fixed Assets', short: 'Fixed Assets', nature: 'asset', order: 5 },
  suppliers: { label: 'Sundry Creditors (Suppliers)', short: 'Suppliers', nature: 'liability', order: 6 },
  duties_taxes: { label: 'Duties & Taxes (GST)', short: 'GST', nature: 'liability', order: 7 },
  current_liabilities: { label: 'Current Liabilities', short: 'Current Liabilities', nature: 'liability', order: 8 },
  loans: { label: 'Loans (Liability)', short: 'Loans', nature: 'liability', order: 9 },
  capital: { label: 'Capital Account', short: 'Capital', nature: 'liability', order: 10 },
  income: { label: 'Income', short: 'Income', nature: 'income', order: 11 },
  expenses: { label: 'Expenses', short: 'Expenses', nature: 'expense', order: 12 },
};

export const GROUP_ORDER = (Object.keys(GROUPS) as LedgerGroup[]).sort((a, b) => GROUPS[a].order - GROUPS[b].order);

export const SYS = {
  sales: 'sys:sales',
  roundOff: 'sys:roundoff',
  suspense: 'sys:suspense',
  inCgst: 'gst:in_cgst',
  inSgst: 'gst:in_sgst',
  inIgst: 'gst:in_igst',
  outCgst: 'gst:out_cgst',
  outSgst: 'gst:out_sgst',
  outIgst: 'gst:out_igst',
} as const;

const VIRTUAL: Omit<Ledger, 'createdAt'>[] = [
  { id: SYS.sales, name: 'Sales Account', group: 'income', openingBalance: 0, openingType: 'Cr', virtual: true },
  { id: SYS.roundOff, name: 'Round Off', group: 'expenses', openingBalance: 0, openingType: 'Dr', virtual: true },
  { id: SYS.inCgst, name: 'Input CGST', group: 'duties_taxes', openingBalance: 0, openingType: 'Dr', virtual: true },
  { id: SYS.inSgst, name: 'Input SGST', group: 'duties_taxes', openingBalance: 0, openingType: 'Dr', virtual: true },
  { id: SYS.inIgst, name: 'Input IGST', group: 'duties_taxes', openingBalance: 0, openingType: 'Dr', virtual: true },
  { id: SYS.outCgst, name: 'Output CGST', group: 'duties_taxes', openingBalance: 0, openingType: 'Cr', virtual: true },
  { id: SYS.outSgst, name: 'Output SGST', group: 'duties_taxes', openingBalance: 0, openingType: 'Cr', virtual: true },
  { id: SYS.outIgst, name: 'Output IGST', group: 'duties_taxes', openingBalance: 0, openingType: 'Cr', virtual: true },
  { id: SYS.suspense, name: 'Suspense A/c', group: 'current_liabilities', openingBalance: 0, openingType: 'Cr', virtual: true },
];

export const catLedgerId = (type: 'expense' | 'income', categoryId: string) => `cat:${type}:${categoryId}`;

/** Stored ledgers + auto ledgers (one per category & type, GST, sales, round off) */
export function buildLedgers(stored: Ledger[], categories: Category[]): Ledger[] {
  const out: Ledger[] = [...stored];
  for (const c of categories) {
    const types: ('expense' | 'income')[] = c.type === 'both' ? ['expense', 'income'] : [c.type];
    for (const t of types) {
      out.push({
        id: catLedgerId(t, c.id),
        name: c.type === 'both' ? `${c.name} ${t === 'expense' ? 'Expenses' : 'Income'}` : c.name,
        group: t === 'expense' ? 'expenses' : 'income',
        openingBalance: 0,
        openingType: t === 'expense' ? 'Dr' : 'Cr',
        virtual: true,
        createdAt: c.createdAt,
      });
    }
  }
  for (const v of VIRTUAL) out.push({ ...v, createdAt: 0 });
  return out;
}

export type VType = 'Payment' | 'Receipt' | 'Journal' | 'Contra' | 'Sales' | 'Purchase';

export interface BookEntry {
  key: string;
  kind: 'txn' | 'voucher' | 'invoice';
  sourceId: string;
  date: string;
  vtype: VType;
  number: string;
  narration: string;
  lines: VoucherLine[];
  amount: number;
  createdAt: number;
}

export const VOUCHER_LABEL: Record<Voucher['type'], VType> = {
  payment: 'Payment',
  receipt: 'Receipt',
  journal: 'Journal',
  contra: 'Contra',
};

function mergeLines(lines: VoucherLine[], known: Set<string>): VoucherLine[] {
  const m = new Map<string, VoucherLine>();
  for (const l of lines) {
    const id = known.has(l.ledgerId) ? l.ledgerId : SYS.suspense;
    const row = m.get(id) ?? { ledgerId: id, debit: 0, credit: 0 };
    row.debit = round2(row.debit + (l.debit || 0));
    row.credit = round2(row.credit + (l.credit || 0));
    m.set(id, row);
  }
  return [...m.values()].filter((l) => l.debit || l.credit);
}

export interface BuildCtx {
  ledgers: Ledger[];
  categories: Category[];
  subcategories: Subcategory[];
  companyState: string;
}

export function txnLines(t: Transaction): VoucherLine[] {
  const tax = t.gstEnabled ? round2(t.cgst + t.sgst + t.igst) : 0;
  const net = round2(t.amount - tax);
  const cat = catLedgerId(t.type, t.categoryId);
  if (t.type === 'expense') {
    const lines: VoucherLine[] = [{ ledgerId: cat, debit: net, credit: 0 }];
    if (t.gstEnabled) {
      if (t.cgst) lines.push({ ledgerId: SYS.inCgst, debit: t.cgst, credit: 0 });
      if (t.sgst) lines.push({ ledgerId: SYS.inSgst, debit: t.sgst, credit: 0 });
      if (t.igst) lines.push({ ledgerId: SYS.inIgst, debit: t.igst, credit: 0 });
    }
    lines.push({ ledgerId: t.ledgerId, debit: 0, credit: round2(t.amount) });
    return lines;
  }
  const lines: VoucherLine[] = [
    { ledgerId: t.ledgerId, debit: round2(t.amount), credit: 0 },
    { ledgerId: cat, debit: 0, credit: net },
  ];
  if (t.gstEnabled) {
    if (t.cgst) lines.push({ ledgerId: SYS.outCgst, debit: 0, credit: t.cgst });
    if (t.sgst) lines.push({ ledgerId: SYS.outSgst, debit: 0, credit: t.sgst });
    if (t.igst) lines.push({ ledgerId: SYS.outIgst, debit: 0, credit: t.igst });
  }
  return lines;
}

export function invoiceLines(inv: Invoice, companyState: string): VoucherLine[] {
  const c = calcInvoice(inv, companyState);
  const lines: VoucherLine[] = [
    { ledgerId: inv.customerLedgerId ?? SYS.suspense, debit: c.total, credit: 0 },
    { ledgerId: SYS.sales, debit: 0, credit: c.taxable },
  ];
  if (c.cgst) lines.push({ ledgerId: SYS.outCgst, debit: 0, credit: c.cgst });
  if (c.sgst) lines.push({ ledgerId: SYS.outSgst, debit: 0, credit: c.sgst });
  if (c.igst) lines.push({ ledgerId: SYS.outIgst, debit: 0, credit: c.igst });
  if (c.roundOff > 0) lines.push({ ledgerId: SYS.roundOff, debit: 0, credit: c.roundOff });
  if (c.roundOff < 0) lines.push({ ledgerId: SYS.roundOff, debit: -c.roundOff, credit: 0 });
  return lines;
}

export function buildEntries(
  txns: Transaction[],
  vouchers: Voucher[],
  invoices: Invoice[],
  ctx: BuildCtx,
): BookEntry[] {
  const known = new Set(ctx.ledgers.map((l) => l.id));
  const byId = new Map(ctx.ledgers.map((l) => [l.id, l]));
  const cats = new Map(ctx.categories.map((c) => [c.id, c]));
  const subs = new Map(ctx.subcategories.map((s) => [s.id, s]));
  const out: BookEntry[] = [];

  for (const t of txns) {
    const counter = byId.get(t.ledgerId);
    const cashBank = counter && (counter.group === 'cash' || counter.group === 'bank');
    const vtype: VType = t.type === 'expense' ? (cashBank ? 'Payment' : 'Purchase') : cashBank ? 'Receipt' : 'Sales';
    const cat = cats.get(t.categoryId)?.name ?? 'Uncategorised';
    const sub = t.subcategoryId ? subs.get(t.subcategoryId)?.name : undefined;
    const lines = mergeLines(txnLines(t), known);
    out.push({
      key: `t:${t.id}`,
      kind: 'txn',
      sourceId: t.id,
      date: t.date,
      vtype,
      number: t.billNo || '',
      narration: [sub ? `${cat} › ${sub}` : cat, t.notes].filter(Boolean).join(' — '),
      lines,
      amount: round2(lines.reduce((s, l) => s + l.debit, 0)),
      createdAt: t.createdAt,
    });
  }

  for (const v of vouchers) {
    const lines = mergeLines(v.lines, known);
    out.push({
      key: `v:${v.id}`,
      kind: 'voucher',
      sourceId: v.id,
      date: v.date,
      vtype: VOUCHER_LABEL[v.type],
      number: v.number,
      narration: v.narration,
      lines,
      amount: round2(lines.reduce((s, l) => s + l.debit, 0)),
      createdAt: v.createdAt,
    });
  }

  for (const inv of invoices) {
    if (inv.status !== 'final') continue;
    const lines = mergeLines(invoiceLines(inv, ctx.companyState), known);
    out.push({
      key: `i:${inv.id}`,
      kind: 'invoice',
      sourceId: inv.id,
      date: inv.date,
      vtype: 'Sales',
      number: inv.number,
      narration: `Invoice to ${inv.customer.name || 'customer'}`,
      lines,
      amount: round2(lines.reduce((s, l) => s + l.debit, 0)),
      createdAt: inv.createdAt,
    });
  }

  out.sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));
  return out;
}

export const signedOpening = (l: Ledger) => (l.openingType === 'Dr' ? 1 : -1) * (l.openingBalance || 0);

export interface Bal {
  opening: number; // Dr positive
  debit: number;
  credit: number;
  closing: number; // Dr positive
}

/** Balances for every ledger. Opening = ledger opening + net movement before range.from. */
export function computeBalances(ledgers: Ledger[], entries: BookEntry[], range: Partial<DateRange> = {}): Map<string, Bal> {
  const m = new Map<string, Bal>();
  for (const l of ledgers) {
    const o = signedOpening(l);
    m.set(l.id, { opening: o, debit: 0, credit: 0, closing: o });
  }
  for (const e of entries) {
    if (range.to && e.date > range.to) continue;
    const before = range.from ? e.date < range.from : false;
    for (const ln of e.lines) {
      let b = m.get(ln.ledgerId);
      if (!b) {
        b = { opening: 0, debit: 0, credit: 0, closing: 0 };
        m.set(ln.ledgerId, b);
      }
      if (before) b.opening = round2(b.opening + ln.debit - ln.credit);
      else {
        b.debit = round2(b.debit + ln.debit);
        b.credit = round2(b.credit + ln.credit);
      }
    }
  }
  for (const b of m.values()) b.closing = round2(b.opening + b.debit - b.credit);
  return m;
}

export interface StatementRow {
  entry: BookEntry;
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface Statement {
  opening: number;
  rows: StatementRow[];
  debit: number;
  credit: number;
  closing: number;
}

function names(ids: string[], byId: Map<string, Ledger>) {
  const list = ids.map((id) => byId.get(id)?.name ?? 'Unknown');
  if (list.length <= 2) return list.join(', ');
  return `${list[0]} + ${list.length - 1} more`;
}

/** Ledger account / Cash Book / Bank Book (pass several ledger ids for a combined book) */
export function ledgerStatement(ids: string[], ledgers: Ledger[], entries: BookEntry[], range: DateRange): Statement {
  const set = new Set(ids);
  const byId = new Map(ledgers.map((l) => [l.id, l]));
  let opening = 0;
  for (const id of ids) {
    const l = byId.get(id);
    if (l) opening += signedOpening(l);
  }
  const rows: StatementRow[] = [];
  let debit = 0;
  let credit = 0;
  for (const e of entries) {
    if (e.date > range.to) continue;
    let d = 0;
    let c = 0;
    for (const ln of e.lines) {
      if (set.has(ln.ledgerId)) {
        d += ln.debit;
        c += ln.credit;
      }
    }
    if (!d && !c) continue;
    if (e.date < range.from) {
      opening = round2(opening + d - c);
      continue;
    }
    // Opposite side ledgers are the "particulars"
    const others = e.lines.filter((ln) => !set.has(ln.ledgerId));
    const opp = others.filter((ln) => (d >= c ? ln.credit > 0 : ln.debit > 0)).map((ln) => ln.ledgerId);
    debit = round2(debit + d);
    credit = round2(credit + c);
    rows.push({
      entry: e,
      particulars: opp.length ? names(opp, byId) : names(others.map((o) => o.ledgerId), byId) || '—',
      debit: round2(d),
      credit: round2(c),
      balance: 0,
    });
  }
  let run = round2(opening);
  for (const r of rows) {
    run = round2(run + r.debit - r.credit);
    r.balance = run;
  }
  return { opening: round2(opening), rows, debit, credit, closing: run };
}

export interface TBRow {
  ledger: Ledger;
  debit: number;
  credit: number;
}

export function trialBalance(ledgers: Ledger[], entries: BookEntry[], asOf: string) {
  const bal = computeBalances(ledgers, entries, { to: asOf });
  const rows: TBRow[] = [];
  for (const l of ledgers) {
    const b = bal.get(l.id);
    if (!b || Math.abs(b.closing) < 0.005) continue;
    rows.push({ ledger: l, debit: b.closing > 0 ? b.closing : 0, credit: b.closing < 0 ? -b.closing : 0 });
  }
  rows.sort((a, b) => GROUPS[a.ledger.group].order - GROUPS[b.ledger.group].order || a.ledger.name.localeCompare(b.ledger.name));
  const debit = round2(rows.reduce((s, r) => s + r.debit, 0));
  const credit = round2(rows.reduce((s, r) => s + r.credit, 0));
  return { rows, debit, credit, difference: round2(debit - credit) };
}

export interface PLRow {
  ledger: Ledger;
  amount: number;
}

export function profitLoss(ledgers: Ledger[], entries: BookEntry[], range: DateRange) {
  const bal = computeBalances(ledgers, entries, range);
  const income: PLRow[] = [];
  const expenses: PLRow[] = [];
  for (const l of ledgers) {
    const b = bal.get(l.id);
    if (!b) continue;
    const nature = GROUPS[l.group].nature;
    const movement = round2(b.debit - b.credit);
    if (Math.abs(movement) < 0.005) continue;
    if (nature === 'income') income.push({ ledger: l, amount: -movement });
    if (nature === 'expense') expenses.push({ ledger: l, amount: movement });
  }
  income.sort((a, b) => b.amount - a.amount);
  expenses.sort((a, b) => b.amount - a.amount);
  const totalIncome = round2(income.reduce((s, r) => s + r.amount, 0));
  const totalExpense = round2(expenses.reduce((s, r) => s + r.amount, 0));
  return { income, expenses, totalIncome, totalExpense, net: round2(totalIncome - totalExpense) };
}

export interface BSGroup {
  group: LedgerGroup;
  label: string;
  total: number;
  rows: { ledger: Ledger; amount: number }[];
}

export function balanceSheet(ledgers: Ledger[], entries: BookEntry[], asOf: string) {
  const bal = computeBalances(ledgers, entries, { to: asOf });
  const groups = new Map<LedgerGroup, { ledger: Ledger; closing: number }[]>();
  let profit = 0;
  let openingDiff = 0;
  for (const l of ledgers) {
    openingDiff += signedOpening(l);
    const b = bal.get(l.id);
    if (!b) continue;
    const nature = GROUPS[l.group].nature;
    if (nature === 'income' || nature === 'expense') {
      profit -= b.closing;
      continue;
    }
    if (Math.abs(b.closing) < 0.005) continue;
    const arr = groups.get(l.group) ?? [];
    arr.push({ ledger: l, closing: b.closing });
    groups.set(l.group, arr);
  }
  const assets: BSGroup[] = [];
  const liabilities: BSGroup[] = [];
  for (const g of GROUP_ORDER) {
    const arr = groups.get(g);
    if (!arr?.length) continue;
    const net = round2(arr.reduce((s, r) => s + r.closing, 0));
    const nature = GROUPS[g].nature;
    const onAssetSide = nature === 'asset' || (g === 'duties_taxes' && net > 0);
    const sign = onAssetSide ? 1 : -1;
    const grp: BSGroup = {
      group: g,
      label: g === 'duties_taxes' && onAssetSide ? 'Duties & Taxes (GST credit)' : GROUPS[g].label,
      total: round2(sign * net),
      rows: arr.map((r) => ({ ledger: r.ledger, amount: round2(sign * r.closing) })).sort((a, b) => b.amount - a.amount),
    };
    (onAssetSide ? assets : liabilities).push(grp);
  }
  profit = round2(profit);
  openingDiff = round2(openingDiff);
  const totalAssets = round2(assets.reduce((s, g) => s + g.total, 0) + (openingDiff < 0 ? -openingDiff : 0));
  const totalLiabilities = round2(liabilities.reduce((s, g) => s + g.total, 0) + profit + (openingDiff > 0 ? openingDiff : 0));
  return { assets, liabilities, profit, openingDiff, totalAssets, totalLiabilities };
}

export function drcr(n: number) {
  if (Math.abs(n) < 0.005) return '';
  return n > 0 ? 'Dr' : 'Cr';
}

export function nextVoucherNumber(vouchers: Voucher[], type: Voucher['type']) {
  const prefix = { payment: 'PMT', receipt: 'RCT', journal: 'JRN', contra: 'CTR' }[type];
  let max = 0;
  for (const v of vouchers) {
    if (v.type !== type) continue;
    const m = /(\d+)\s*$/.exec(v.number);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}
