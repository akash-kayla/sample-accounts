import { ArrowLeft } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { byCategory, type DayPoint, type MonthPoint } from '../lib/analytics';
import { monthLabel } from '../lib/dates';
import { colorVar } from '../lib/defaults';
import { fmtDate, money, moneyCompact, pct } from '../lib/format';
import type { Transaction } from '../lib/types';
import { useData } from '../store/data';
import { cn } from './ui';

const AXIS = { fontSize: 11, fill: 'var(--chart-axis)' };

interface TipRow {
  name: string;
  value: number;
  color: string;
}

function TipBox({ title, rows, currency }: { title: ReactNode; rows: TipRow[]; currency: string }) {
  return (
    <div className="min-w-[150px] rounded-xl border border-line bg-surface px-3 py-2.5 shadow-xl">
      <p className="mb-1.5 text-xs font-medium text-muted">{title}</p>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-2 py-0.5">
          <span className="h-0.5 w-3 rounded-full" style={{ background: r.color }} />
          <span className="tabular text-sm font-bold text-ink">{money(r.value, currency)}</span>
          <span className="text-xs text-ink-2">{r.name}</span>
        </div>
      ))}
    </div>
  );
}

type AnyTip = { active?: boolean; payload?: readonly { name?: unknown; value?: unknown; color?: string; stroke?: string; fill?: string; payload?: Record<string, unknown> }[]; label?: unknown };

/* ---------------- Donut with drill-down ---------------- */

interface Slice {
  id: string;
  name: string;
  value: number;
  color: string;
  pct: number;
}

export function CategoryDonut({ txns, type = 'expense', height = 240 }: { txns: Transaction[]; type?: 'expense' | 'income'; height?: number }) {
  const { catById, subById, subcategories, currency } = useData();
  const [drill, setDrill] = useState<string | null>(null);
  const cats = useMemo(() => byCategory(txns, type, catById, subById), [txns, type, catById, subById]);
  const total = cats.reduce((s, c) => s + c.amount, 0);
  const drilled = drill ? cats.find((c) => c.categoryId === drill) : undefined;

  const slices: Slice[] = useMemo(() => {
    if (drilled) {
      const order = subcategories.filter((s) => s.categoryId === drilled.categoryId).map((s) => s.id);
      return drilled.subs.map((s) => {
        const i = order.indexOf(s.id);
        return { id: s.id, name: s.name, value: s.amount, pct: s.pct, color: i < 0 ? 'var(--chart-other)' : colorVar(`c${(i % 8) + 1}`) };
      });
    }
    // top 7 + Other (never cycle hues past the 8 slots)
    const top = cats.slice(0, 7).map((c) => ({ id: c.categoryId, name: c.name, value: c.amount, pct: c.pct, color: colorVar(c.color) }));
    const rest = cats.slice(7);
    if (rest.length) {
      const v = rest.reduce((s, c) => s + c.amount, 0);
      top.push({ id: '_other', name: `Other (${rest.length})`, value: v, pct: total ? (v / total) * 100 : 0, color: 'var(--chart-other)' });
    }
    return top;
  }, [cats, drilled, subcategories, total]);

  if (!cats.length) return <ChartEmpty height={height} text={`No ${type === 'expense' ? 'expenses' : 'income'} in this period`} />;
  const centerValue = drilled ? drilled.amount : total;

  return (
    <div>
      {drilled && (
        <button
          type="button"
          onClick={() => setDrill(null)}
          className="mb-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" /> All categories
        </button>
      )}
      <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,220px)_1fr]">
        <div className="relative mx-auto w-full max-w-[220px]" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                innerRadius="62%"
                outerRadius="98%"
                paddingAngle={slices.length > 1 ? 1.5 : 0}
                stroke="var(--chart-surface)"
                strokeWidth={2}
                isAnimationActive={false}
                onClick={(_: unknown, i: number) => {
                  const s = slices[i];
                  if (!drilled && s && s.id !== '_other') setDrill(s.id);
                }}
                className={cn(!drilled && 'cursor-pointer')}
              >
                {slices.map((s) => (
                  <Cell key={s.id} fill={s.color} />
                ))}
              </Pie>
              <Tooltip
                content={(p: AnyTip) => {
                  const d = p.payload?.[0]?.payload as unknown as Slice | undefined;
                  if (!p.active || !d) return null;
                  return <TipBox title={`${d.name} · ${pct(d.pct)}`} rows={[{ name: '', value: d.value, color: d.color }]} currency={currency} />;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[11px] font-medium text-muted">{drilled ? drilled.name : 'Total'}</span>
            <span className="tabular text-lg font-bold text-ink">{moneyCompact(centerValue, currency)}</span>
          </div>
        </div>
        <ul className="space-y-0.5">
          {slices.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                disabled={!!drilled || s.id === '_other'}
                onClick={() => setDrill(s.id)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition enabled:hover:bg-surface-2"
              >
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{s.name}</span>
                <span className="text-xs text-muted">{pct(s.pct)}</span>
                <span className="tabular w-24 text-right text-sm font-semibold text-ink">{moneyCompact(s.value, currency)}</span>
              </button>
            </li>
          ))}
          {!drilled && <li className="px-2 pt-1 text-[11px] text-muted">Tap a slice or row to see sub-categories</li>}
        </ul>
      </div>
    </div>
  );
}

export function ChartEmpty({ height, text }: { height: number; text: string }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted" style={{ height }}>
      {text}
    </div>
  );
}

