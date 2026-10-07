import { CalendarDays } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { EntryForm } from '../components/EntryForm';
import { TxnList } from '../components/TxnRow';
import { Card, CardHeader, Money, PageHeader, Segmented } from '../components/ui';
import { totals } from '../lib/analytics';
import { todayISO } from '../lib/dates';
import { fmtDate } from '../lib/format';
import { useData } from '../store/data';

type Scope = 'day' | 'month';

export default function AddEntry() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { transactions } = useData();
  const defaultDate = params.get('date') ?? undefined;
  const [date, setDate] = useState(defaultDate ?? todayISO());
  const [scope, setScope] = useState<Scope>('day');
  const month = date.slice(0, 7);
  const list = useMemo(
    () => transactions.filter((t) => (scope === 'day' ? t.date === date : t.date.startsWith(month))),
    [transactions, scope, date, month],
  );
  const tt = totals(list);
  const isToday = date === todayISO();
  const title =
    scope === 'month' ? fmtDate(date, 'MMMM yyyy') : isToday ? 'Today so far' : fmtDate(date, 'EEE, dd MMM yyyy');
  const empty =
    scope === 'month'
      ? `Nothing recorded in ${fmtDate(date, 'MMMM')} yet.`
      : isToday
        ? 'Nothing recorded today yet.'
        : 'Nothing recorded on this day yet.';

  return (
    <div>
      <PageHeader title="Add entry" subtitle="Record an expense or income — for today or any past date." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="p-4 sm:p-6">
          <EntryForm defaultDate={defaultDate} onDateChange={setDate} onDone={(_id, d) => nav(`/daily?date=${d}`)} />
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader
              title={title}
              subtitle={`${tt.count} ${tt.count === 1 ? 'entry' : 'entries'} · tap one to edit or delete`}
              action={
                <Segmented
                  size="sm"
                  value={scope}
                  onChange={setScope}
                  options={[
                    { value: 'day', label: 'Day' },
                    { value: 'month', label: 'Month' },
                  ]}
                />
              }
            />
            <div className="grid grid-cols-2 gap-3 p-4 sm:p-5">
              <div className="rounded-xl bg-expense-soft p-3">
                <p className="text-xs font-medium text-expense">Spent</p>
                <Money value={tt.expense} className="text-lg font-bold text-expense" />
              </div>
              <div className="rounded-xl bg-income-soft p-3">
                <p className="text-xs font-medium text-income">Received</p>
                <Money value={tt.income} className="text-lg font-bold text-income" />
              </div>
            </div>
            <div className="border-t border-line">
              {list.length === 0 ? (
                <p className="p-5 text-center text-sm text-muted">{empty}</p>
              ) : (
                <TxnList key={`${scope}|${scope === 'day' ? date : month}`} items={list} showDate={scope === 'month'} limit={15} />
              )}
            </div>
            {scope === 'day' && (
              <div className="border-t border-line px-4 py-3 sm:px-5">
                <Link
                  to={`/daily?date=${date}`}
                  className="flex items-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-ink"
                >
                  <CalendarDays className="size-3.5" /> Open full day view
                </Link>
              </div>
            )}
          </Card>
          <p className="hidden px-1 text-xs text-muted lg:block">
            Tip: open the calendar to record entries for previous months — dots mark days that already have entries. Type sums like{' '}
            <span className="font-mono">120+45</span> in the amount box. Press <kbd className="rounded border border-line px-1">N</kbd> anywhere to
            add a new entry.
          </p>
        </div>
      </div>
    </div>
  );
}
