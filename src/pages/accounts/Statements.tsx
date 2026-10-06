import { CircleAlert, CircleCheck } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, cn, ExportButtons } from '../../components/ui';
import { exportSimpleExcel, exportSimplePdf, type SimpleSection } from '../../export/reports';
import { balanceSheet, GROUPS, profitLoss, trialBalance, type BSGroup, type PLRow } from '../../lib/accounting';
import { fmtDate, money } from '../../lib/format';
import { todayISO, yearRange, rangeLabel, type DateRange } from '../../lib/dates';
import type { LedgerGroup } from '../../lib/types';
import { useData } from '../../store/data';
import { AsOfBar, RangeBar } from './shared';

function useCtx() {
  const d = useData();
  return { settings: d.settings, currency: d.currency, catById: d.catById, subById: d.subById, ledgerById: d.ledgerById };
}

function Status({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className={cn('mt-3 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium', ok ? 'bg-income-soft text-income' : 'bg-warn-soft text-warn')}>
      {ok ? <CircleCheck className="size-4" /> : <CircleAlert className="size-4" />}
      {children}
    </div>
  );
}

/* ---------------- Trial balance ---------------- */

export function TrialBalancePage() {
  const data = useData();
  const ctx = useCtx();
  const { currency } = data;
  const [asOf, setAsOf] = useState(todayISO());
  const tb = useMemo(() => trialBalance(data.ledgers, data.entries, asOf), [data.ledgers, data.entries, asOf]);
  const groups = useMemo(() => {
    const m = new Map<LedgerGroup, typeof tb.rows>();
    for (const r of tb.rows) m.set(r.ledger.group, [...(m.get(r.ledger.group) ?? []), r]);
    return [...m.entries()];
  }, [tb]);
  const sub = `As on ${fmtDate(asOf)}`;
  const section: SimpleSection = {
    head: ['Particulars', 'Group', 'Debit', 'Credit'],
    types: ['text', 'text', 'money', 'money'],
    rows: tb.rows.map((r) => [r.ledger.name, GROUPS[r.ledger.group].label, r.debit || '', r.credit || '']),
    foot: ['Grand Total', '', tb.debit, tb.credit],
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <AsOfBar value={asOf} onChange={setAsOf} />
        <ExportButtons
          compact
          onExcel={() => exportSimpleExcel(ctx, { title: 'Trial Balance', subtitle: sub, fileName: `Trial Balance ${asOf}`, sections: [{ ...section, sheet: 'Trial Balance', sum: [2, 3] }] })}
          onPdf={() => exportSimplePdf(ctx, { title: 'Trial Balance', subtitle: sub, fileName: `Trial Balance ${asOf}`, sections: [section] })}
        />
      </div>
      {Math.abs(tb.difference) < 0.005 ? (
        <Status ok>Debit and credit totals match.</Status>
      ) : (
        <Status ok={false}>Difference of {money(Math.abs(tb.difference), currency)} — from unequal opening balances. Check ledger opening balances.</Status>
      )}
      <Card className="mt-3 overflow-hidden">
        <div className="grid grid-cols-[1fr_110px_110px] gap-3 border-b border-line bg-surface-2/60 px-4 py-2.5 text-xs font-semibold text-muted sm:grid-cols-[1fr_150px_150px] sm:px-5">
          <span>Particulars</span>
          <span className="text-right">Debit</span>
          <span className="text-right">Credit</span>
        </div>
        {groups.length === 0 && <p className="p-8 text-center text-sm text-muted">No balances yet.</p>}
        {groups.map(([g, rows]) => (
          <div key={g}>
            <div className="grid grid-cols-[1fr_110px_110px] gap-3 border-b border-line px-4 py-2 text-sm font-semibold sm:grid-cols-[1fr_150px_150px] sm:px-5">
              <span>{GROUPS[g].label}</span>
              <span className="tabular text-right">{sumOr(rows.map((r) => r.debit), currency)}</span>
              <span className="tabular text-right">{sumOr(rows.map((r) => r.credit), currency)}</span>
            </div>
            {rows.map((r) => (
              <div key={r.ledger.id} className="grid grid-cols-[1fr_110px_110px] gap-3 border-b border-line px-4 py-2 text-sm sm:grid-cols-[1fr_150px_150px] sm:px-5">
                <Link to={`/accounts/ledgers/${encodeURIComponent(r.ledger.id)}`} className="truncate pl-4 text-ink-2 hover:text-ink hover:underline">
                  {r.ledger.name}
                </Link>
                <span className="tabular text-right text-ink-2">{r.debit ? money(r.debit, currency) : ''}</span>
                <span className="tabular text-right text-ink-2">{r.credit ? money(r.credit, currency) : ''}</span>
              </div>
            ))}
          </div>
        ))}
        <div className="grid grid-cols-[1fr_110px_110px] gap-3 bg-surface-2/60 px-4 py-3 text-sm font-bold sm:grid-cols-[1fr_150px_150px] sm:px-5">
          <span>Grand Total</span>
          <span className="tabular text-right">{money(tb.debit, currency)}</span>
          <span className="tabular text-right">{money(tb.credit, currency)}</span>
        </div>
      </Card>
    </div>
  );
}

