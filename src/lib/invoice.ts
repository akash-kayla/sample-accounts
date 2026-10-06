import { addDaysISO, fromISO, fyLabel, todayISO } from './dates';
import { round2, uid } from './format';
import type { Invoice, InvoiceItem, Settings, Voucher } from './types';

export function resolvePrefix(template: string, dateISO: string) {
  const d = fromISO(dateISO || todayISO());
  return template
    .replace(/\{FY\}/g, fyLabel(d).replace(/^20/, ''))
    .replace(/\{YYYY\}/g, String(d.getFullYear()))
    .replace(/\{MM\}/g, String(d.getMonth() + 1).padStart(2, '0'));
}

export function nextInvoiceNumber(invoices: Invoice[], template: string, dateISO: string) {
  const prefix = resolvePrefix(template, dateISO);
  let max = 0;
  for (const inv of invoices) {
    if (!inv.number.startsWith(prefix)) continue;
    const m = /(\d+)\s*$/.exec(inv.number.slice(prefix.length));
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

export function newItem(gstRate: number): InvoiceItem {
  return { id: uid(), description: '', hsn: '', qty: 1, unit: 'Nos', rate: 0, discount: 0, gstRate };
}

export function emptyInvoice(settings: Settings, invoices: Invoice[]): Invoice {
  const date = todayISO();
  return {
    id: '',
    number: nextInvoiceNumber(invoices, settings.invoicePrefix, date),
    date,
    dueDate: addDaysISO(date, 15),
    status: 'draft',
    withGst: true,
    customerLedgerId: null,
    customer: { name: '', address: '', gstin: '', state: settings.company.state || 'Kerala', phone: '', email: '' },
    placeOfSupply: settings.company.state || 'Kerala',
    items: [newItem(settings.defaultGstRate)],
    roundOff: true,
    notes: settings.invoiceNotes,
    terms: settings.invoiceTerms,
    createdAt: 0,
    updatedAt: 0,
  };
}

/** invoiceId → amount received (sum of receipt vouchers linked to the invoice) */
export function invoicePayments(vouchers: Voucher[]) {
  const m = new Map<string, number>();
  for (const v of vouchers) {
    if (!v.invoiceId) continue;
    const amt = v.lines.reduce((s, l) => s + (l.debit || 0), 0);
    m.set(v.invoiceId, round2((m.get(v.invoiceId) ?? 0) + amt));
  }
  return m;
}

export type PayStatus = 'draft' | 'cancelled' | 'paid' | 'partial' | 'overdue' | 'unpaid';

export function payStatus(inv: Invoice, total: number, paid: number, today = todayISO()): PayStatus {
  if (inv.status === 'draft') return 'draft';
  if (inv.status === 'cancelled') return 'cancelled';
  if (paid >= total - 0.005 && total > 0) return 'paid';
  if (inv.dueDate && inv.dueDate < today) return 'overdue';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

export const PAY_STATUS_LABEL: Record<PayStatus, string> = {
  draft: 'Draft',
  cancelled: 'Cancelled',
  paid: 'Paid',
  partial: 'Part paid',
  overdue: 'Overdue',
  unpaid: 'Unpaid',
};
