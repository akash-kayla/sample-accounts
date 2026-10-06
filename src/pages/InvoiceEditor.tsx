import { ArrowLeft, Ban, Check, Copy, Download, Ellipsis, Eye, HandCoins, Plus, Printer, Save, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { InvoicePreview } from '../components/InvoicePreview';
import { RecordPaymentModal } from '../components/RecordPayment';
import { Badge, Button, Card, CardHeader, Chip, cn, Field, IconButton, Input, Menu, MenuItem, Segmented, Select, Switch, Textarea, useConfirm } from '../components/ui';
import { exportInvoicePdf } from '../export/invoicePdf';
import { addDaysISO, todayISO } from '../lib/dates';
import { INDIAN_STATES, UNITS } from '../lib/defaults';
import { money, num, parseAmount } from '../lib/format';
import { calcInvoice, GSTIN_RE } from '../lib/gst';
import { emptyInvoice, newItem, nextInvoiceNumber, PAY_STATUS_LABEL, payStatus } from '../lib/invoice';
import type { Invoice, InvoiceItem, InvoiceParty } from '../lib/types';
import { useData } from '../store/data';

export default function InvoiceEditor() {
  const { id } = useParams();
  const data = useData();
  const { invoices, settings, storedLedgers, currency } = data;
  const nav = useNavigate();
  const confirm = useConfirm();
  const location = useLocation();
  const handoff = (location.state as { inv?: Invoice } | null)?.inv;
  const existing = id ? (invoices.find((i) => i.id === id) ?? (handoff?.id === id ? handoff : undefined)) : undefined;
  const [inv, setInv] = useState<Invoice>(() => existing ?? emptyInvoice(settings, invoices));
  const [posTouched, setPosTouched] = useState(!!existing);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);

  // keep in sync when the stored copy changes (e.g. after first save)
  useEffect(() => {
    if (existing && existing.updatedAt > inv.updatedAt) setInv(existing);
  }, [existing]);

  useEffect(() => {
    if (id && !existing) {
      const t = setTimeout(() => {
        toast.error('Invoice not found');
        nav('/invoices', { replace: true });
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [id, existing, nav]);

  const customers = useMemo(() => storedLedgers.filter((l) => l.group === 'customers').sort((a, b) => a.name.localeCompare(b.name)), [storedLedgers]);
  const calc = calcInvoice(inv, settings.company.state);
  const paid = id ? (data.payments.get(id) ?? 0) : 0;
  const status = payStatus(inv, calc.total, paid);
  const dupNumber = invoices.some((i) => i.id !== id && i.number.trim() === inv.number.trim());

  const patch = (p: Partial<Invoice>) => setInv((v) => ({ ...v, ...p }));
  const patchCustomer = (p: Partial<InvoiceParty>) =>
    setInv((v) => {
      const customer = { ...v.customer, ...p };
      return { ...v, customer, placeOfSupply: !posTouched && p.state ? p.state : v.placeOfSupply };
    });
  const patchItem = (itemId: string, p: Partial<InvoiceItem>) => setInv((v) => ({ ...v, items: v.items.map((it) => (it.id === itemId ? { ...it, ...p } : it)) }));

  const pickCustomer = (ledgerId: string) => {
    if (!ledgerId) return patch({ customerLedgerId: null, customer: { name: '', address: '', gstin: '', state: settings.company.state, phone: '', email: '' } });
    const l = storedLedgers.find((x) => x.id === ledgerId);
    if (!l) return;
    const state = l.state || settings.company.state;
    setInv((v) => ({
      ...v,
      customerLedgerId: l.id,
      customer: { name: l.name, address: l.address ?? '', gstin: l.gstin ?? '', state, phone: l.phone ?? '', email: l.email ?? '' },
      placeOfSupply: posTouched ? v.placeOfSupply : state,
    }));
  };

  const validate = (finalising: boolean) => {
    if (!inv.number.trim()) return 'Invoice number is required';
    if (dupNumber) return `Invoice number ${inv.number} is already used`;
    if (finalising && !inv.customer.name.trim()) return 'Add the customer name';
    if (inv.customer.gstin && !GSTIN_RE.test(inv.customer.gstin)) return 'Customer GSTIN looks invalid';
    const valid = inv.items.filter((i) => i.description.trim() && i.qty > 0 && i.rate > 0);
    if (finalising && !valid.length) return 'Add at least one item with description, quantity and rate';
    return null;
  };

  const save = (nextStatus: Invoice['status']) => {
    const err = validate(nextStatus === 'final');
    if (err) {
      toast.error(err);
      return null;
    }
    let customerLedgerId = inv.customerLedgerId;
    const c = inv.customer;
    if (c.name.trim()) {
      const fields = { name: c.name.trim(), address: c.address, gstin: c.gstin.toUpperCase(), state: c.state, phone: c.phone, email: c.email };
      if (customerLedgerId && storedLedgers.some((l) => l.id === customerLedgerId)) data.updateLedger(customerLedgerId, fields);
      else {
        const match = customers.find((l) => l.name.trim().toLowerCase() === c.name.trim().toLowerCase());
        customerLedgerId = match ? match.id : data.addLedger({ ...fields, group: 'customers', openingBalance: 0, openingType: 'Dr' });
      }
    }
    const items = inv.items.filter((i) => i.description.trim() || i.rate > 0);
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = inv;
    const payload = { ...rest, items: items.length ? items : inv.items, status: nextStatus, customerLedgerId, customer: { ...c, gstin: c.gstin.toUpperCase() } };
    const savedId = data.saveInvoice(payload, id);
    setInv((v) => ({ ...v, ...payload, id: savedId, updatedAt: Date.now() }));
    toast.success(nextStatus === 'final' ? (inv.status === 'final' ? 'Invoice updated' : 'Invoice saved & posted to books') : nextStatus === 'cancelled' ? 'Invoice cancelled' : 'Draft saved');
    const saved = { ...inv, ...payload, id: savedId, updatedAt: Date.now() };
    if (!id) nav(`/invoices/${savedId}`, { replace: true, state: { inv: saved } });
    return saved;
  };

  const pdf = async (mode: 'download' | 'open') => {
    setBusy(true);
    const t = toast.loading('Preparing PDF…');
    try {
      await exportInvoicePdf(inv, settings, paid, mode);
      toast.success(mode === 'open' ? 'PDF opened' : 'Invoice downloaded', { id: t });
    } catch (e) {
      console.error(e);
      toast.error('Could not create PDF', { id: t });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!id) return nav('/invoices');
    const ok = await confirm({ title: `Delete invoice ${inv.number}?`, message: 'Payments recorded against it are deleted too.', confirmText: 'Delete', danger: true });
    if (!ok) return;
    await data.deleteInvoice(id);
    toast.success('Invoice deleted');
    nav('/invoices');
  };

  const duplicate = () => {
    const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = inv;
    const date = todayISO();
    const nid = data.saveInvoice({ ...rest, status: 'draft', date, number: nextInvoiceNumber(invoices, settings.invoicePrefix, date) });
    toast.success('Duplicated as a new draft');
    nav(`/invoices/${nid}`);
  };

  const gstRates = settings.gstRates;

  return (
    <div className="pb-24">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link to="/invoices">
          <IconButton label="Back to invoices" className="border border-line bg-surface">
            <ArrowLeft className="size-5" />
          </IconButton>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{id ? inv.number : 'New invoice'}</h1>
            <Badge tone={status === 'paid' ? 'income' : status === 'overdue' ? 'expense' : status === 'draft' || status === 'cancelled' ? 'neutral' : 'warn'}>
              {PAY_STATUS_LABEL[status]}
            </Badge>
          </div>
          <p className="text-sm text-muted">{inv.withGst ? 'Tax invoice (GST)' : 'Invoice without GST'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button icon={<Download className="size-4" />} onClick={() => void pdf('download')} loading={busy} className="hidden sm:inline-flex">
            PDF
          </Button>
          <Menu
            trigger={(p) => (
              <IconButton label="More actions" {...p} className="border border-line bg-surface">
                <Ellipsis className="size-5" />
              </IconButton>
            )}
          >
            {(close) => (
              <>
                <MenuItem icon={<Download />} onClick={() => (close(), void pdf('download'))}>
                  Download PDF
                </MenuItem>
                <MenuItem icon={<Printer />} onClick={() => (close(), void pdf('open'))}>
                  Open PDF to print / share
                </MenuItem>
                {id && inv.status === 'final' && status !== 'paid' && (
                  <MenuItem icon={<HandCoins />} onClick={() => (close(), setPaying(true))}>
                    Record payment
                  </MenuItem>
                )}
                {id && (
                  <MenuItem icon={<Copy />} onClick={() => (close(), duplicate())}>
                    Duplicate
                  </MenuItem>
                )}
                {id && inv.status === 'final' && (
                  <MenuItem icon={<Ban />} onClick={() => (close(), save('cancelled'))}>
                    Cancel invoice
                  </MenuItem>
                )}
                <MenuItem icon={<Trash2 />} danger onClick={() => (close(), void remove())}>
                  Delete
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </div>

      <div className="mb-4 xl:hidden">
        <Segmented
          full
          value={tab}
          onChange={setTab}
          options={[
            { value: 'edit', label: 'Edit' },
            { value: 'preview', label: <><Eye className="size-4" /> Preview</> },
          ]}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={cn('space-y-4', tab === 'preview' && 'hidden xl:block')}>
          <Card className="p-4 sm:p-5">
            <div className="mb-4">
              <Segmented
                full
                value={inv.withGst ? 'gst' : 'nogst'}
                onChange={(v) => patch({ withGst: v === 'gst' })}
                options={[
                  { value: 'gst', label: 'With GST (Tax invoice)' },
                  { value: 'nogst', label: 'Without GST' },
                ]}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Invoice no." error={dupNumber && 'Already used'}>
                <Input value={inv.number} onChange={(e) => patch({ number: e.target.value })} />
              </Field>
              <Field label="Invoice date">
                <Input type="date" value={inv.date} onChange={(e) => e.target.value && patch({ date: e.target.value })} />
              </Field>
              <Field label="Due date">
                <Input type="date" value={inv.dueDate} min={inv.date} onChange={(e) => patch({ dueDate: e.target.value })} />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                ['On receipt', 0],
                ['7 days', 7],
                ['15 days', 15],
                ['30 days', 30],
                ['45 days', 45],
              ].map(([l, d]) => (
                <Chip key={l as string} active={inv.dueDate === addDaysISO(inv.date, d as number)} onClick={() => patch({ dueDate: addDaysISO(inv.date, d as number) })}>
                  {l}
                </Chip>
              ))}
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <h3 className="mb-4 text-[15px] font-semibold">Bill to</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Customer" className="sm:col-span-2" hint={customers.length ? undefined : 'New customers are saved to your ledgers automatically.'}>
                <Select value={inv.customerLedgerId ?? ''} onChange={(e) => pickCustomer(e.target.value)}>
                  <option value="">＋ New customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Customer / company name" className="sm:col-span-2">
                <Input value={inv.customer.name} onChange={(e) => patchCustomer({ name: e.target.value })} placeholder="e.g. Hilite Builders Pvt Ltd" />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Textarea rows={2} value={inv.customer.address} onChange={(e) => patchCustomer({ address: e.target.value })} placeholder="Street, city, PIN" />
              </Field>
              <Field label="Phone">
                <Input value={inv.customer.phone} onChange={(e) => patchCustomer({ phone: e.target.value })} inputMode="tel" />
              </Field>
              <Field label="Email">
                <Input value={inv.customer.email} onChange={(e) => patchCustomer({ email: e.target.value })} type="email" />
              </Field>
              <Field label="State">
                <Select value={inv.customer.state} onChange={(e) => patchCustomer({ state: e.target.value })}>
                  {INDIAN_STATES.map((s) => (
                    <option key={s.code} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="GSTIN" error={inv.customer.gstin && !GSTIN_RE.test(inv.customer.gstin) ? 'Invalid GSTIN' : null}>
                <Input value={inv.customer.gstin} onChange={(e) => patchCustomer({ gstin: e.target.value.toUpperCase() })} maxLength={15} className="uppercase" placeholder="Optional" />
              </Field>
              {inv.withGst && (
                <Field label="Place of supply" className="sm:col-span-2" hint={calc.interState ? 'Different state → IGST applies' : `Same state as ${settings.company.state} → CGST + SGST`}>
                  <Select
                    value={inv.placeOfSupply}
                    onChange={(e) => {
                      setPosTouched(true);
                      patch({ placeOfSupply: e.target.value });
                    }}
                  >
                    {INDIAN_STATES.map((s) => (
                      <option key={s.code} value={s.name}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Items" subtitle={`${inv.items.length} line${inv.items.length > 1 ? 's' : ''}`} />
            <div className="mt-3 space-y-3 px-4 pb-4 sm:px-5">
              {inv.items.map((it, idx) => {
                const line = calc.lines[idx]!;
                return (
                  <div key={it.id} className="rounded-xl border border-line bg-surface-2/40 p-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-2.5 w-5 text-center text-xs font-bold text-muted">{idx + 1}</span>
                      <div className="grid flex-1 gap-2">
                        <Input value={it.description} onChange={(e) => patchItem(it.id, { description: e.target.value })} placeholder="Description (e.g. Social media campaign — Oct)" />
                        <div className={cn('grid gap-2', inv.withGst ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4')}>
                          {inv.withGst && (
                            <Field label="HSN/SAC">
                              <Input value={it.hsn} onChange={(e) => patchItem(it.id, { hsn: e.target.value })} placeholder="998361" className="h-10" />
                            </Field>
                          )}
                          <Field label="Qty">
                            <Input inputMode="decimal" value={it.qty || ''} onChange={(e) => patchItem(it.id, { qty: parseAmount(e.target.value) })} className="h-10" />
                          </Field>
                          <Field label="Unit">
                            <Select value={it.unit} onChange={(e) => patchItem(it.id, { unit: e.target.value })} className="h-10">
                              {[...new Set([...UNITS, it.unit])].filter(Boolean).map((u) => (
                                <option key={u}>{u}</option>
                              ))}
                            </Select>
                          </Field>
                          <Field label="Rate">
                            <Input inputMode="decimal" value={it.rate || ''} onChange={(e) => patchItem(it.id, { rate: parseAmount(e.target.value) })} className="h-10" placeholder="0.00" />
                          </Field>
                          <Field label="Disc. %">
                            <Input inputMode="decimal" value={it.discount || ''} onChange={(e) => patchItem(it.id, { discount: Math.min(100, parseAmount(e.target.value)) })} className="h-10" placeholder="0" />
                          </Field>
                          {inv.withGst && (
                            <Field label="GST %">
                              <Select value={it.gstRate} onChange={(e) => patchItem(it.id, { gstRate: Number(e.target.value) })} className="h-10">
                                {[...new Set([...gstRates, it.gstRate])].map((r) => (
                                  <option key={r} value={r}>
                                    {r}%
                                  </option>
                                ))}
                              </Select>
                            </Field>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted">
                          <span>
                            {inv.withGst && line.tax > 0 ? `Taxable ${num(line.taxable)} + GST ${num(line.tax)}` : line.discount > 0 ? `After ${it.discount}% discount` : ''}
                          </span>
                          <span className="tabular text-sm font-bold text-ink">{money(inv.withGst ? line.total : line.taxable, currency)}</span>
                        </div>
                      </div>
                      <IconButton
                        label="Remove item"
                        disabled={inv.items.length === 1}
                        onClick={() => patch({ items: inv.items.filter((x) => x.id !== it.id) })}
                        className="size-9 hover:bg-expense-soft hover:text-expense"
                      >
                        <X className="size-4" />
                      </IconButton>
                    </div>
                  </div>
                );
              })}
              <Button icon={<Plus className="size-4" />} onClick={() => patch({ items: [...inv.items, newItem(settings.defaultGstRate)] })} className="w-full border-dashed">
                Add item
              </Button>
            </div>
            <div className="space-y-1.5 border-t border-line bg-surface-2/40 px-4 py-4 text-sm sm:px-5">
              {calc.discount > 0 && <TotalRow k="Discount" v={`− ${money(calc.discount, currency)}`} />}
              <TotalRow k={inv.withGst ? 'Taxable amount' : 'Sub total'} v={money(calc.taxable, currency)} />
              {inv.withGst &&
                (calc.interState ? (
                  <TotalRow k="IGST" v={money(calc.igst, currency)} />
                ) : (
                  <>
                    <TotalRow k="CGST" v={money(calc.cgst, currency)} />
                    <TotalRow k="SGST" v={money(calc.sgst, currency)} />
                  </>
                ))}
              <div className="flex items-center justify-between py-1">
                <Switch checked={inv.roundOff} onChange={(v) => patch({ roundOff: v })} label={<span className="text-sm font-normal text-ink-2">Round off</span>} />
                <span className="tabular text-ink-2">{calc.roundOff ? `${calc.roundOff > 0 ? '+' : '−'} ${money(Math.abs(calc.roundOff), currency)}` : '—'}</span>
              </div>
              <div className="flex items-center justify-between border-t border-line pt-2 text-base font-bold">
                <span>Total</span>
                <span className="tabular">{money(calc.total, currency)}</span>
              </div>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="grid gap-4">
              <Field label="Notes (shown on invoice)">
                <Textarea rows={2} value={inv.notes} onChange={(e) => patch({ notes: e.target.value })} />
              </Field>
              <Field label="Terms & conditions">
                <Textarea rows={3} value={inv.terms} onChange={(e) => patch({ terms: e.target.value })} />
              </Field>
            </div>
          </Card>
        </div>

        <div className={cn('xl:sticky xl:top-6 xl:self-start', tab === 'edit' && 'hidden xl:block')}>
          <InvoicePreview inv={inv} settings={settings} paid={paid} />
          {inv.status === 'final' && <p className="mt-3 text-center text-xs text-muted">Posted to books as a Sales voucher: Dr customer, Cr Sales + Output GST.</p>}
        </div>
      </div>

      {/* action bar */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-64 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center gap-2">
          <div className="hidden min-w-0 flex-1 sm:block">
            <p className="text-xs text-muted">Total</p>
            <p className="tabular text-lg font-bold">{money(calc.total, currency)}</p>
          </div>
          {inv.status !== 'final' ? (
            <>
              <Button icon={<Save className="size-4" />} onClick={() => save('draft')} className="flex-1 whitespace-nowrap sm:flex-none">
                <span className="sm:hidden">Draft</span>
                <span className="hidden sm:inline">Save draft</span>
              </Button>
              <Button variant="primary" icon={<Check className="size-4" />} onClick={() => save('final')} className="flex-1 whitespace-nowrap sm:flex-none">
                <span className="sm:hidden">Finalise</span>
                <span className="hidden sm:inline">Save & finalise</span>
              </Button>
            </>
          ) : (
            <>
              {status !== 'paid' && (
                <Button icon={<HandCoins className="size-4" />} onClick={() => setPaying(true)} className="flex-1 whitespace-nowrap sm:flex-none">
                  <span className="sm:hidden">Payment</span>
                  <span className="hidden sm:inline">Record payment</span>
                </Button>
              )}
              <Button variant="primary" icon={<Save className="size-4" />} onClick={() => save('final')} className="flex-1 whitespace-nowrap sm:flex-none">
                <span className="sm:hidden">Save</span>
                <span className="hidden sm:inline">Save changes</span>
              </Button>
            </>
          )}
          <Button icon={<Download className="size-4" />} onClick={() => void pdf('download')} loading={busy} className="sm:hidden" aria-label="Download PDF" />
        </div>
      </div>

      {paying && id && <RecordPaymentModal invoice={{ ...inv, id }} onClose={() => setPaying(false)} />}
    </div>
  );
}

function TotalRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between text-ink-2">
      <span>{k}</span>
      <span className="tabular">{v}</span>
    </div>
  );
}
