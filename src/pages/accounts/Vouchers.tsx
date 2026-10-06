import { ArrowRightLeft, Ellipsis, NotebookPen, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, Chip, cn, EmptyState, Field, IconButton, Input, Menu, MenuItem, Modal, Money, Segmented, Textarea, useConfirm } from '../../components/ui';
import { nextVoucherNumber } from '../../lib/accounting';
import { todayISO } from '../../lib/dates';
import { evalAmount, fmtDate, money, round2 } from '../../lib/format';
import type { Voucher, VoucherLine, VoucherType } from '../../lib/types';
import { useData } from '../../store/data';
import { LedgerSelect } from './shared';

const TYPES: { value: VoucherType; label: string; key: string; help: string }[] = [
  { value: 'payment', label: 'Payment', key: 'F5', help: 'Money going out from cash/bank (pay a supplier, rent, salary…)' },
  { value: 'receipt', label: 'Receipt', key: 'F6', help: 'Money coming in to cash/bank (from a customer, capital…)' },
  { value: 'contra', label: 'Contra', key: 'F4', help: 'Between cash and bank (deposit, withdrawal, transfer)' },
  { value: 'journal', label: 'Journal', key: 'F7', help: 'Adjustments with no cash/bank (credit purchase, depreciation…)' },
];

interface Row {
  id: string;
  ledgerId: string;
  amount: string;
  side: 'Dr' | 'Cr';
}

const rid = () => Math.random().toString(36).slice(2, 9);

