import { round2 } from './format';
import type { Invoice, InvoiceItem, Transaction } from './types';

export interface GstBreakup {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  total: number;
}

/**
 * @param amount  the amount the user typed
 * @param inclusive true = amount already includes GST (back-calculate), false = add GST on top
 */
export function calcGst(amount: number, rate: number, inclusive: boolean, interState: boolean): GstBreakup {
  const a = Math.max(0, amount || 0);
  const r = Math.max(0, rate || 0);
  let taxable: number;
  let tax: number;
  if (inclusive) {
    taxable = round2((a * 100) / (100 + r));
    tax = round2(a - taxable);
  } else {
    taxable = round2(a);
    tax = round2((a * r) / 100);
  }
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (interState) igst = tax;
  else {
    cgst = round2(tax / 2);
    sgst = round2(tax - cgst);
  }
  return { taxable, cgst, sgst, igst, tax, total: round2(taxable + tax) };
}

export const txnTax = (t: Transaction) => (t.gstEnabled ? round2(t.cgst + t.sgst + t.igst) : 0);
export const txnTaxable = (t: Transaction) => (t.gstEnabled ? t.taxableAmount : t.amount);

export interface InvoiceLineCalc {
  item: InvoiceItem;
  gross: number;
  discount: number;
  taxable: number;
  tax: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface InvoiceCalc {
  lines: InvoiceLineCalc[];
  gross: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  roundOff: number;
  total: number;
  interState: boolean;
  /** rate → totals, for the tax summary table */
  byRate: { rate: number; taxable: number; cgst: number; sgst: number; igst: number; tax: number }[];
}

export function isInterState(companyState: string, placeOfSupply: string) {
  if (!placeOfSupply || !companyState) return false;
  return companyState.trim().toLowerCase() !== placeOfSupply.trim().toLowerCase();
}

export function calcInvoice(inv: Pick<Invoice, 'items' | 'withGst' | 'placeOfSupply' | 'roundOff'>, companyState: string): InvoiceCalc {
  const interState = inv.withGst && isInterState(companyState, inv.placeOfSupply);
  const byRate = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number; tax: number }>();
  const lines = inv.items.map((item) => {
    const gross = round2((item.qty || 0) * (item.rate || 0));
    const discount = round2((gross * (item.discount || 0)) / 100);
    const taxable = round2(gross - discount);
    const rate = inv.withGst ? item.gstRate || 0 : 0;
    const g = calcGst(taxable, rate, false, interState);
    if (inv.withGst) {
      const row = byRate.get(rate) ?? { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0 };
      row.taxable = round2(row.taxable + taxable);
      row.cgst = round2(row.cgst + g.cgst);
      row.sgst = round2(row.sgst + g.sgst);
      row.igst = round2(row.igst + g.igst);
      row.tax = round2(row.tax + g.tax);
      byRate.set(rate, row);
    }
    return { item, gross, discount, taxable, tax: g.tax, cgst: g.cgst, sgst: g.sgst, igst: g.igst, total: g.total };
  });
  const sum = (k: keyof Omit<InvoiceLineCalc, 'item'>) => round2(lines.reduce((s, l) => s + l[k], 0));
  const taxable = sum('taxable');
  const cgst = sum('cgst');
  const sgst = sum('sgst');
  const igst = sum('igst');
  const tax = round2(cgst + sgst + igst);
  const exact = round2(taxable + tax);
  const total = inv.roundOff ? Math.round(exact) : exact;
  return {
    lines,
    gross: sum('gross'),
    discount: sum('discount'),
    taxable,
    cgst,
    sgst,
    igst,
    tax,
    roundOff: round2(total - exact),
    total,
    interState,
    byRate: [...byRate.values()].sort((a, b) => a.rate - b.rate),
  };
}

export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