function sumOr(v: number[], currency: string) {
  const s = v.reduce((a, b) => a + b, 0);
  return s ? money(s, currency) : '';
}

/* ---------------- Profit & loss ---------------- */

function Side({ title, rows, total, extra, currency }: { title: string; rows: PLRow[]; total: number; extra?: { label: string; value: number; tone: 'income' | 'expense' }; currency: string }) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="border-b border-line bg-surface-2/60 px-4 py-3 text-sm font-semibold sm:px-5">{title}</div>
      <div className="flex-1">
        {rows.length === 0 && <p className="p-6 text-center text-sm text-muted">Nothing in this period.</p>}
        {rows.map((r) => (
          <div key={r.ledger.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-sm sm:px-5">
            <Link to={`/accounts/ledgers/${encodeURIComponent(r.ledger.id)}`} className="truncate hover:underline">
              {r.ledger.name}
            </Link>
            <span className="tabular">{money(r.amount, currency)}</span>
          </div>
        ))}
        {extra && (
          <div className={cn('flex items-center justify-between px-4 py-2.5 text-sm font-semibold sm:px-5', extra.tone === 'income' ? 'text-income' : 'text-expense')}>
            <span>{extra.label}</span>
            <span className="tabular">{money(extra.value, currency)}</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between bg-surface-2/60 px-4 py-3 text-sm font-bold sm:px-5">
        <span>Total</span>
        <span className="tabular">{money(total, currency)}</span>
      </div>
    </Card>
  );
}

export function ProfitLossPage() {
  const data = useData();
  const ctx = useCtx();
  const { currency } = data;
  const [range, setRange] = useState<DateRange>(() => yearRange(new Date(), 'fy'));
  const pl = useMemo(() => profitLoss(data.ledgers, data.entries, range), [data.ledgers, data.entries, range]);
  const profit = pl.net >= 0;
  const grand = Math.max(pl.totalIncome, pl.totalExpense);
  const sub = rangeLabel(range);
  const sections: SimpleSection[] = [
    {
      title: 'Income',
      head: ['Particulars', 'Amount'],
      types: ['text', 'money'],
      rows: pl.income.map((r) => [r.ledger.name, r.amount]),
      foot: ['Total income', pl.totalIncome],
    },
    {
      title: 'Expenses',
      head: ['Particulars', 'Amount'],
      types: ['text', 'money'],
      rows: pl.expenses.map((r) => [r.ledger.name, r.amount]),
      foot: ['Total expenses', pl.totalExpense],
    },
    { title: 'Result', head: ['Particulars', 'Amount'], types: ['text', 'money'], rows: [[profit ? 'Net Profit' : 'Net Loss', Math.abs(pl.net)]] },
  ];

  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <RangeBar value={range} onChange={setRange} />
        <ExportButtons
          compact
          onExcel={() =>
            exportSimpleExcel(ctx, {
              title: 'Profit & Loss',
              subtitle: sub,
              fileName: `Profit and Loss ${sub}`,
              summary: [
                { label: 'Period', value: sub, type: 'text' },
                { label: 'Total income', value: pl.totalIncome },
                { label: 'Total expenses', value: pl.totalExpense },
                { label: profit ? 'Net profit' : 'Net loss', value: Math.abs(pl.net) },
              ],
              sections: [
                { ...sections[0]!, sheet: 'Income', sum: [1] },
                { ...sections[1]!, sheet: 'Expenses', sum: [1] },
              ],
            })
          }
          onPdf={() =>
            exportSimplePdf(ctx, {
              title: 'Profit & Loss Account',
              subtitle: sub,
              fileName: `Profit and Loss ${sub}`,
              summary: [
                { label: 'Income', value: money(pl.totalIncome, currency), tone: 'income' },
                { label: 'Expenses', value: money(pl.totalExpense, currency), tone: 'expense' },
                { label: profit ? 'Net profit' : 'Net loss', value: money(Math.abs(pl.net), currency), tone: profit ? 'income' : 'expense' },
              ],
              sections,
            })
          }
        />
      </div>
      <div className={cn('mt-3 rounded-2xl p-5', profit ? 'bg-income-soft' : 'bg-expense-soft')}>
        <p className={cn('text-sm font-medium', profit ? 'text-income' : 'text-expense')}>{profit ? 'Net profit' : 'Net loss'}</p>
        <p className={cn('tabular text-3xl font-bold', profit ? 'text-income' : 'text-expense')}>{money(Math.abs(pl.net), currency)}</p>
        <p className="mt-1 text-xs text-ink-2">
          Income {money(pl.totalIncome, currency)} − Expenses {money(pl.totalExpense, currency)}
        </p>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Side title="Expenses (Dr)" rows={pl.expenses} total={grand} extra={profit && pl.net > 0 ? { label: 'Net Profit', value: pl.net, tone: 'income' } : undefined} currency={currency} />
        <Side title="Income (Cr)" rows={pl.income} total={grand} extra={!profit ? { label: 'Net Loss', value: -pl.net, tone: 'expense' } : undefined} currency={currency} />
      </div>
    </div>
  );
}

