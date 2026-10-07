import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgePercent,
  CalendarDays,
  CalendarRange,
  CirclePlus,
  Landmark,
  PiggyBank,
  ReceiptText,
  Settings,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CategoryDonut, DailyBars, IncomeExpenseBars, TrendLines } from '../components/charts';
import { LoveEgg } from '../components/LoveEgg';
import { TxnList } from '../components/TxnRow';
import { Button, Card, CardHeader, cn, Input, Money, PageHeader, Segmented, StatCard } from '../components/ui';
import { computeBalances } from '../lib/accounting';
import { byDay, byMonth, filterTxns, growth, totals } from '../lib/analytics';
import { addMonths, endOfMonth, startOfMonth } from 'date-fns';
import { fromISO, lastNMonths, monthLabel, periodRange, presetRange, rangeDays, rangeLabel, todayISO, toISO, type DateRange, type RangePreset } from '../lib/dates';
import { pct } from '../lib/format';
import { useData } from '../store/data';

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'custom', label: 'Custom' },
];

function Growth({ value, goodWhenUp, label, suffix }: { value: number | null; goodWhenUp: boolean; label: string; suffix: string }) {
  if (value === null) return <span className="text-xs text-muted">{label}: new this month</span>;
  const up = value >= 0;
  const good = up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold', good ? 'bg-income-soft text-income' : 'bg-expense-soft text-expense')}>
      <Icon className="size-3.5" />
      {label} {up ? '+' : '−'}
      {pct(Math.abs(value))}
      <span className="font-normal opacity-80">{suffix}</span>
    </span>
  );
}

