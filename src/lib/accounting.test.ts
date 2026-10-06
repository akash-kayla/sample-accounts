import { describe, expect, it } from 'vitest';
import { balanceSheet, buildEntries, buildLedgers, ledgerStatement, profitLoss, SYS, trialBalance } from './accounting';
import { amountInWords, evalAmount } from './format';
import { calcGst, calcInvoice } from './gst';
import { nextInvoiceNumber, resolvePrefix } from './invoice';
import type { Category, Invoice, Ledger, Transaction, Voucher } from './types';

const cats: Category[] = [
  { id: 'food', name: 'Food', type: 'expense', color: 'c2', order: 0, createdAt: 0 },
  { id: 'biz', name: 'Business Income', type: 'income', color: 'c1', order: 1, createdAt: 0 },
  { id: 'other', name: 'Other', type: 'both', color: 'c0', order: 2, createdAt: 0 },
];
const stored: Ledger[] = [
  { id: 'cash', name: 'Cash', group: 'cash', openingBalance: 1000, openingType: 'Dr', createdAt: 0 },
  { id: 'bank', name: 'Bank', group: 'bank', openingBalance: 50000, openingType: 'Dr', createdAt: 0 },
  { id: 'cap', name: 'Capital', group: 'capital', openingBalance: 51000, openingType: 'Cr', createdAt: 0 },
  { id: 'cust', name: 'Acme', group: 'customers', openingBalance: 0, openingType: 'Dr', createdAt: 0 },
];

function txn(p: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    date: '2026-10-01',
    type: 'expense',
    categoryId: 'food',
    subcategoryId: null,
    amount: 100,
    paymentMode: 'cash',
    ledgerId: 'cash',
    notes: '',
    gstEnabled: false,
    gstRate: 0,
    gstInclusive: true,
    interState: false,
    taxableAmount: 100,
    cgst: 0,
    sgst: 0,
    igst: 0,
    partyName: '',
    gstin: '',
    billNo: '',
    createdAt: 1,
    updatedAt: 1,
    ...p,
  };
}

describe('GST', () => {
  it('back-calculates inclusive GST and splits CGST/SGST', () => {
    expect(calcGst(1180, 18, true, false)).toMatchObject({ taxable: 1000, cgst: 90, sgst: 90, igst: 0, total: 1180 });
  });
  it('adds exclusive GST as IGST for inter-state', () => {
    expect(calcGst(1000, 18, false, true)).toMatchObject({ taxable: 1000, igst: 180, cgst: 0, total: 1180 });
  });
  it('keeps odd paise balanced between CGST and SGST', () => {
    const g = calcGst(100.01, 5, false, false);
    expect(g.cgst + g.sgst).toBeCloseTo(g.tax, 5);
    expect(g.total).toBeCloseTo(g.taxable + g.tax, 5);
  });
});

describe('invoice', () => {
  const inv: Invoice = {
    id: 'i1',
    number: 'BA/26-27/001',
    date: '2026-10-01',
    dueDate: '',
    status: 'final',
    withGst: true,
    customerLedgerId: 'cust',
    customer: { name: 'Acme', address: '', gstin: '', state: 'Kerala', phone: '', email: '' },
    placeOfSupply: 'Kerala',
    roundOff: true,
    notes: '',
    terms: '',
    createdAt: 0,
    updatedAt: 0,
    items: [
      { id: 'a', description: 'Design', hsn: '', qty: 1, unit: 'Job', rate: 45000, discount: 0, gstRate: 18 },
      { id: 'b', description: 'Creatives', hsn: '', qty: 12, unit: 'Nos', rate: 1750.5, discount: 10, gstRate: 18 },
    ],
  };
  it('computes discount, tax, round off', () => {
    const c = calcInvoice(inv, 'Kerala');
    expect(c.taxable).toBe(63905.4);
    expect(c.cgst + c.sgst).toBeCloseTo(11502.97, 2);
    expect(c.total).toBe(75408);
    expect(c.roundOff).toBeCloseTo(-0.37, 2);
    expect(c.interState).toBe(false);
  });
  it('uses IGST when place of supply is another state', () => {
    const c = calcInvoice({ ...inv, placeOfSupply: 'Karnataka' }, 'Kerala');
    expect(c.interState).toBe(true);
    expect(c.cgst).toBe(0);
    expect(c.igst).toBeCloseTo(11502.97, 2);
  });
  it('numbers invoices per financial year', () => {
    expect(resolvePrefix('BA/{FY}/', '2026-10-06')).toBe('BA/26-27/');
    expect(resolvePrefix('BA/{FY}/', '2027-02-01')).toBe('BA/26-27/');
    expect(nextInvoiceNumber([inv], 'BA/{FY}/', '2026-10-06')).toBe('BA/26-27/002');
    expect(nextInvoiceNumber([inv], 'BA/{FY}/', '2027-04-02')).toBe('BA/27-28/001');
  });
});

