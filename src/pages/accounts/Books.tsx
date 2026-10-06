import { BookText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Card, Chip, EmptyState, ExportButtons } from '../../components/ui';
import { dayBookSection, exportSimpleExcel, exportSimplePdf, statementSection } from '../../export/reports';
import { ledgerStatement } from '../../lib/accounting';
import { inRange, periodRange, rangeLabel, type DateRange } from '../../lib/dates';
import { fmtDate, money } from '../../lib/format';
import { useData } from '../../store/data';
import { RangeBar, StatementView } from './shared';

const TONE: Record<string, 'expense' | 'income' | 'info' | 'neutral' | 'brand'> = {
  Payment: 'expense',
  Purchase: 'expense',
  Receipt: 'income',
  Sales: 'income',
  Contra: 'info',
  Journal: 'neutral',
};

export function DayBook() {
  const data = useData();
  const { entries, ledgerById, settings, currency } = data;
  const [range, setRange] = useState<DateRange>(() => periodRange('daily', new Date(), settings.yearType));
  const [vt, setVt] = useState<string>('all');
  const list = useMemo(() => entries.filter((e) => inRange(e.date, range) && (vt === 'all' || e.vtype === vt)), [entries, range, vt]);
  const name = (id: string) => ledgerById.get(id)?.name ?? 'Unknown';
  const total = list.reduce((s, e) => s + e.amount, 0);
  const ctx = { settings, currency, catById: data.catById, subById: data.subById, ledgerById };
  const sub = rangeLabel(range);
  const types = ['all', 'Payment', 'Receipt', 'Sales', 'Purchase', 'Contra', 'Journal'];

  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <RangeBar value={range} onChange={setRange} />
        <ExportButtons
          compact
          onExcel={() => exportSimpleExcel(ctx, { title: 'Day Book', subtitle: sub, fileName: `Day Book ${sub}`, sections: [{ ...dayBookSection(list, name), sheet: 'Day Book', sum: [6] }] })}
          onPdf={() => exportSimplePdf(ctx, { title: 'Day Book', subtitle: sub, fileName: `Day Book ${sub}`, landscape: true, sections: [dayBookSection(list, name)] })}
        />
      </div>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {types.map((t) => (
          <Chip key={t} active={vt === t} onClick={() => setVt(t)}>
            {t === 'all' ? 'All vouchers' : t}
          </Chip>
        ))}
      </div>
      <Card className="mt-3 overflow-hidden">
        {list.length === 0 ? (
          <EmptyState icon={<BookText />} title="No vouchers in this period" text="Expenses, income, invoices and vouchers all appear here, Tally-style." />
        ) : (
          <>
            {list.map((e) => (
              <div key={e.key} className="border-b border-line px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{fmtDate(e.date, 'dd MMM yyyy')}</span>
                  <Badge tone={TONE[e.vtype] ?? 'neutral'}>{e.vtype}</Badge>
                  {e.number && <span className="text-xs font-semibold text-muted">#{e.number}</span>}
                  <span className="ml-auto tabular text-sm font-bold">{money(e.amount, currency)}</span>
                </div>
                <div className="mt-2 space-y-0.5 text-sm">
                  {e.lines.map((l, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-3">
                      <span className={l.credit ? 'pl-5 text-ink-2' : 'font-medium'}>
                        {l.credit ? 'To ' : ''}
                        {name(l.ledgerId)}
                      </span>
                      <span className="tabular w-24 text-right sm:w-32">{l.debit ? money(l.debit, currency) : ''}</span>
                      <span className="tabular w-24 text-right text-ink-2 sm:w-32">{l.credit ? money(l.credit, currency) : ''}</span>
                    </div>
                  ))}
                </div>
                {e.narration && <p className="mt-1.5 text-xs italic text-muted">({e.narration})</p>}
              </div>
            ))}
            <div className="flex items-center justify-between bg-surface-2/60 px-4 py-3 text-sm font-bold sm:px-5">
              <span>
                {list.length} voucher{list.length > 1 ? 's' : ''}
              </span>
              <span className="tabular">{money(total, currency)}</span>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

export function CashBankBook({ group }: { group: 'cash' | 'bank' }) {
  const data = useData();
  const { storedLedgers, ledgers, entries, settings, currency, ledgerById } = data;
  const accounts = storedLedgers.filter((l) => l.group === group);
  const [which, setWhich] = useState<string>('all');
  const [range, setRange] = useState<DateRange>(() => periodRange('monthly', new Date(), settings.yearType));
  const ids = which === 'all' ? accounts.map((a) => a.id) : [which];
  const st = useMemo(() => ledgerStatement(ids, ledgers, entries, range), [ids.join(','), ledgers, entries, range]);
  const title = group === 'cash' ? 'Cash Book' : 'Bank Book';
  const sub = `${which === 'all' ? `All ${group} accounts` : ledgerById.get(which)?.name} · ${rangeLabel(range)}`;
  const ctx = { settings, currency, catById: data.catById, subById: data.subById, ledgerById };

  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <RangeBar value={range} onChange={setRange} />
        <ExportButtons
          compact
          onExcel={() => exportSimpleExcel(ctx, { title, subtitle: sub, fileName: `${title} ${rangeLabel(range)}`, sections: [{ ...statementSection(st, currency), sheet: title, sum: [4, 5] }] })}
          onPdf={() => exportSimplePdf(ctx, { title, subtitle: sub, fileName: `${title} ${rangeLabel(range)}`, sections: [statementSection(st, currency)] })}
        />
      </div>
      {accounts.length > 1 && (
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Chip active={which === 'all'} onClick={() => setWhich('all')}>
            All
          </Chip>
          {accounts.map((a) => (
            <Chip key={a.id} active={which === a.id} onClick={() => setWhich(a.id)}>
              {a.name}
            </Chip>
          ))}
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Opening', st.opening],
          [group === 'cash' ? 'Cash in (Dr)' : 'Deposits (Dr)', st.debit],
          [group === 'cash' ? 'Cash out (Cr)' : 'Withdrawals (Cr)', st.credit],
          ['Closing', st.closing],
        ].map(([l, v]) => (
          <Card key={l as string} className="p-4">
            <p className="text-xs text-muted">{l}</p>
            <p className="tabular text-lg font-bold">{money(v as number, currency)}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-3 overflow-hidden">
        {accounts.length === 0 ? (
          <EmptyState icon={<BookText />} title={`No ${group} ledger`} text={`Create a ledger under “${group === 'cash' ? 'Cash-in-Hand' : 'Bank Accounts'}” in Ledgers.`} />
        ) : (
          <StatementView st={st} />
        )}
      </Card>
    </div>
  );
}