/* ---------------- Daily bars (single series) ---------------- */

export function DailyBars({ data, height = 220, series = 'expense' }: { data: DayPoint[]; height?: number; series?: 'expense' | 'income' }) {
  const { currency } = useData();
  const any = data.some((d) => d[series] > 0);
  if (!any) return <ChartEmpty height={height} text="No entries yet in this period" />;
  const color = series === 'expense' ? 'var(--chart-expense)' : 'var(--chart-income)';
  const dense = data.length > 20;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap={dense ? '18%' : '30%'}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={{ stroke: 'var(--chart-grid)' }}
            tick={AXIS}
            tickFormatter={(d: string) => (data.length > 31 ? fmtDate(d, 'dd MMM') : fmtDate(d, 'd'))}
            interval={dense ? 'preserveStartEnd' : 0}
            minTickGap={4}
          />
          <YAxis tickLine={false} axisLine={false} tick={AXIS} width={52} tickFormatter={(v: number) => moneyCompact(v, currency)} />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            content={(p: AnyTip) => {
              const d = p.payload?.[0]?.payload as unknown as DayPoint | undefined;
              if (!p.active || !d) return null;
              return (
                <TipBox
                  title={fmtDate(d.date, 'EEE, dd MMM yyyy')}
                  rows={[{ name: series === 'expense' ? 'spent' : 'received', value: d[series], color }]}
                  currency={currency}
                />
              );
            }}
          />
          <Bar dataKey={series} fill={color} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------- Income vs expense (2 series) ---------------- */

export function IncomeExpenseBars<T extends { income: number; expense: number }>({
  data,
  xKey,
  xFormat,
  tipFormat,
  height = 240,
}: {
  data: T[];
  xKey: keyof T & string;
  xFormat: (v: string) => string;
  tipFormat: (v: string) => string;
  height?: number;
}) {
  const { currency } = useData();
  if (!data.some((d) => d.income || d.expense)) return <ChartEmpty height={height} text="No entries in this period" />;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey={xKey as never} tickLine={false} axisLine={{ stroke: 'var(--chart-grid)' }} tick={AXIS} tickFormatter={xFormat} minTickGap={6} />
          <YAxis tickLine={false} axisLine={false} tick={AXIS} width={52} tickFormatter={(v: number) => moneyCompact(v, currency)} />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            content={(p: AnyTip) => {
              const d = p.payload?.[0]?.payload as unknown as T | undefined;
              if (!p.active || !d) return null;
              return (
                <TipBox
                  title={tipFormat(String(d[xKey]))}
                  rows={[
                    { name: 'income', value: d.income, color: 'var(--chart-income)' },
                    { name: 'expense', value: d.expense, color: 'var(--chart-expense)' },
                  ]}
                  currency={currency}
                />
              );
            }}
          />
          <Legend content={() => <LegendRow items={[{ label: 'Income', color: 'var(--chart-income)' }, { label: 'Expense', color: 'var(--chart-expense)' }]} />} />
          <Bar dataKey="income" name="Income" fill="var(--chart-income)" radius={[4, 4, 0, 0]} maxBarSize={20} isAnimationActive={false} />
          <Bar dataKey="expense" name="Expense" fill="var(--chart-expense)" radius={[4, 4, 0, 0]} maxBarSize={20} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LegendRow({ items, line }: { items: { label: string; color: string }[]; line?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 pt-2 text-xs text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className={line ? 'h-0.5 w-3.5 rounded-full' : 'size-2.5 rounded-sm'} style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function TrendLines({ data, height = 240 }: { data: MonthPoint[]; height?: number }) {
  const { currency } = useData();
  if (!data.some((d) => d.income || d.expense)) return <ChartEmpty height={height} text="Not enough history yet" />;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: 'var(--chart-grid)' }} tick={AXIS} tickFormatter={(m: string) => monthLabel(m, 'MMM')} minTickGap={8} />
          <YAxis tickLine={false} axisLine={false} tick={AXIS} width={52} tickFormatter={(v: number) => moneyCompact(v, currency)} />
          <Tooltip
            cursor={{ stroke: 'var(--chart-axis)', strokeWidth: 1 }}
            content={(p: AnyTip) => {
              const d = p.payload?.[0]?.payload as unknown as MonthPoint | undefined;
              if (!p.active || !d) return null;
              return (
                <TipBox
                  title={monthLabel(d.month, 'MMMM yyyy')}
                  rows={[
                    { name: 'income', value: d.income, color: 'var(--chart-income)' },
                    { name: 'expense', value: d.expense, color: 'var(--chart-expense)' },
                  ]}
                  currency={currency}
                />
              );
            }}
          />
          <Legend content={() => <LegendRow line items={[{ label: 'Income', color: 'var(--chart-income)' }, { label: 'Expense', color: 'var(--chart-expense)' }]} />} />
          {(['income', 'expense'] as const).map((k) => (
            <Line
              key={k}
              type="monotone"
              dataKey={k}
              name={k === 'income' ? 'Income' : 'Expense'}
              stroke={`var(--chart-${k})`}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={{ r: 3.5, fill: `var(--chart-${k})`, stroke: 'var(--chart-surface)', strokeWidth: 2 }}
              activeDot={{ r: 5, fill: `var(--chart-${k})`, stroke: 'var(--chart-surface)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal share bars (category table helper) */
export function ShareBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div className="h-full rounded-full" style={{ width: `${Math.max(1.5, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}
