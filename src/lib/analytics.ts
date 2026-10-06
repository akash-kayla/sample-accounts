import { eachDay, eachMonth, inRange, type DateRange } from './dates';
import { round2 } from './format';
import { txnTax, txnTaxable } from './gst';
import type { Category, EntryType, GstFilter, PaymentMode, Subcategory, Transaction } from './types';

export interface TxnFilter {
  range?: DateRange;
  type?: EntryType | 'all';
  categoryId?: string;
  subcategoryId?: string;
  paymentMode?: PaymentMode | 'all';
  gst?: GstFilter;
  search?: string;
}

export function filterTxns(txns: Transaction[], f: TxnFilter, lookup?: { cats: Map<string, Category>; subs: Map<string, Subcategory> }) {
  const q = f.search?.trim().toLowerCase();
  return txns.filter((t) => {
    if (f.range && !inRange(t.date, f.range)) return false;
    if (f.type && f.type !== 'all' && t.type !== f.type) return false;
    if (f.categoryId && t.categoryId !== f.categoryId) return false;
    if (f.subcategoryId && t.subcategoryId !== f.subcategoryId) return false;
    if (f.paymentMode && f.paymentMode !== 'all' && t.paymentMode !== f.paymentMode) return false;
    if (f.gst === 'gst' && !t.gstEnabled) return false;
    if (f.gst === 'nogst' && t.gstEnabled) return false;
    if (q) {
      const hay = [
        t.notes,
        t.partyName,
        t.billNo,
        t.gstin,
        lookup?.cats.get(t.categoryId)?.name,
        t.subcategoryId ? lookup?.subs.get(t.subcategoryId)?.name : '',
        String(t.amount),
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export interface Totals {
  income: number;
  expense: number;
  net: number;
  count: number;
  expenseCount: number;
  incomeCount: number;
  gstPaid: number; // input tax on expenses
  gstCollected: number; // output tax on income
  expenseWithGst: number;
  expenseWithoutGst: number;
  incomeWithGst: number;
  incomeWithoutGst: number;
  expenseTaxable: number;
  incomeTaxable: number;
}

export function totals(txns: Transaction[]): Totals {
  const t: Totals = {
    income: 0,
    expense: 0,
    net: 0,
    count: txns.length,
    expenseCount: 0,
    incomeCount: 0,
    gstPaid: 0,
    gstCollected: 0,
    expenseWithGst: 0,
    expenseWithoutGst: 0,
    incomeWithGst: 0,
    incomeWithoutGst: 0,
    expenseTaxable: 0,
    incomeTaxable: 0,
  };
  for (const x of txns) {
    const tax = txnTax(x);
    if (x.type === 'expense') {
      t.expense += x.amount;
      t.expenseCount++;
      t.gstPaid += tax;
      t.expenseTaxable += txnTaxable(x);
      if (x.gstEnabled) t.expenseWithGst += x.amount;
      else t.expenseWithoutGst += x.amount;
    } else {
      t.income += x.amount;
      t.incomeCount++;
      t.gstCollected += tax;
      t.incomeTaxable += txnTaxable(x);
      if (x.gstEnabled) t.incomeWithGst += x.amount;
      else t.incomeWithoutGst += x.amount;
    }
  }
  for (const k of Object.keys(t) as (keyof Totals)[]) if (k !== 'count' && k !== 'expenseCount' && k !== 'incomeCount') t[k] = round2(t[k]);
  t.net = round2(t.income - t.expense);
  return t;
}

export interface SubSummary {
  id: string;
  name: string;
  amount: number;
  count: number;
  pct: number;
}

export interface CatSummary {
  categoryId: string;
  name: string;
  color: string;
  type: EntryType;
  amount: number;
  count: number;
  pct: number;
  subs: SubSummary[];
}

export function byCategory(
  txns: Transaction[],
  type: EntryType,
  cats: Map<string, Category>,
  subs: Map<string, Subcategory>,
): CatSummary[] {
  const m = new Map<string, CatSummary & { subMap: Map<string, SubSummary> }>();
  let total = 0;
  for (const t of txns) {
    if (t.type !== type) continue;
    total += t.amount;
    const c = cats.get(t.categoryId);
    let row = m.get(t.categoryId);
    if (!row) {
      row = {
        categoryId: t.categoryId,
        name: c?.name ?? 'Uncategorised',
        color: c?.color ?? 'c0',
        type,
        amount: 0,
        count: 0,
        pct: 0,
        subs: [],
        subMap: new Map(),
      };
      m.set(t.categoryId, row);
    }
    row.amount += t.amount;
    row.count++;
    const sid = t.subcategoryId ?? '_none';
    const s = row.subMap.get(sid) ?? {
      id: sid,
      name: t.subcategoryId ? (subs.get(t.subcategoryId)?.name ?? 'Removed') : 'General',
      amount: 0,
      count: 0,
      pct: 0,
    };
    s.amount += t.amount;
    s.count++;
    row.subMap.set(sid, s);
  }
  return [...m.values()]
    .map(({ subMap, ...r }) => ({
      ...r,
      amount: round2(r.amount),
      pct: total ? (r.amount / total) * 100 : 0,
      subs: [...subMap.values()]
        .map((s) => ({ ...s, amount: round2(s.amount), pct: r.amount ? (s.amount / r.amount) * 100 : 0 }))
        .sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.amount - a.amount);
}

export interface DayPoint {
  date: string;
  income: number;
  expense: number;
  count: number;
}

export function byDay(txns: Transaction[], range: DateRange): DayPoint[] {
  const m = new Map<string, DayPoint>(eachDay(range).map((d) => [d, { date: d, income: 0, expense: 0, count: 0 }]));
  for (const t of txns) {
    const p = m.get(t.date);
    if (!p) continue;
    p[t.type] = round2(p[t.type] + t.amount);
    p.count++;
  }
  return [...m.values()];
}

export interface MonthPoint {
  month: string;
  income: number;
  expense: number;
  count: number;
}

export function byMonth(txns: Transaction[], range: DateRange): MonthPoint[] {
  const m = new Map<string, MonthPoint>(eachMonth(range).map((k) => [k, { month: k, income: 0, expense: 0, count: 0 }]));
  for (const t of txns) {
    if (!inRange(t.date, range)) continue;
    const p = m.get(t.date.slice(0, 7));
    if (!p) continue;
    p[t.type] = round2(p[t.type] + t.amount);
    p.count++;
  }
  return [...m.values()];
}

export function byPaymentMode(txns: Transaction[]) {
  const m = new Map<PaymentMode, { mode: PaymentMode; income: number; expense: number; count: number }>();
  for (const t of txns) {
    const r = m.get(t.paymentMode) ?? { mode: t.paymentMode, income: 0, expense: 0, count: 0 };
    r[t.type] = round2(r[t.type] + t.amount);
    r.count++;
    m.set(t.paymentMode, r);
  }
  return [...m.values()].sort((a, b) => b.expense + b.income - (a.expense + a.income));
}

export function growth(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return ((current - previous) / previous) * 100;
}

export interface RateRow {
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  total: number;
  count: number;
}

export function gstByRate(txns: Transaction[], type: EntryType): RateRow[] {
  const m = new Map<number, RateRow>();
  for (const t of txns) {
    if (t.type !== type || !t.gstEnabled) continue;
    const r = m.get(t.gstRate) ?? { rate: t.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, total: 0, count: 0 };
    r.taxable = round2(r.taxable + t.taxableAmount);
    r.cgst = round2(r.cgst + t.cgst);
    r.sgst = round2(r.sgst + t.sgst);
    r.igst = round2(r.igst + t.igst);
    r.tax = round2(r.tax + t.cgst + t.sgst + t.igst);
    r.total = round2(r.total + t.amount);
    r.count++;
    m.set(t.gstRate, r);
  }
  return [...m.values()].sort((a, b) => a.rate - b.rate);
}
