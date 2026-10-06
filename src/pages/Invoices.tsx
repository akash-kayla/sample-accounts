import { Copy, Download, Ellipsis, HandCoins, Pencil, Plus, ReceiptText, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { RecordPaymentModal } from '../components/RecordPayment';
import { Badge, Button, Card, Chip, EmptyState, IconButton, Input, Menu, MenuItem, Money, PageHeader, StatCard, useConfirm } from '../components/ui';
import { exportInvoicePdf } from '../export/invoicePdf';
import { fmtDate } from '../lib/format';
import { calcInvoice } from '../lib/gst';
import { nextInvoiceNumber, PAY_STATUS_LABEL, payStatus, type PayStatus } from '../lib/invoice';
import { todayISO, yearRange } from '../lib/dates';
import type { Invoice } from '../lib/types';
import { useData } from '../store/data';

const TONE: Record<PayStatus, 'neutral' | 'income' | 'expense' | 'info' | 'warn' | 'brand'> = {
  draft: 'neutral',
  cancelled: 'neutral',
  paid: 'income',
  partial: 'info',
  overdue: 'expense',
  unpaid: 'warn',
};

type Filter = 'all' | 'unpaid' | 'paid' | 'overdue' | 'draft';

export default function Invoices() {
  const data = useData();
  const { invoices, settings, payments } = data;
  const nav = useNavigate();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [paying, setPaying] = useState<Invoice | null>(null);

  const rows = useMemo(
    () =>
      invoices
        .map((inv) => {
          const calc = calcInvoice(inv, settings.company.state);
          const paid = payments.get(inv.id) ?? 0;
          return { inv, total: calc.total, tax: calc.tax, paid, status: payStatus(inv, calc.total, paid) };
        })
        .sort((a, b) => (a.inv.date === b.inv.date ? b.inv.createdAt - a.inv.createdAt : a.inv.date < b.inv.date ? 1 : -1)),
    [invoices, payments, settings.company.state],
  );

  const fy = yearRange(new Date(), 'fy');
  const stats = useMemo(() => {
    let billed = 0;
    let received = 0;
    let due = 0;
    let overdue = 0;
    for (const r of rows) {
      if (r.status === 'draft' || r.status === 'cancelled') continue;
      if (r.inv.date >= fy.from && r.inv.date <= fy.to) billed += r.total;
      received += Math.min(r.paid, r.total);
      due += Math.max(0, r.total - r.paid);
      if (r.status === 'overdue') overdue += Math.max(0, r.total - r.paid);
    }
    return { billed, received, due, overdue };
  }, [rows, fy.from, fy.to]);

  const shown = rows.filter((r) => {
    if (filter === 'unpaid' && !['unpaid', 'partial', 'overdue'].includes(r.status)) return false;
    if (filter === 'paid' && r.status !== 'paid') return false;
    if (filter === 'overdue' && r.status !== 'overdue') return false;
    if (filter === 'draft' && r.status !== 'draft') return false;
    if (q) {
      const s = q.toLowerCase();
      return r.inv.number.toLowerCase().includes(s) || r.inv.customer.name.toLowerCase().includes(s) || String(r.total).includes(s);
    }
    return true;
  });

  const duplicate = (inv: Invoice) => {
    const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = inv;
    const date = todayISO();
    const id = data.saveInvoice({ ...rest, status: 'draft', date, number: nextInvoiceNumber(invoices, settings.invoicePrefix, date) });
    toast.success('Invoice duplicated as draft');
    nav(`/invoices/${id}`);
  };

  const remove = async (inv: Invoice) => {
    const linked = data.vouchers.filter((v) => v.invoiceId === inv.id).length;
    const ok = await confirm({
      title: `Delete invoice ${inv.number}?`,
      message: linked ? `Its ${linked} recorded payment(s) will be deleted too.` : 'This cannot be undone.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await data.deleteInvoice(inv.id);
    toast.success('Invoice deleted');
  };

  const download = async (inv: Invoice, paid: number) => {
    const id = toast.loading('Preparing PDF…');
    try {
      await exportInvoicePdf(inv, settings, paid);
      toast.success('Invoice downloaded', { id });
    } catch (e) {
      console.error(e);
      toast.error('Could not create PDF', { id });
    }
  };

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Create GST & non-GST invoices and track payments."
        actions={
          <Link to="/invoices/new">
            <Button variant="primary" icon={<Plus className="size-4" />}>
              New invoice
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Billed this FY`} value={stats.billed} />
        <StatCard label="Received" value={stats.received} />
        <StatCard label="Outstanding" value={stats.due} />
        <StatCard label="Overdue" value={stats.overdue} />
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {(
            [
              ['all', 'All'],
              ['unpaid', 'Unpaid'],
              ['overdue', 'Overdue'],
              ['paid', 'Paid'],
              ['draft', 'Drafts'],
            ] as [Filter, string][]
          ).map(([v, l]) => (
            <Chip key={v} active={filter === v} onClick={() => setFilter(v)}>
              {l}
            </Chip>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number or customer" className="h-10 pl-9" />
        </div>
      </div>

      <Card className="mt-3 overflow-hidden">
        {shown.length === 0 ? (
          <EmptyState
            icon={<ReceiptText />}
            title={invoices.length ? 'No invoices match' : 'No invoices yet'}
            text={invoices.length ? 'Try another filter or search.' : 'Create a professional invoice with your logo, GST and bank details.'}
            action={
              !invoices.length && (
                <Link to="/invoices/new">
                  <Button variant="primary" icon={<Plus className="size-4" />}>
                    Create first invoice
                  </Button>
                </Link>
              )
            }
          />
        ) : (
          <div>
            <div className="hidden grid-cols-[1.1fr_1.6fr_1fr_1fr_1fr_0.9fr_40px] gap-3 border-b border-line bg-surface-2/60 px-5 py-2.5 text-xs font-semibold text-muted md:grid">
              <span>Number</span>
              <span>Customer</span>
              <span>Date</span>
              <span>Due</span>
              <span className="text-right">Amount</span>
              <span>Status</span>
              <span />
            </div>
            {shown.map(({ inv, total, paid, status }) => (
              <div
                key={inv.id}
                onClick={() => nav(`/invoices/${inv.id}`)}
                className="grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 transition last:border-b-0 hover:bg-surface-2/60 md:grid-cols-[1.1fr_1.6fr_1fr_1fr_1fr_0.9fr_40px] md:px-5"
              >
                <span className="text-sm font-semibold text-ink md:order-none">{inv.number}</span>
                <Money value={total} className="text-right text-sm font-bold md:order-5" />
                <span className="truncate text-sm text-ink-2 md:order-2">{inv.customer.name || '—'}</span>
                <span className="text-right md:order-6 md:text-left">
                  <Badge tone={TONE[status]}>{PAY_STATUS_LABEL[status]}</Badge>
                </span>
                <span className="hidden text-sm text-ink-2 md:order-3 md:block">{fmtDate(inv.date)}</span>
                <span className="hidden text-sm text-ink-2 md:order-4 md:block">{inv.dueDate ? fmtDate(inv.dueDate) : '—'}</span>
                <span className="text-xs text-muted md:hidden">
                  {fmtDate(inv.date)} {inv.withGst ? '· GST' : '· Non-GST'}
                </span>
                <div className="flex justify-end md:order-7" onClick={(e) => e.stopPropagation()}>
                  <Menu
                    trigger={(p) => (
                      <IconButton label="Invoice actions" {...p} className="size-9">
                        <Ellipsis className="size-4" />
                      </IconButton>
                    )}
                  >
                    {(close) => (
                      <>
                        <MenuItem icon={<Pencil />} onClick={() => (close(), nav(`/invoices/${inv.id}`))}>
                          Open / edit
                        </MenuItem>
                        <MenuItem icon={<Download />} onClick={() => (close(), void download(inv, paid))}>
                          Download PDF
                        </MenuItem>
                        {inv.status === 'final' && status !== 'paid' && (
                          <MenuItem icon={<HandCoins />} onClick={() => (close(), setPaying(inv))}>
                            Record payment
                          </MenuItem>
                        )}
                        <MenuItem icon={<Copy />} onClick={() => (close(), duplicate(inv))}>
                          Duplicate
                        </MenuItem>
                        <MenuItem icon={<Trash2 />} danger onClick={() => (close(), void remove(inv))}>
                          Delete
                        </MenuItem>
                      </>
                    )}
                  </Menu>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      {paying && <RecordPaymentModal invoice={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}
