import { ChevronDown, ChevronLeft, ChevronRight, FileBarChart, Funnel, Search, X } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { CategoryDonut, IncomeExpenseBars, ShareBar } from '../components/charts';
import { TxnList } from '../components/TxnRow';
import { Button, Card, CardHeader, cn, EmptyState, ExportButtons, Field, IconButton, Input, Money, PageHeader, Segmented, Select, StatCard } from '../components/ui';
import { exportTxnExcel, exportTxnPdf } from '../export/reports';
import { byCategory, byDay, byMonth, byPaymentMode, filterTxns, totals, type CatSummary } from '../lib/analytics';
import { monthLabel, periodLabel, periodRange, presetRange, rangeDays, shiftAnchor, type DateRange, type PeriodKind } from '../lib/dates';
import { colorVar } from '../lib/defaults';
import { fmtDate, pct } from '../lib/format';
import type { EntryType, GstFilter, PaymentMode } from '../lib/types';
import { useData } from '../store/data';

const KINDS: { value: PeriodKind; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
];
const MODE_LABEL: Record<PaymentMode, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank' };

export default function Reports() {
  const data = useData();
  const { transactions, categories, subcategories, settings, currency } = data;
  const [kind, setKind] = useState<PeriodKind>('monthly');
  const [anchor, setAnchor] = useState(new Date());
  const [custom, setCustom] = useState<DateRange>(() => presetRange('month', settings.yearType));
  const [type, setType] = useState<EntryType | 'all'>('all');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [mode, setMode] = useState<PaymentMode | 'all'>('all');
  const [gst, setGst] = useState<GstFilter>('all');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const range = kind === 'custom' ? custom : periodRange(kind, anchor, settings.yearType);
  const label = periodLabel(kind, range, settings.yearType);
  const lookup = { cats: data.catById, subs: data.subById };
  const list = useMemo(
    () => filterTxns(transactions, { range, type, categoryId: categoryId || undefined, subcategoryId: subcategoryId || undefined, paymentMode: mode, gst, search }, lookup),
    [transactions, range.from, range.to, type, categoryId, subcategoryId, mode, gst, search, data.catById, data.subById],
  );
  const tt = useMemo(() => totals(list), [list]);
  const expCats = useMemo(() => byCategory(list, 'expense', data.catById, data.subById), [list, data.catById, data.subById]);
  const incCats = useMemo(() => byCategory(list, 'income', data.catById, data.subById), [list, data.catById, data.subById]);
  const modes = useMemo(() => byPaymentMode(list), [list]);
  const activeFilters = [type !== 'all', !!categoryId, !!subcategoryId, mode !== 'all', gst !== 'all'].filter(Boolean).length;
  const days = rangeDays(range);
  const subs = subcategories.filter((s) => s.categoryId === categoryId);
  const reportTitle = `${KINDS.find((k) => k.value === kind)!.label} Report`;
  const ctx = { settings, currency, catById: data.catById, subById: data.subById, ledgerById: data.ledgerById };

  const clear = () => {
    setType('all');
    setCategoryId('');
    setSubcategoryId('');
    setMode('all');
    setGst('all');
    setSearch('');
  };

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const catTable = (rows: CatSummary[], kindLabel: string, total: number) => (
    <Card className="overflow-hidden">
      <CardHeader title={`${kindLabel} by category`} subtitle="Tap a row to see sub-categories" />
      {rows.length ? (
        <div className="mt-3 border-t border-line">
          {rows.map((c) => {
            const isOpen = open.has(`${kindLabel}${c.categoryId}`);
            return (
              <Fragment key={c.categoryId}>
                <button
                  type="button"
                  onClick={() => toggle(`${kindLabel}${c.categoryId}`)}
                  className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left transition hover:bg-surface-2/60 sm:px-5"
                >
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ background: colorVar(c.color) }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-ink">{c.name}</span>
                      <Money value={c.amount} className="text-sm font-semibold" />
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <ShareBar value={c.pct} color={colorVar(c.color)} />
                      <span className="w-20 shrink-0 text-right text-[11px] text-muted">
                        {pct(c.pct)} · {c.count}
                      </span>
                    </div>
                  </div>
                  <ChevronDown className={cn('size-4 shrink-0 text-muted transition', isOpen && 'rotate-180')} />
                </button>
                {isOpen &&
                  c.subs.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 border-b border-line bg-surface-2/40 py-2 pl-10 pr-4 text-sm sm:pr-5">
                      <span className="min-w-0 flex-1 truncate text-ink-2">{s.name}</span>
                      <span className="text-xs text-muted">
                        {pct(s.pct)} · {s.count}
                      </span>
                      <Money value={s.amount} className="w-28 text-right font-medium" />
                    </div>
                  ))}
              </Fragment>
            );
          })}
          <div className="flex items-center justify-between px-4 py-3 text-sm font-bold sm:px-5">
            <span>Total</span>
            <Money value={total} />
          </div>
        </div>
      ) : (
        <p className="p-6 text-center text-sm text-muted">No {kindLabel.toLowerCase()} in this period.</p>
      )}
    </Card>
  );

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Totals, categories, savings and GST — for any period."
        actions={
          <ExportButtons
            label="Download report"
            onExcel={() => exportTxnExcel(ctx, list, reportTitle, label, range)}
            onPdf={() => exportTxnPdf(ctx, list, reportTitle, label, range)}
          />
        }
      />

      <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Segmented value={kind} onChange={setKind} options={KINDS} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {kind === 'custom' ? (
          <div className="flex items-center gap-2">
            <Input type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} className="h-10" />
            <span className="text-muted">–</span>
            <Input type="date" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} className="h-10" />
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <IconButton label="Previous period" onClick={() => setAnchor((a) => shiftAnchor(kind, a, -1))} className="border border-line bg-surface">
              <ChevronLeft className="size-5" />
            </IconButton>
            <span className="min-w-[150px] rounded-xl border border-line bg-surface px-4 py-2 text-center text-sm font-semibold">{label}</span>
            <IconButton label="Next period" onClick={() => setAnchor((a) => shiftAnchor(kind, a, 1))} className="border border-line bg-surface">
              <ChevronRight className="size-5" />
            </IconButton>
            <Button size="sm" variant="ghost" onClick={() => setAnchor(new Date())}>
              Current
            </Button>
          </div>
        )}
        <Button
          size="sm"
          className="ml-auto"
          icon={<Funnel className="size-4" />}
          onClick={() => setShowFilters((s) => !s)}
          aria-expanded={showFilters}
        >
          Filters{activeFilters ? ` (${activeFilters})` : ''}
        </Button>
      </div>

      {showFilters && (
        <Card className="mt-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Type">
              <Select value={type} onChange={(e) => setType(e.target.value as EntryType | 'all')}>
                <option value="all">Income & expense</option>
                <option value="expense">Expense only</option>
                <option value="income">Income only</option>
              </Select>
            </Field>
            <Field label="Category">
              <Select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setSubcategoryId('');
                }}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sub-category">
              <Select value={subcategoryId} disabled={!categoryId} onChange={(e) => setSubcategoryId(e.target.value)}>
                <option value="">All sub-categories</option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Payment mode">
              <Select value={mode} onChange={(e) => setMode(e.target.value as PaymentMode | 'all')}>
                <option value="all">All modes</option>
                {(Object.keys(MODE_LABEL) as PaymentMode[]).map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABEL[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="GST">
              <Select value={gst} onChange={(e) => setGst(e.target.value as GstFilter)}>
                <option value="all">GST + non-GST</option>
                <option value="gst">With GST only</option>
                <option value="nogst">Without GST only</option>
              </Select>
            </Field>
          </div>
          {activeFilters > 0 && (
            <Button size="sm" variant="ghost" className="mt-3" icon={<X className="size-4" />} onClick={clear}>
              Clear filters
            </Button>
          )}
        </Card>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Income" value={tt.income} sub={`${tt.incomeCount} entries`} />
        <StatCard label="Expense" value={tt.expense} sub={`${tt.expenseCount} entries`} />
        <StatCard label="Savings" value={tt.net} type="net" sub={tt.income ? `${pct((tt.net / tt.income) * 100)} of income` : 'income − expense'} />
        <StatCard label="Avg. daily spend" value={tt.expense / Math.max(1, days)} sub={`over ${days} day${days > 1 ? 's' : ''}`} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Spent with GST bill" value={tt.expenseWithGst} />
        <StatCard label="Spent without GST" value={tt.expenseWithoutGst} />
        <StatCard label="GST paid (input)" value={tt.gstPaid} />
        <StatCard label="GST collected (output)" value={tt.gstCollected} />
      </div>

      {list.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            icon={<FileBarChart />}
            title="No entries for this report"
            text={activeFilters || search ? 'Try clearing filters or choosing another period.' : 'Pick another period, or add entries to see your report.'}
            action={
              (activeFilters > 0 || !!search) && (
                <Button onClick={clear} icon={<X className="size-4" />}>
                  Clear filters
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title="Income vs expense" subtitle={label} />
              <div className="p-3 sm:p-5">
                {days <= 1 ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-income-soft p-4">
                      <p className="text-xs font-medium text-income">Income</p>
                      <Money value={tt.income} className="text-xl font-bold text-income" />
                    </div>
                    <div className="rounded-xl bg-expense-soft p-4">
                      <p className="text-xs font-medium text-expense">Expense</p>
                      <Money value={tt.expense} className="text-xl font-bold text-expense" />
                    </div>
                  </div>
                ) : days <= 93 ? (
                  <IncomeExpenseBars data={byDay(list, range)} xKey="date" xFormat={(d) => fmtDate(d, days > 8 ? 'd' : 'EEE')} tipFormat={(d) => fmtDate(d, 'EEE, dd MMM yyyy')} />
                ) : (
                  <IncomeExpenseBars data={byMonth(list, range)} xKey="month" xFormat={(m) => monthLabel(m, 'MMM')} tipFormat={(m) => monthLabel(m, 'MMMM yyyy')} />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Expense breakdown" subtitle="Tap a slice for sub-categories" />
              <div className="p-4 sm:p-5">
                <CategoryDonut key={`${range.from}${range.to}${categoryId}`} txns={list} />
              </div>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {catTable(expCats, 'Expenses', tt.expense)}
            <div className="space-y-4">
              {catTable(incCats, 'Income', tt.income)}
              <Card className="overflow-hidden">
                <CardHeader title="By payment mode" />
                <div className="mt-3 border-t border-line">
                  {modes.map((m) => (
                    <div key={m.mode} className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-b-0 sm:px-5">
                      <span className="flex-1 font-medium">{MODE_LABEL[m.mode]}</span>
                      <span className="text-xs text-muted">{m.count} entries</span>
                      {m.income > 0 && <Money value={m.income} type="income" signed className="w-28 text-right" />}
                      <Money value={m.expense} type="expense" signed className="w-28 text-right" />
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <h3 className="text-[15px] font-semibold">
            Entries <span className="text-muted">({list.length})</span>
          </h3>
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes, party, amount…" className="h-10 pl-9" />
          </div>
        </div>
        <div className="mt-3 border-t border-line">
          {list.length ? <TxnList items={list} showDate limit={30} /> : <p className="p-6 text-center text-sm text-muted">No entries.</p>}
        </div>
      </Card>
    </div>
  );
}
