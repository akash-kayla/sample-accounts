import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { nextVoucherNumber, SYS } from '../lib/accounting';
import { todayISO } from '../lib/dates';
import { evalAmount, money, round2 } from '../lib/format';
import { calcInvoice } from '../lib/gst';
import type { Invoice } from '../lib/types';
import { useData } from '../store/data';
import { Button, Field, Input, Modal, Select } from './ui';

export function RecordPaymentModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const data = useData();
  const calc = calcInvoice(invoice, data.settings.company.state);
  const paid = data.payments.get(invoice.id) ?? 0;
  const balance = round2(Math.max(0, calc.total - paid));
  const accounts = useMemo(() => data.storedLedgers.filter((l) => l.group === 'bank' || l.group === 'cash'), [data.storedLedgers]);
  const [amountText, setAmountText] = useState(String(balance));
  const [date, setDate] = useState(todayISO());
  const [ledgerId, setLedgerId] = useState(accounts.find((a) => a.group === 'bank')?.id ?? accounts[0]?.id ?? '');
  const [ref, setRef] = useState('');
  const amount = evalAmount(amountText) ?? 0;
  useEffect(() => {
    if (!ledgerId && accounts.length) setLedgerId(accounts.find((a) => a.group === 'bank')?.id ?? accounts[0]!.id);
  }, [accounts, ledgerId]);

  const save = () => {
    if (amount <= 0) return toast.error('Enter the amount received');
    if (!ledgerId) return toast.error('Choose where the money was received');
    data.saveVoucher({
      type: 'receipt',
      number: nextVoucherNumber(data.vouchers, 'receipt'),
      date,
      lines: [
        { ledgerId, debit: round2(amount), credit: 0 },
        { ledgerId: invoice.customerLedgerId ?? SYS.suspense, debit: 0, credit: round2(amount) },
      ],
      narration: `Payment received for invoice ${invoice.number}${ref.trim() ? ` — ${ref.trim()}` : ''}`,
      invoiceId: invoice.id,
    });
    toast.success(`${money(amount, data.currency)} recorded against ${invoice.number}`);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Record payment · ${invoice.number}`}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save payment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-3 text-center text-xs">
          <div>
            <p className="text-muted">Total</p>
            <p className="font-bold text-ink">{money(calc.total, data.currency)}</p>
          </div>
          <div>
            <p className="text-muted">Received</p>
            <p className="font-bold text-ink">{money(paid, data.currency)}</p>
          </div>
          <div>
            <p className="text-muted">Balance</p>
            <p className="font-bold text-expense">{money(balance, data.currency)}</p>
          </div>
        </div>
        <Field label="Amount received">
          <Input inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
          <Field label="Received in">
            {accounts.length ? (
              <Select value={ledgerId} onChange={(e) => setLedgerId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            ) : (
              <Button onClick={() => data.addDefaultLedgers()} className="w-full">
                Create Cash & Bank
              </Button>
            )}
          </Field>
        </div>
        <Field label="Reference (optional)">
          <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="UTR / cheque no. / UPI ref" />
        </Field>
        <p className="text-xs text-muted">
          This creates a Receipt voucher: Dr {accounts.find((a) => a.id === ledgerId)?.name ?? 'Bank'}, Cr {invoice.customer.name || 'Customer'}.
        </p>
      </div>
    </Modal>
  );
}