export default function Dashboard() {
  const data = useData();
  const { transactions, settings, storedLedgers, entries, ledgers } = data;
  const [preset, setPreset] = useState<RangePreset>('month');
  const [custom, setCustom] = useState<DateRange>(() => presetRange('month', settings.yearType));
  const range = preset === 'custom' ? custom : presetRange(preset, settings.yearType);
  const today = todayISO();

  const quick = useMemo(() => {
    const now = new Date();
    const exp = (r: DateRange) => totals(filterTxns(transactions, { range: r, type: 'expense' })).expense;
    return {
      today: exp(periodRange('daily', now, settings.yearType)),
      week: exp(periodRange('weekly', now, settings.yearType)),
      month: exp(periodRange('monthly', now, settings.yearType)),
    };
  }, [transactions, settings.yearType]);

  const inRange = useMemo(() => filterTxns(transactions, { range }), [transactions, range.from, range.to]);
  const tt = useMemo(() => totals(inRange), [inRange]);
  const short = rangeDays(range) <= 93;
  const barRange = preset === 'today' || preset === 'week' ? periodRange('monthly', new Date(), settings.yearType) : range;
  const barTxns = useMemo(() => filterTxns(transactions, { range: barRange }), [transactions, barRange.from, barRange.to]);
  const trendRange = lastNMonths(12, fromISO(range.to));
  const trend = useMemo(() => byMonth(transactions, trendRange), [transactions, trendRange.from, trendRange.to]);
  // growth: this month vs the same days of last month (fair while the month is still running)
  const mom = useMemo(() => {
    const end = range.to > today ? fromISO(today) : fromISO(range.to);
    const curR = { from: toISO(startOfMonth(end)), to: toISO(end) };
    const prevEnd = addMonths(end, -1);
    const prevR = { from: toISO(startOfMonth(prevEnd)), to: toISO(prevEnd) };
    const c = totals(filterTxns(transactions, { range: curR }));
    const p = totals(filterTxns(transactions, { range: prevR }));
    const partial = toISO(end) !== toISO(endOfMonth(end));
    return { expense: growth(c.expense, p.expense), income: growth(c.income, p.income), label: partial ? 'vs same days last month' : 'vs last month', any: p.count > 0 };
  }, [transactions, range.to, today]);

  const balances = useMemo(() => {
    const b = computeBalances(ledgers, entries, { to: today });
    let cash = 0;
    let bank = 0;
    for (const l of storedLedgers) {
      if (l.group === 'cash') cash += b.get(l.id)?.closing ?? 0;
      if (l.group === 'bank') bank += b.get(l.id)?.closing ?? 0;
    }
    return { cash, bank };
  }, [ledgers, entries, storedLedgers, today]);

  const outstanding = useMemo(() => {
    let due = 0;
    let count = 0;
    for (const e of entries) {
      if (e.kind !== 'invoice') continue;
      const paid = data.payments.get(e.sourceId) ?? 0;
      const bal = e.amount - paid;
      if (bal > 0.005) {
        due += bal;
        count++;
      }
    }
    return { due, count };
  }, [entries, data.payments]);

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (!transactions.length && !data.invoices.length) {
    return (
      <div>
        <PageHeader title={`${greet} 👋`} subtitle="Let’s set up your books. It takes less than a minute." actions={<LoveEgg />} />
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { to: '/add', icon: CirclePlus, title: 'Add your first entry', text: 'Record today’s expense or income — cash, UPI, card or bank.', primary: true },
            { to: '/settings', icon: Settings, title: 'Check company details', text: 'Address, GSTIN and bank details appear on invoices and reports.' },
            { to: '/invoices/new', icon: ReceiptText, title: 'Create an invoice', text: 'GST or non-GST invoices with your logo, as a PDF.' },
          ].map((c) => (
            <Link key={c.to} to={c.to}>
              <Card className={cn('h-full p-5 transition hover:border-line-strong', c.primary && 'border-brand-strong bg-brand-soft/50')}>
                <span className={cn('mb-4 flex size-11 items-center justify-center rounded-xl', c.primary ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-ink')}>
                  <c.icon className="size-5" />
                </span>
                <h3 className="font-semibold text-ink">{c.title}</h3>
                <p className="mt-1 text-sm text-muted">{c.text}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-ink">
                  Start <ArrowRight className="size-4" />
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`${greet} Sree 👋`}
        subtitle={fromISO(today).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={
          <>
            <LoveEgg />
            <Link to="/add" className="hidden lg:block">
              <Button variant="primary" icon={<CirclePlus className="size-4" />}>
                Add entry
              </Button>
            </Link>
          </>
        }
      />

      {/* Quick period cards */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard dense label="Today’s expense" value={quick.today} icon={<CalendarDays className="hidden sm:block" />} />
        <StatCard dense label="This week" value={quick.week} icon={<CalendarRange className="hidden sm:block" />} />
        <StatCard dense label="This month" value={quick.month} icon={<Wallet className="hidden sm:block" />} />
      </div>

      {/* Range filter */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Segmented value={preset} onChange={setPreset} options={PRESETS} size="sm" />
        </div>
        {preset === 'custom' ? (
          <div className="flex items-center gap-2">
            <Input type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} className="h-9 text-sm" />
            <span className="text-muted">–</span>
            <Input type="date" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} className="h-9 text-sm" />
          </div>
        ) : (
          <span className="text-sm font-medium text-ink-2">{rangeLabel(range)}</span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Total income" value={tt.income} icon={<TrendingUp className="text-income" />} sub={`${tt.incomeCount} entries`} />
        <StatCard label="Total expense" value={tt.expense} icon={<TrendingDown className="text-expense" />} sub={`${tt.expenseCount} entries`} />
        <StatCard
          label="Net balance"
          value={tt.net}
          type="net"
          icon={<PiggyBank />}
          sub={tt.income ? `${tt.net >= 0 ? 'Saved' : 'Overspent'} ${pct(Math.abs((tt.net / tt.income) * 100))} of income` : 'Income − expense'}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Expenses by category" subtitle={rangeLabel(range)} />
          <div className="p-4 sm:p-5">
            <CategoryDonut key={`${range.from}${range.to}`} txns={inRange} />
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Income vs expense"
            subtitle="Last 12 months"
            action={
              mom.any ? (
                <div className="hidden flex-col items-end gap-1 sm:flex">
                  <Growth value={mom.expense} goodWhenUp={false} label="Expense" suffix={mom.label} />
                  <Growth value={mom.income} goodWhenUp label="Income" suffix={mom.label} />
                </div>
              ) : undefined
            }
          />
          {mom.any && (
            <div className="flex flex-wrap gap-1.5 px-4 pt-3 sm:hidden">
              <Growth value={mom.expense} goodWhenUp={false} label="Expense" suffix={mom.label} />
              <Growth value={mom.income} goodWhenUp label="Income" suffix={mom.label} />
            </div>
          )}
          <div className="p-3 sm:p-5">
            <TrendLines data={trend} />
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title={short || preset === 'today' || preset === 'week' ? 'Daily expenses' : 'Monthly income & expense'}
          subtitle={preset === 'today' || preset === 'week' ? monthLabel(barRange.from.slice(0, 7), 'MMMM yyyy') : rangeLabel(range)}
        />
        <div className="p-3 sm:p-5">
          {rangeDays(barRange) <= 93 ? (
            <DailyBars data={byDay(barTxns, barRange)} />
          ) : (
            <IncomeExpenseBars data={byMonth(barTxns, barRange)} xKey="month" xFormat={(m) => monthLabel(m, 'MMM')} tipFormat={(m) => monthLabel(m, 'MMMM yyyy')} />
          )}
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="GST snapshot"
              subtitle={rangeLabel(range)}
              action={
                <Link to="/gst" className="text-xs font-semibold text-ink-2 hover:text-ink">
                  GST report →
                </Link>
              }
            />
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-b-2xl border-t border-line bg-line mt-4">
              {[
                ['Spent with GST bill', tt.expenseWithGst],
                ['Spent without GST', tt.expenseWithoutGst],
                ['GST paid (input)', tt.gstPaid],
                ['GST collected (output)', tt.gstCollected],
              ].map(([l, v]) => (
                <div key={l as string} className="bg-surface p-4">
                  <p className="text-xs text-muted">{l}</p>
                  <Money value={v as number} className="text-base font-bold text-ink" />
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-4 sm:p-5">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Wallet className="size-3.5" /> Cash in hand
                </p>
                <Money value={balances.cash} className="mt-1 block text-base font-bold" />
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Landmark className="size-3.5" /> Bank
                </p>
                <Money value={balances.bank} className="mt-1 block text-base font-bold" />
              </div>
              <Link to="/invoices" className="group">
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <BadgePercent className="size-3.5" /> To receive
                </p>
                <Money value={outstanding.due} className="mt-1 block text-base font-bold group-hover:underline" />
                <p className="text-[11px] text-muted">{outstanding.count} invoice{outstanding.count === 1 ? '' : 's'}</p>
              </Link>
            </div>
          </Card>
        </div>
        <Card className="overflow-hidden">
          <CardHeader
            title="Recent entries"
            action={
              <Link to="/daily" className="text-xs font-semibold text-ink-2 hover:text-ink">
                View daily →
              </Link>
            }
          />
          <div className="mt-3 border-t border-line">
            {transactions.length ? (
              <TxnList items={transactions.slice(0, 6)} showDate limit={6} />
            ) : (
              <p className="p-6 text-center text-sm text-muted">No entries yet.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
