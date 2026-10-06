import { Link } from 'react-router-dom';
import { Badge, Chip, Input, Money, Select } from '../../components/ui';
import { GROUP_ORDER, GROUPS, type Statement } from '../../lib/accounting';
import { periodRange, todayISO, yearRange, type DateRange } from '../../lib/dates';
import { fmtDate, money } from '../../lib/format';
import type { Ledger } from '../../lib/types';
import { useData } from '../../store/data';

export function RangeBar({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const { settings } = useData();
  const now = new Date();
  const presets: [string, DateRange][] = [
    ['Today', periodRange('daily', now, settings.yearType)],
    ['This month', periodRange('monthly', now, settings.yearType)],
    ['This FY', yearRange(now, 'fy')],
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map(([l, r]) => (
        <Chip key={l} active={value.from === r.from && value.to === r.to} onClick={() => onChange(r)}>
          {l}
        </Chip>
      ))}
      <div className="flex items-center gap-1.5">
        <Input type="date" aria-label="From" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} className="h-9 w-auto text-sm" />
        <span className="text-muted">–</span>
        <Input type="date" aria-label="To" value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} className="h-9 w-auto text-sm" />
      </div>
    </div>
  );
}

export function AsOfBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const fy = yearRange(new Date(), 'fy');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-ink-2">As on</span>
      <Input type="date" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} className="h-9 w-auto text-sm" />
      <Chip active={value === todayISO()} onClick={() => onChange(todayISO())}>
        Today
      </Chip>
      <Chip active={value === fy.to} onClick={() => onChange(fy.to)}>
        FY end
      </Chip>
    </div>
  );
}

/** Grouped ledger dropdown */
export function LedgerSelect({
  value,
  onChange,
  filter,
  placeholder = 'Select ledger',
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  filter?: (l: Ledger) => boolean;
  placeholder?: string;
  className?: string;
}) {
  const { ledgers } = useData();
  const list = filter ? ledgers.filter(filter) : ledgers;
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">{placeholder}</option>
      {GROUP_ORDER.map((g) => {
        const items = list.filter((l) => l.group === g && l.id !== 'sys:suspense').sort((a, b) => a.name.localeCompare(b.name));
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
  );
}

export function Bal({ value, className }: { value: number; className?: string }) {
  const { currency } = useData();
  if (Math.abs(value) < 0.005) return <span className={className}>{money(0, currency)}</span>;
  return (
    <span className={`tabular whitespace-nowrap ${className ?? ''}`}>
      {money(Math.abs(value), currency)} <span className="text-xs font-semibold text-muted">{value > 0 ? 'Dr' : 'Cr'}</span>
    </span>
  );
}

export function StatementView({ st, linkLedgers = true }: { st: Statement; linkLedgers?: boolean }) {
  const { currency } = useData();
  void linkLedgers;
  return (
    <div>
      <div className="flex items-center justify-between border-b border-line bg-surface-2/60 px-4 py-3 text-sm sm:px-5">
        <span className="font-semibold">Opening balance</span>
        <Bal value={st.opening} className="font-semibold" />
      </div>
      {st.rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted">No transactions in this period.</p>
      ) : (
        <>
          <div className="hidden grid-cols-[90px_1fr_90px_110px_110px_130px] gap-3 border-b border-line px-5 py-2 text-xs font-semibold text-muted md:grid">
            <span>Date</span>
            <span>Particulars</span>
            <span>Type</span>
            <span className="text-right">Debit</span>
            <span className="text-right">Credit</span>
            <span className="text-right">Balance</span>
          </div>
          {st.rows.map((r) => (
            <div key={r.entry.key} className="border-b border-line px-4 py-2.5 text-sm md:px-5">
              <div className="hidden grid-cols-[90px_1fr_90px_110px_110px_130px] items-center gap-3 md:grid">
                <span className="text-ink-2">{fmtDate(r.entry.date, 'dd MMM yy')}</span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.particulars}</p>
                  <p className="truncate text-xs text-muted">
                    {r.entry.number && `#${r.entry.number} · `}
                    {r.entry.narration}
                  </p>
                </div>
                <span>
                  <Badge>{r.entry.vtype}</Badge>
                </span>
                <span className="tabular text-right">{r.debit ? money(r.debit, currency) : <span className="text-muted">—</span>}</span>
                <span className="tabular text-right">{r.credit ? money(r.credit, currency) : <span className="text-muted">—</span>}</span>
                <Bal value={r.balance} className="text-right" />
              </div>
              <div className="flex items-start gap-3 md:hidden">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.particulars}</p>
                  <p className="truncate text-xs text-muted">
                    {fmtDate(r.entry.date, 'dd MMM')} · {r.entry.vtype}
                    {r.entry.narration && ` · ${r.entry.narration}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tabular font-semibold">
                    {money(r.debit || r.credit, currency)} <span className="text-xs text-muted">{r.debit ? 'Dr' : 'Cr'}</span>
                  </p>
                  <p className="text-[11px] text-muted">
                    Bal <Bal value={r.balance} />
                  </p>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
      <div className="grid grid-cols-2 gap-2 bg-surface-2/60 px-4 py-3 text-sm sm:px-5 md:grid-cols-[1fr_110px_110px_130px] md:gap-3">
        <span className="font-bold">Closing balance</span>
        <span className="tabular hidden text-right font-semibold md:block">{money(st.debit, currency)}</span>
        <span className="tabular hidden text-right font-semibold md:block">{money(st.credit, currency)}</span>
        <Bal value={st.closing} className="text-right font-bold" />
      </div>
    </div>
  );
}

export function LedgerLink({ l }: { l: Ledger }) {
  return (
    <Link to={`/accounts/ledgers/${encodeURIComponent(l.id)}`} className="hover:underline">
      {l.name}
    </Link>
  );
}

export function MoneyCell({ v }: { v: number }) {
  return v ? <Money value={v} /> : <span className="text-muted">—</span>;
}