describe('double entry books', () => {
  const ledgers = buildLedgers(stored, cats);
  const txns = [
    txn({ amount: 250 }),
    txn({ amount: 1180, gstEnabled: true, gstRate: 18, taxableAmount: 1000, cgst: 90, sgst: 90, ledgerId: 'bank', paymentMode: 'upi' }),
    txn({ type: 'income', categoryId: 'biz', amount: 5900, ledgerId: 'bank', gstEnabled: true, gstRate: 18, taxableAmount: 5000, cgst: 450, sgst: 450 }),
    txn({ type: 'income', categoryId: 'other', amount: 300, ledgerId: 'cash' }),
  ];
  const vouchers: Voucher[] = [
    { id: 'v1', type: 'contra', number: 'CTR-0001', date: '2026-10-02', narration: '', invoiceId: null, createdAt: 2, updatedAt: 2, lines: [{ ledgerId: 'bank', debit: 500, credit: 0 }, { ledgerId: 'cash', debit: 0, credit: 500 }] },
    { id: 'v2', type: 'receipt', number: 'RCT-0001', date: '2026-10-03', narration: '', invoiceId: 'i1', createdAt: 3, updatedAt: 3, lines: [{ ledgerId: 'bank', debit: 10000, credit: 0 }, { ledgerId: 'cust', debit: 0, credit: 10000 }] },
  ];
  const invoice: Invoice = {
    id: 'i1', number: 'X/001', date: '2026-10-02', dueDate: '', status: 'final', withGst: true, customerLedgerId: 'cust',
    customer: { name: 'Acme', address: '', gstin: '', state: 'Karnataka', phone: '', email: '' }, placeOfSupply: 'Karnataka', roundOff: true,
    notes: '', terms: '', createdAt: 4, updatedAt: 4, items: [{ id: 'x', description: 'Ads', hsn: '', qty: 1, unit: 'Job', rate: 20000.4, discount: 0, gstRate: 18 }],
  };
  const entries = buildEntries(txns, vouchers, [invoice], { ledgers, categories: cats, subcategories: [], companyState: 'Kerala' });

  it('every voucher balances', () => {
    for (const e of entries) {
      const dr = e.lines.reduce((s, l) => s + l.debit, 0);
      const cr = e.lines.reduce((s, l) => s + l.credit, 0);
      expect(dr).toBeCloseTo(cr, 2);
    }
  });
  it('trial balance totals match', () => {
    const tb = trialBalance(ledgers, entries, '2026-12-31');
    expect(tb.difference).toBeCloseTo(0, 2);
  });
  it('balance sheet tallies and profit matches P&L', () => {
    const bs = balanceSheet(ledgers, entries, '2026-12-31');
    expect(bs.totalAssets).toBeCloseTo(bs.totalLiabilities, 2);
    const pl = profitLoss(ledgers, entries, { from: '2026-04-01', to: '2027-03-31' });
    expect(pl.net).toBeCloseTo(bs.profit, 2);
    // income 5000 (biz) + 300 (other) + 20000.4→20000 taxable invoice; expenses 250 + 1000 + round-off
    expect(pl.totalIncome).toBeCloseTo(5000 + 300 + 20000.4, 2);
  });
  it('posts GST to input/output ledgers', () => {
    const tb = trialBalance(ledgers, entries, '2026-12-31');
    const get = (id: string) => tb.rows.find((r) => r.ledger.id === id);
    expect(get(SYS.inCgst)?.debit).toBe(90);
    expect(get(SYS.outSgst)?.credit).toBe(450);
    expect(get(SYS.outIgst)?.credit).toBeCloseTo(3600.07, 2);
  });
  it('cash book running balance', () => {
    const st = ledgerStatement(['cash'], ledgers, entries, { from: '2026-10-01', to: '2026-10-31' });
    expect(st.opening).toBe(1000);
    expect(st.closing).toBeCloseTo(1000 - 250 + 300 - 500, 2);
  });
  it('customer owes invoice minus receipt', () => {
    const st = ledgerStatement(['cust'], ledgers, entries, { from: '2026-10-01', to: '2026-10-31' });
    expect(st.closing).toBeCloseTo(23600 - 10000, 2);
  });
});

describe('helpers', () => {
  it('amount in words (Indian system)', () => {
    expect(amountInWords(75408)).toBe('Rupees Seventy Five Thousand Four Hundred Eight Only');
    expect(amountInWords(1234567.5)).toBe('Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Fifty Paise Only');
    expect(amountInWords(25000000)).toBe('Rupees Two Crore Fifty Lakh Only');
  });
  it('evaluates quick sums in the amount box', () => {
    expect(evalAmount('120+45')).toBe(165);
    expect(evalAmount('2*(10.5+4)')).toBe(29);
    expect(evalAmount('1,200')).toBe(1200);
    expect(evalAmount('abc')).toBeNull();
    expect(evalAmount('')).toBeNull();
  });
});
