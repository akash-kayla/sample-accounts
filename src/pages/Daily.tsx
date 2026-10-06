import { CalendarX2, CirclePlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TxnList } from '../components/TxnRow';
import { Badge, Button, Card, Chip, cn, DateNav, EmptyState, ExportButtons, Money, PageHeader } from '../components/ui';
import { exportTxnExcel, exportTxnPdf } from '../export/reports';
import { filterTxns, totals } from '../lib/analytics';
import { eachDay, fromISO, periodRange, todayISO } from '../lib/dates';
import { fmtDate, moneyCompact } from '../lib/format';
import type { EntryType, GstFilter } from '../lib/types';
import { useData } from '../store/data';

export default function Daily() {
  const data = useData();
  const { transactions, currency, settings } = data;
  const [params, setParams] = useSearchParams();
  const date = params.get('date') || todayISO();
  const setDate = (d: string) => setParams(d === todayISO() ? {} : { date: d }, { replace: true });
  const [type, setType] = useState<EntryType | 'all'>('all');
  const [gst, setGst] = useState<GstFilter>('all');

  const dayAll = useMemo(() => transactions.filter((t) => t.date === date), [transactions, date]);
  const list = useMemo(() => filterTxns(dayAll, { type, gst }), [dayAll, type, gst]);
  const tt = totals(dayAll);
  const ft = totals(list);

  const week = useMemo(() => {
    const r = periodRange('weekly', fromISO(date), settings.yearType);
    const days = eachDay(r);
    const m = new Map(days.map((d) => [d, 0]));
    for (const t of transactions) if (t.type === 'expense' && m.has(t.date)) m.set(t.date, m.get(t.date)! + t.amount);
    const max = Math.max(...m.values(), 1);
    return days.map((d) => ({ d, v: m.get(d)!, h: m.get(d)! / max }));
  }, [transactions, date, settings.yearType]);

  const isToday = date === todayISO();
  const ctx = { settings, currency, catById: data.catById, subById: data.subById, ledgerById: data.ledgerById };
  const title = 'Daily Expense Report';
  const period = fmtDate(date, 'EEEE, dd MMM yyyy');

  return (
    <div>
      <PageHeader
        title="Daily expenses"
        subtitle={isToday ? 'Today' : period}
        actions={
          <>
            <ExportButtons
              label={isToday ? 'Download today’s expenses' : 'Download this day'}
              onExcel={() => exportTxnExcel(ctx, list, title, period, { from: date, to: date })}
              onPdf={() => exportTxnPdf(ctx, list, title, period, { from: date, to: date })}
            />
            <Link to={`/add?date=${date}`} className="hidden sm:block">
              <Button variant="primary" icon={<CirclePlus className="size-4" />}>
                Add
              </Button>
            </Link>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <DateNav value={date} onChange={setDate} />
      </div>

      {/* week strip */}
      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {week.map(({ d, v, h }) => {
          const active = d === date;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDate(d)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border px-1 py-2 transition',
                active ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink hover:border-line-strong',
              )}
            >
              <span className={cn('text-[10px] font-semibold uppercase', active ? 'opacity-70' : 'text-muted')}>{fmtDate(d, 'EEE')}</span>
              <span className="text-sm font-bold">{fmtDate(d, 'd')}</span>
              <span className="flex h-6 w-full items-end justify-center">
                <span
                  className={cn('w-2 rounded-t-sm', active ? 'bg-brand' : 'bg-[var(--chart-expense)]')}
                  style={{ height: `${v ? Math.max(12, h * 100) : 0}%` }}
                />
              </span>
              <span className={cn('tabular text-[10px] font-medium', active ? 'opacity-80' : 'text-muted')}>{v ? moneyCompact(v, currency) : '—'}</span>
            </button>
          );
        })}
      </div>

      {/* Day totals */}
      <Card className="mt-4 grid grid-cols-3 divide-x divide-line">
        {(
          [
            ['Spent', tt.expense, 'text-expense', `${tt.expenseCount} entries`],
            ['Received', tt.income, 'text-income', `${tt.incomeCount} entries`],
            ['Net', tt.net, tt.net < 0 ? 'text-expense' : 'text-income', 'income − expense'],
          ] as const
        ).map(([label, v, tone, sub]) => (
          <div key={label} className="p-3 sm:p-4">
            <p className="text-xs font-medium text-muted">{label}</p>
            <Money value={v} roundOnMobile className={cn('mt-0.5 block text-base font-bold sm:text-2xl', tone)} />
            <p className="mt-0.5 truncate text-[11px] text-muted">{sub}</p>
          </div>
        ))}
      </Card>
      {(tt.expenseWithGst > 0 || tt.gstPaid > 0) && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge tone="info">With GST bill: {moneyCompact(tt.expenseWithGst, currency)}</Badge>
          <Badge>Without GST: {moneyCompact(tt.expenseWithoutGst, currency)}</Badge>
          <Badge tone="brand">GST paid: {moneyCompact(tt.gstPaid, currency)}</Badge>
        </div>
      )}

      {/* filters */}
      <div className="no-scrollbar -mx-4 mt-5 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {(['all', 'expense', 'income'] as const).map((t) => (
          <Chip key={t} active={type === t} onClick={() => setType(t)}>
            {t === 'all' ? 'All' : t === 'expense' ? 'Expenses' : 'Income'}
          </Chip>
        ))}
        <span className="mx-1 h-5 w-px shrink-0 bg-line" />
        {(['all', 'gst', 'nogst'] as const).map((g) => (
          <Chip key={g} active={gst === g} onClick={() => setGst(g)}>
            {g === 'all' ? 'GST + non-GST' : g === 'gst' ? 'With GST' : 'Without GST'}
          </Chip>
        ))}
      </div>

      <Card className="mt-3 overflow-hidden">
        {list.length ? (
          <>
            <TxnList items={list} />
            {(type !== 'all' || gst !== 'all') && (
              <div className="flex items-center justify-between border-t border-line bg-surface-2/60 px-5 py-3 text-sm">
                <span className="font-medium text-ink-2">Filtered total</span>
                <span className="flex gap-4">
                  {ft.income > 0 && <Money value={ft.income} type="income" signed className="font-semibold" />}
                  {ft.expense > 0 && <Money value={ft.expense} type="expense" signed className="font-semibold" />}
                </span>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={<CalendarX2 />}
            title={dayAll.length ? 'Nothing matches these filters' : isToday ? 'No entries today yet' : 'No entries on this day'}
            text={dayAll.length ? 'Try a different filter.' : 'Tap + to record an expense or income for this date.'}
            action={
              !dayAll.length && (
                <Link to={`/add?date=${date}`}>
                  <Button variant="primary" icon={<CirclePlus className="size-4" />}>
                    Add entry
                  </Button>
                </Link>
              )
            }
          />
        )}
      </Card>
    </div>
  );
}