/* ---------------- Balance sheet ---------------- */

function BSSide({ title, groups, extras, total, currency }: { title: string; groups: BSGroup[]; extras: { label: string; value: number }[]; total: number; currency: string }) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="border-b border-line bg-surface-2/60 px-4 py-3 text-sm font-semibold sm:px-5">{title}</div>
      <div className="flex-1">
        {groups.length === 0 && extras.length === 0 && <p className="p-6 text-center text-sm text-muted">No balances.</p>}
        {groups.map((g) => (
          <div key={g.label} className="border-b border-line py-1">
            <div className="flex items-center justify-between px-4 py-1.5 text-sm font-semibold sm:px-5">
              <span>{g.label}</span>
              <span className="tabular">{money(g.total, currency)}</span>
            </div>
            {g.rows.map((r) => (
              <div key={r.ledger.id} className="flex items-center justify-between gap-3 px-4 py-1 pl-8 text-[13px] text-ink-2 sm:px-5 sm:pl-9">
                <Link to={`/accounts/ledgers/${encodeURIComponent(r.ledger.id)}`} className="truncate hover:text-ink hover:underline">
                  {r.ledger.name}
                </Link>
                <span className="tabular">{money(r.amount, currency)}</span>
              </div>
            ))}
          </div>
        ))}
        {extras.map((e) => (
          <div key={e.label} className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm font-semibold sm:px-5">
            <span>{e.label}</span>
            <span className={cn('tabular', e.value < 0 && 'text-expense')}>{money(e.value, currency)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between bg-surface-2/60 px-4 py-3 text-sm font-bold sm:px-5">
        <span>Total</span>
        <span className="tabular">{money(total, currency)}</span>
      </div>
    </Card>
  );
}

export function BalanceSheetPage() {
  const data = useData();
  const ctx = useCtx();
  const { currency } = data;
  const [asOf, setAsOf] = useState(todayISO());
  const bs = useMemo(() => balanceSheet(data.ledgers, data.entries, asOf), [data.ledgers, data.entries, asOf]);
  const liabExtras = [{ label: bs.profit >= 0 ? 'Profit & Loss A/c (profit)' : 'Profit & Loss A/c (loss)', value: bs.profit }];
  if (bs.openingDiff > 0.005) liabExtras.push({ label: 'Difference in opening balances', value: bs.openingDiff });
  const assetExtras = bs.openingDiff < -0.005 ? [{ label: 'Difference in opening balances', value: -bs.openingDiff }] : [];
  const balanced = Math.abs(bs.totalAssets - bs.totalLiabilities) < 0.01;
  const sub = `As on ${fmtDate(asOf)}`;
  const toSection = (title: string, groups: BSGroup[], extras: { label: string; value: number }[], total: number): SimpleSection => ({
    title,
    head: ['Particulars', 'Ledger', 'Amount'],
    types: ['text', 'text', 'money'],
    rows: [...groups.flatMap((g) => [[g.label, '', g.total] as (string | number)[], ...g.rows.map((r) => ['', r.ledger.name, r.amount])]), ...extras.map((e) => [e.label, '', e.value])],
    foot: ['Total', '', total],
  });
  const sections = [toSection('Liabilities & Capital', bs.liabilities, liabExtras, bs.totalLiabilities), toSection('Assets', bs.assets, assetExtras, bs.totalAssets)];

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <AsOfBar value={asOf} onChange={setAsOf} />
        <ExportButtons
          compact
          onExcel={() =>
            exportSimpleExcel(ctx, {
              title: 'Balance Sheet',
              subtitle: sub,
              fileName: `Balance Sheet ${asOf}`,
              sections: [
                { ...sections[0]!, sheet: 'Liabilities' },
                { ...sections[1]!, sheet: 'Assets' },
              ],
            })
          }
          onPdf={() => exportSimplePdf(ctx, { title: 'Balance Sheet', subtitle: sub, fileName: `Balance Sheet ${asOf}`, sections })}
        />
      </div>
      {balanced ? <Status ok>Balance sheet tallies.</Status> : <Status ok={false}>Totals differ by {money(Math.abs(bs.totalAssets - bs.totalLiabilities), currency)}.</Status>}
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <BSSide title="Liabilities & Capital" groups={bs.liabilities} extras={liabExtras} total={bs.totalLiabilities} currency={currency} />
        <BSSide title="Assets" groups={bs.assets} extras={assetExtras} total={bs.totalAssets} currency={currency} />
      </div>
    </div>
  );
}