export function VoucherModal({ initial, defaultType = 'payment', onClose }: { initial?: Voucher; defaultType?: VoucherType; onClose: () => void }) {
  const data = useData();
  const { ledgerById, currency } = data;
  const [type, setType] = useState<VoucherType>(initial?.type ?? defaultType);
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [number, setNumber] = useState(initial?.number ?? nextVoucherNumber(data.vouchers, initial?.type ?? defaultType));
  const [narration, setNarration] = useState(initial?.narration ?? '');

  const isCashBank = (id: string) => {
    const g = ledgerById.get(id)?.group;
    return g === 'cash' || g === 'bank';
  };
  const cashBankDefault = data.storedLedgers.find((l) => l.group === 'bank')?.id ?? data.storedLedgers.find((l) => l.group === 'cash')?.id ?? '';

  // simple mode state (payment/receipt/contra)
  const initAccount = () => {
    if (!initial) return cashBankDefault;
    const side = initial.type === 'receipt' ? 'debit' : 'credit';
    return initial.lines.find((l) => l[side] > 0 && isCashBank(l.ledgerId))?.ledgerId ?? initial.lines.find((l) => l[side] > 0)?.ledgerId ?? '';
  };
  const [account, setAccount] = useState(initAccount);
  const [rows, setRows] = useState<Row[]>(() => {
    if (!initial) return type === 'journal' ? [{ id: rid(), ledgerId: '', amount: '', side: 'Dr' }, { id: rid(), ledgerId: '', amount: '', side: 'Cr' }] : [{ id: rid(), ledgerId: '', amount: '', side: 'Dr' }];
    if (initial.type === 'journal') return initial.lines.map((l) => ({ id: rid(), ledgerId: l.ledgerId, amount: String(l.debit || l.credit), side: l.debit ? 'Dr' : 'Cr' }));
    const acc = initAccount();
    return initial.lines.filter((l) => l.ledgerId !== acc).map((l) => ({ id: rid(), ledgerId: l.ledgerId, amount: String(l.debit || l.credit), side: l.debit ? 'Dr' : 'Cr' }));
  });

  const changeType = (t: VoucherType) => {
    setType(t);
    if (!initial) setNumber(nextVoucherNumber(data.vouchers, t));
    if (t === 'journal' && rows.length < 2) setRows((r) => [...r.map((x) => ({ ...x, side: 'Dr' as const })), { id: rid(), ledgerId: '', amount: '', side: 'Cr' }]);
  };

  const amt = (r: Row) => evalAmount(r.amount) ?? 0;
  const drTotal = round2(rows.filter((r) => r.side === 'Dr').reduce((s, r) => s + amt(r), 0));
  const crTotal = round2(rows.filter((r) => r.side === 'Cr').reduce((s, r) => s + amt(r), 0));
  const simpleTotal = round2(rows.reduce((s, r) => s + amt(r), 0));

  const buildLines = (): VoucherLine[] | string => {
    const valid = rows.filter((r) => r.ledgerId && amt(r) > 0);
    if (!valid.length) return 'Add at least one ledger with an amount';
    if (type === 'journal') {
      if (!valid.some((r) => r.side === 'Dr') || !valid.some((r) => r.side === 'Cr')) return 'A journal needs at least one Dr and one Cr line';
      if (Math.abs(drTotal - crTotal) > 0.005) return `Debit and credit must match (difference ${money(Math.abs(drTotal - crTotal), currency)})`;
      return valid.map((r) => ({ ledgerId: r.ledgerId, debit: r.side === 'Dr' ? amt(r) : 0, credit: r.side === 'Cr' ? amt(r) : 0 }));
    }
    if (!account) return type === 'contra' ? 'Choose the “from” account' : 'Choose the cash/bank account';
    if (valid.some((r) => r.ledgerId === account)) return 'The same ledger cannot be on both sides';
    const total = round2(valid.reduce((s, r) => s + amt(r), 0));
    // payment & contra: Dr particulars, Cr account. receipt: Dr account, Cr particulars
    if (type === 'receipt') return [{ ledgerId: account, debit: total, credit: 0 }, ...valid.map((r) => ({ ledgerId: r.ledgerId, debit: 0, credit: amt(r) }))];
    return [...valid.map((r) => ({ ledgerId: r.ledgerId, debit: amt(r), credit: 0 })), { ledgerId: account, debit: 0, credit: total }];
  };

  const save = () => {
    const lines = buildLines();
    if (typeof lines === 'string') return toast.error(lines);
    data.saveVoucher({ type, date, number: number.trim() || nextVoucherNumber(data.vouchers, type), lines, narration: narration.trim(), invoiceId: initial?.invoiceId ?? null }, initial?.id);
    toast.success(`${TYPES.find((t) => t.value === type)!.label} voucher ${initial ? 'updated' : 'saved'}`);
    onClose();
  };

  const cashBankFilter = (l: { group: string }) => l.group === 'cash' || l.group === 'bank';
  const meta = TYPES.find((t) => t.value === type)!;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={initial ? `Edit ${meta.label.toLowerCase()} voucher` : 'New voucher'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            {initial ? 'Save changes' : `Save ${meta.label.toLowerCase()}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented full value={type} onChange={changeType} options={TYPES.map((t) => ({ value: t.value, label: t.label }))} />
        <p className="text-xs text-muted">{meta.help}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
          <Field label="Voucher no.">
            <Input value={number} onChange={(e) => setNumber(e.target.value)} />
          </Field>
        </div>

        {type !== 'journal' && (
          <Field label={type === 'payment' ? 'Paid from (Cr)' : type === 'receipt' ? 'Received into (Dr)' : 'From account (Cr)'}>
            <LedgerSelect value={account} onChange={setAccount} filter={cashBankFilter} placeholder="Select cash / bank" />
          </Field>
        )}

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">
            {type === 'journal' ? 'Entries' : type === 'payment' ? 'Paid to (Dr)' : type === 'receipt' ? 'Received from (Cr)' : 'To account (Dr)'}
          </p>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={r.id} className="flex items-center gap-2">
                {type === 'journal' && (
                  <Segmented
                    size="sm"
                    value={r.side}
                    onChange={(side) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, side } : x)))}
                    options={[
                      { value: 'Dr', label: 'Dr' },
                      { value: 'Cr', label: 'Cr' },
                    ]}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <LedgerSelect
                    value={r.ledgerId}
                    onChange={(v) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, ledgerId: v } : x)))}
                    filter={type === 'contra' ? cashBankFilter : undefined}
                  />
                </div>
                <Input
                  inputMode="decimal"
                  value={r.amount}
                  onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, amount: e.target.value } : x)))}
                  placeholder="0.00"
                  className="w-28 sm:w-36"
                  aria-label={`Amount ${i + 1}`}
                />
                <IconButton label="Remove line" disabled={rows.length <= (type === 'journal' ? 2 : 1)} onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} className="size-9">
                  <X className="size-4" />
                </IconButton>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            icon={<Plus className="size-4" />}
            onClick={() => setRows((rs) => [...rs, { id: rid(), ledgerId: '', amount: '', side: type === 'journal' ? (drTotal > crTotal ? 'Cr' : 'Dr') : 'Dr' }])}
          >
            Add line
          </Button>
        </div>

        <div className="rounded-xl bg-surface-2 p-3 text-sm">
          {type === 'journal' ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Dr <strong className="tabular">{money(drTotal, currency)}</strong> · Cr <strong className="tabular">{money(crTotal, currency)}</strong>
              </span>
              {Math.abs(drTotal - crTotal) > 0.005 ? (
                <Badge tone="expense">Difference {money(Math.abs(drTotal - crTotal), currency)}</Badge>
              ) : (
                drTotal > 0 && <Badge tone="income">Balanced</Badge>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-ink-2">Total</span>
              <strong className="tabular">{money(simpleTotal, currency)}</strong>
            </div>
          )}
        </div>

        <Field label="Narration">
          <Textarea rows={2} value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Being amount paid towards…" />
        </Field>
      </div>
    </Modal>
  );
}

export function VouchersPage() {
  const data = useData();
  const { vouchers, ledgerById, invoices } = data;
  const confirm = useConfirm();
  const [filter, setFilter] = useState<VoucherType | 'all'>('all');
  const [modal, setModal] = useState<{ open: boolean; v?: Voucher; type?: VoucherType }>({ open: false });
  const name = (id: string) => ledgerById.get(id)?.name ?? 'Unknown';
  const invNo = useMemo(() => new Map(invoices.map((i) => [i.id, i.number])), [invoices]);

  const list = vouchers
    .filter((v) => filter === 'all' || v.type === filter)
    .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));

  const remove = async (v: Voucher) => {
    const ok = await confirm({ title: `Delete voucher ${v.number}?`, message: v.invoiceId ? 'This is a payment recorded against an invoice; the invoice will show as unpaid again.' : undefined, confirmText: 'Delete', danger: true });
    if (!ok) return;
    data.deleteVoucher(v.id);
    toast.success('Voucher deleted');
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
            All ({vouchers.length})
          </Chip>
          {TYPES.map((t) => (
            <Chip key={t.value} active={filter === t.value} onClick={() => setFilter(t.value)}>
              {t.label}
            </Chip>
          ))}
        </div>
        <Menu
          trigger={(p) => (
            <Button variant="primary" icon={<Plus className="size-4" />} {...p}>
              New voucher
            </Button>
          )}
        >
          {(close) =>
            TYPES.map((t) => (
              <MenuItem key={t.value} icon={<NotebookPen />} hint={t.key} onClick={() => (close(), setModal({ open: true, type: t.value }))}>
                {t.label}
              </MenuItem>
            ))
          }
        </Menu>
      </div>

      <Card className="mt-4 overflow-hidden">
        {list.length === 0 ? (
          <EmptyState
            icon={<ArrowRightLeft />}
            title="No vouchers yet"
            text="Daily expenses and invoices post to the books automatically. Use vouchers for supplier payments, customer receipts, bank transfers and adjustments."
            action={
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setModal({ open: true, type: 'payment' })}>
                New voucher
              </Button>
            }
          />
        ) : (
          list.map((v) => {
            const dr = v.lines.filter((l) => l.debit).map((l) => name(l.ledgerId));
            const cr = v.lines.filter((l) => l.credit).map((l) => name(l.ledgerId));
            const total = v.lines.reduce((s, l) => s + l.debit, 0);
            return (
              <div key={v.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 sm:px-5">
                <div className="hidden w-16 shrink-0 text-sm text-ink-2 sm:block">{fmtDate(v.date, 'dd MMM')}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={v.type === 'payment' ? 'expense' : v.type === 'receipt' ? 'income' : v.type === 'contra' ? 'info' : 'neutral'}>
                      {TYPES.find((t) => t.value === v.type)!.label}
                    </Badge>
                    <span className="text-xs font-semibold text-muted">{v.number}</span>
                    {v.invoiceId && <Badge tone="brand">Inv {invNo.get(v.invoiceId) ?? ''}</Badge>}
                    <span className="text-xs text-muted sm:hidden">{fmtDate(v.date, 'dd MMM')}</span>
                  </div>
                  <p className="mt-1 truncate text-sm">
                    <span className="font-medium">{dr.join(', ')}</span>
                    <span className="mx-1.5 text-muted">←</span>
                    <span className="text-ink-2">{cr.join(', ')}</span>
                  </p>
                  {v.narration && <p className="truncate text-xs text-muted">{v.narration}</p>}
                </div>
                <Money value={total} className={cn('text-sm font-semibold')} />
                <Menu
                  trigger={(p) => (
                    <IconButton label="Voucher actions" {...p} className="size-9">
                      <Ellipsis className="size-4" />
                    </IconButton>
                  )}
                >
                  {(close) => (
                    <>
                      <MenuItem icon={<Pencil />} onClick={() => (close(), setModal({ open: true, v }))}>
                        Edit
                      </MenuItem>
                      <MenuItem icon={<Trash2 />} danger onClick={() => (close(), void remove(v))}>
                        Delete
                      </MenuItem>
                    </>
                  )}
                </Menu>
              </div>
            );
          })
        )}
      </Card>
      {modal.open && <VoucherModal initial={modal.v} defaultType={modal.type} onClose={() => setModal({ open: false })} />}
    </div>
  );
}
