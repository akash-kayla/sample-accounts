import { CalendarDays } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { EntryForm } from '../components/EntryForm';
import { TxnRow } from '../components/TxnRow';
import { Card, CardHeader, Money, PageHeader } from '../components/ui';
import { totals } from '../lib/analytics';
import { todayISO } from '../lib/dates';
import { useData } from '../store/data';

export default function AddEntry() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { transactions } = useData();
  const today = todayISO();
  const todays = useMemo(() => transactions.filter((t) => t.date === today), [transactions, today]);
  const tt = totals(todays);

  return (
    <div>
      <PageHeader title="Add entry" subtitle="Record an expense or income in a few taps." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-4 sm:p-6">
          <EntryForm defaultDate={params.get('date') ?? undefined} onDone={(_id, date) => nav(`/daily?date=${date}`)} />
        </Card>
        <div className="hidden space-y-4 lg:block">
          <Card>
            <CardHeader
              title="Today so far"
              action={
                <Link to="/daily" className="flex items-center gap-1 text-xs font-semibold text-ink-2 hover:text-ink">
                  <CalendarDays className="size-3.5" /> View day
                </Link>
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
              {todays.length === 0 ? (
                <p className="p-5 text-center text-sm text-muted">Nothing recorded today yet.</p>
              ) : (
                todays.slice(0, 6).map((t) => <TxnRow key={t.id} t={t} compact />)
              )}
            </div>
          </Card>
          <p className="px-1 text-xs text-muted">
            Tip: type sums like <span className="font-mono">120+45</span> in the amount box. Press <kbd className="rounded border border-line px-1">N</kbd>{' '}
            anywhere to add a new entry.
          </p>
        </div>
      </div>
    </div>
  );
}
