import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, Card, CardHeader, cn, ExportButtons, IconButton, Input, Money, PageHeader, Segmented, StatCard } from '../components/ui';
import { exportSimpleExcel, exportSimplePdf, type SimpleSection } from '../export/reports';
import { fmtDate, money, round2 } from '../lib/format';
import { calcInvoice } from '../lib/gst';
import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns';
import { fromISO, fyLabel, periodRange, presetRange, toISO, type DateRange } from '../lib/dates';
import { useData } from '../store/data';

type Kind = 'month' | 'quarter' | 'year' | 'custom';

interface GstRow {
  key: string;
  date: string;
  dir: 'output' | 'input';
  source: 'Invoice' | 'Entry';
  party: string;
  gstin: string;
  ref: string;
  label: string;
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  total: number;
}

function quarterRange(d: Date): DateRange {
  const start = new Date(d.getFullYear(), d.getMonth() - (d.getMonth() % 3), 1);
  return { from: toISO(start), to: toISO(endOfMonth(addMonths(start, 2))) };
}

export default function Gst() {
  const data = useData();
  const { transactions, invoices, settings, currency, catById, subById } = data;
  const [kind, setKind] = useState<Kind>('month');
  const [anchor, setAnchor] = useState(new Date());
  const [custom, setCustom] = useState<DateRange>(() => presetRange('month', settings.yearType));
  const [tab, setTab] = useState<'output' | 'input' | 'nogst'>('output');

  const range: DateRange =
    kind === 'custom' ? custom : kind === 'month' ? periodRange('monthly', anchor, settings.yearType) : kind === 'quarter' ? quarterRange(anchor) : periodRange('yearly', anchor, 'fy');
  const shift = (dir: 1 | -1) => setAnchor((a) => addMonths(startOfMonth(a), kind === 'month' ? dir : kind === 'quarter' ? 3 * dir : 12 * dir));
  const label =
    kind === 'month'
      ? format(anchor, 'MMMM yyyy')
      : kind === 'quarter'
        ? `Q${Math.floor(((anchor.getMonth() - 3 + 12) % 12) / 3) + 1} FY ${fyLabel(anchor)} · ${format(fromISO(range.from), 'MMM')}–${format(fromISO(range.to), 'MMM yyyy')}`
        : kind === 'year'
          ? `FY ${fyLabel(anchor)}`
          : `${fmtDate(range.from)} – ${fmtDate(range.to)}`;

  const { rows, nonGst } = useMemo(() => {
    const out: GstRow[] = [];
    const non: { key: string; date: string; type: string; label: string; party: string; amount: number; source: string }[] = [];
    for (const t of transactions) {
      if (t.date < range.from || t.date > range.to) continue;
      const cat = catById.get(t.categoryId)?.name ?? 'Uncategorised';
      const sub = t.subcategoryId ? subById.get(t.subcategoryId)?.name : '';
      const lab = sub ? `${cat} › ${sub}` : cat;
      if (!t.gstEnabled) {
        non.push({ key: t.id, date: t.date, type: t.type === 'expense' ? 'Expense' : 'Income', label: lab, party: t.notes, amount: t.amount, source: 'Entry' });
        continue;
      }
      out.push({
        key: t.id,
        date: t.date,
        dir: t.type === 'income' ? 'output' : 'input',
        source: 'Entry',
        party: t.partyName,
        gstin: t.gstin,
        ref: t.billNo,
        label: lab,
        rate: t.gstRate,
        taxable: t.taxableAmount,
        cgst: t.cgst,
        sgst: t.sgst,
        igst: t.igst,
        tax: round2(t.cgst + t.sgst + t.igst),
        total: t.amount,
      });
    }
    for (const inv of invoices) {
      if (inv.status !== 'final' || inv.date < range.from || inv.date > range.to) continue;
      const c = calcInvoice(inv, settings.company.state);
      if (!inv.withGst) {
        non.push({ key: inv.id, date: inv.date, type: 'Sales invoice', label: inv.number, party: inv.customer.name, amount: c.total, source: 'Invoice' });
        continue;
      }
      for (const r of c.byRate)
        out.push({
          key: `${inv.id}-${r.rate}`,
          date: inv.date,
          dir: 'output',
          source: 'Invoice',
          party: inv.customer.name,
          gstin: inv.customer.gstin,
          ref: inv.number,
          label: 'Sales invoice',
          rate: r.rate,
          taxable: r.taxable,
          cgst: r.cgst,
          sgst: r.sgst,
          igst: r.igst,
          tax: r.tax,
          total: round2(r.taxable + r.tax),
        });
    }
    out.sort((a, b) => (a.date < b.date ? -1 : 1));
    non.sort((a, b) => (a.date < b.date ? -1 : 1));
    return { rows: out, nonGst: non };
  }, [transactions, invoices, range.from, range.to, catById, subById, settings.company.state]);

  const sum = (list: GstRow[]) =>
    list.reduce(
      (s, r) => ({ taxable: s.taxable + r.taxable, cgst: s.cgst + r.cgst, sgst: s.sgst + r.sgst, igst: s.igst + r.igst, tax: s.tax + r.tax, total: s.total + r.total }),
      { taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, total: 0 },
    );
  const output = rows.filter((r) => r.dir === 'output');
  const input = rows.filter((r) => r.dir === 'input');
  const o = sum(output);
  const i = sum(input);
  const net = round2(o.tax - i.tax);
  const nonGstOut = nonGst.filter((n) => n.type !== 'Expense').reduce((s, n) => s + n.amount, 0);
  const nonGstIn = nonGst.filter((n) => n.type === 'Expense').reduce((s, n) => s + n.amount, 0);

  const byRate = (list: GstRow[]) => {
    const m = new Map<number, ReturnType<typeof sum> & { count: number }>();
    for (const r of list) {
      const x = m.get(r.rate) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, total: 0, count: 0 };
      x.taxable += r.taxable;
      x.cgst += r.cgst;
      x.sgst += r.sgst;
      x.igst += r.igst;
      x.tax += r.tax;
      x.total += r.total;
      x.count++;
      m.set(r.rate, x);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  };

  // ---------- export ----------
  const ctx = { settings, currency, catById, subById, ledgerById: data.ledgerById };
  const detailSection = (title: string, list: GstRow[], sheet: string): SimpleSection & { sheet: string; sum: number[] } => {
    const s = sum(list);
    return {
      sheet,
      title,
      head: ['Date', 'Particulars', 'Party', 'GSTIN', 'Bill / Inv No', 'GST %', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total GST', 'Gross'],
      types: ['date', 'text', 'text', 'text', 'text', 'int', 'money', 'money', 'money', 'money', 'money', 'money'],
      rows: list.map((r) => [r.date, r.label, r.party, r.gstin, r.ref, r.rate, r.taxable, r.cgst, r.sgst, r.igst, r.tax, r.total]),
      foot: ['', 'Total', '', '', '', '', s.taxable, s.cgst, s.sgst, s.igst, s.tax, s.total],
      sum: [6, 7, 8, 9, 10, 11],
    };
  };
  const rateSection = (): SimpleSection & { sheet: string; sum: number[] } => ({
    sheet: 'Rate-wise',
    title: 'Rate-wise summary',
    head: ['Direction', 'GST %', 'Entries', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total GST'],
    types: ['text', 'int', 'int', 'money', 'money', 'money', 'money', 'money'],
    rows: [
      ...byRate(output).map(([rate, x]) => ['Output (Sales)', rate, x.count, x.taxable, x.cgst, x.sgst, x.igst, x.tax]),
      ...byRate(input).map(([rate, x]) => ['Input (Purchases)', rate, x.count, x.taxable, x.cgst, x.sgst, x.igst, x.tax]),
    ],
    sum: [],
  });
  const nonSection = (): SimpleSection & { sheet: string; sum: number[] } => ({
    sheet: 'Without GST',
    title: 'Entries without GST',
    head: ['Date', 'Type', 'Particulars', 'Party / Notes', 'Amount'],
    types: ['date', 'text', 'text', 'text', 'money'],
    rows: nonGst.map((n) => [n.date, n.type, n.label, n.party, n.amount]),
    foot: ['', '', 'Total', '', nonGst.reduce((s, n) => s + n.amount, 0)],
    sum: [4],
  });
  const summary = [
    { label: 'Output GST (collected)', value: money(o.tax, currency) },
    { label: 'Input GST (ITC)', value: money(i.tax, currency) },
    { label: net >= 0 ? 'Net GST payable' : 'ITC carry forward', value: money(Math.abs(net), currency), tone: net > 0 ? ('expense' as const) : ('income' as const) },
    { label: 'Taxable sales', value: money(o.taxable, currency) },
    { label: 'Taxable purchases', value: money(i.taxable, currency) },
    { label: 'Sales without GST', value: money(nonGstOut, currency) },
    { label: 'Spend without GST', value: money(nonGstIn, currency) },
  ];

  const table = (list: GstRow[]) => {
    const s = sum(list);
    if (!list.length) return <p className="p-8 text-center text-sm text-muted">No GST entries in this period.</p>;
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2/60 text-left text-xs font-semibold text-muted">
              <th className="px-4 py-2.5">Date</th>
              <th className="px-3 py-2.5">Particulars</th>
              <th className="px-3 py-2.5">Party / GSTIN</th>
              <th className="px-3 py-2.5 text-right">Rate</th>
              <th className="px-3 py-2.5 text-right">Taxable</th>
              <th className="px-3 py-2.5 text-right">CGST</th>
              <th className="px-3 py-2.5 text-right">SGST</th>
              <th className="px-3 py-2.5 text-right">IGST</th>
              <th className="px-4 py-2.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.key} className="border-b border-line">
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-2">{fmtDate(r.date, 'dd MMM')}</td>
                <td className="px-3 py-2.5">
                  <span className="font-medium">{r.label}</span>
                  {r.ref && <span className="ml-1.5 text-xs text-muted">#{r.ref}</span>}
                  {r.source === 'Invoice' && <Badge tone="brand" className="ml-1.5">Invoice</Badge>}
                </td>
                <td className="px-3 py-2.5 text-ink-2">
                  {r.party || '—'}
                  {r.gstin && <span className="block font-mono text-[11px] text-muted">{r.gstin}</span>}
                </td>
                <td className="px-3 py-2.5 text-right">{r.rate}%</td>
                <td className="tabular px-3 py-2.5 text-right">{money(r.taxable, currency)}</td>
                <td className="tabular px-3 py-2.5 text-right">{r.cgst ? money(r.cgst, currency) : '—'}</td>
                <td className="tabular px-3 py-2.5 text-right">{r.sgst ? money(r.sgst, currency) : '—'}</td>
                <td className="tabular px-3 py-2.5 text-right">{r.igst ? money(r.igst, currency) : '—'}</td>
                <td className="tabular px-4 py-2.5 text-right font-semibold">{money(r.total, currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-surface-2/60 font-bold">
              <td className="px-4 py-3" colSpan={4}>
                Total
              </td>
              <td className="tabular px-3 py-3 text-right">{money(s.taxable, currency)}</td>
              <td className="tabular px-3 py-3 text-right">{money(s.cgst, currency)}</td>
              <td className="tabular px-3 py-3 text-right">{money(s.sgst, currency)}</td>
              <td className="tabular px-3 py-3 text-right">{money(s.igst, currency)}</td>
              <td className="tabular px-4 py-3 text-right">{money(s.total, currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="GST"
        subtitle="GST and non-GST business kept separate — output, input credit and net payable."
        actions={
          <ExportButtons
            label="Download GST report"
            onExcel={() =>
              exportSimpleExcel(ctx, {
                title: 'GST Report',
                subtitle: label,
                fileName: `GST Report ${label}`,
                summary: [
                  { label: 'Period', value: label, type: 'text' },
                  { label: 'Output GST (collected)', value: round2(o.tax) },
                  { label: 'Input GST (ITC)', value: round2(i.tax) },
                  { label: net >= 0 ? 'Net GST payable' : 'ITC carry forward', value: Math.abs(net) },
                  { label: 'Taxable sales', value: round2(o.taxable) },
                  { label: 'Taxable purchases', value: round2(i.taxable) },
                  { label: 'Sales / income without GST', value: round2(nonGstOut) },
                  { label: 'Expenses without GST', value: round2(nonGstIn) },
                ],
                sections: [detailSection('Output GST — sales & income', output, 'Output GST'), detailSection('Input GST — purchases & expenses', input, 'Input GST'), rateSection(), nonSection()],
              })
            }
            onPdf={() =>
              exportSimplePdf(ctx, {
                title: 'GST Report',
                subtitle: label,
                fileName: `GST Report ${label}`,
                landscape: true,
                summary,
                sections: [rateSection(), detailSection('Output GST — sales & income', output, ''), detailSection('Input GST — purchases & expenses', input, ''), nonSection()],
              })
            }
          />
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Segmented
          value={kind}
          onChange={setKind}
          size="sm"
          options={[
            { value: 'month', label: 'Month' },
            { value: 'quarter', label: 'Quarter' },
            { value: 'year', label: 'FY' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
        {kind === 'custom' ? (
          <div className="flex items-center gap-2">
            <Input type="date" value={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} className="h-10" />
            <span className="text-muted">–</span>
            <Input type="date" value={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} className="h-10" />
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <IconButton label="Previous" onClick={() => shift(-1)} className="border border-line bg-surface">
              <ChevronLeft className="size-5" />
            </IconButton>
            <span className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold">{label}</span>
            <IconButton label="Next" onClick={() => shift(1)} className="border border-line bg-surface">
              <ChevronRight className="size-5" />
            </IconButton>
            <Button size="sm" variant="ghost" onClick={() => setAnchor(new Date())}>
              Now
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Output GST (collected)" value={o.tax} sub={`on ${money(o.taxable, currency)} taxable sales`} />
        <StatCard label="Input GST (ITC)" value={i.tax} sub={`on ${money(i.taxable, currency)} taxable purchases`} />
        <Card className={cn('flex flex-col gap-1 p-4', net > 0 ? 'border-expense/30 bg-expense-soft' : 'border-income/30 bg-income-soft')}>
          <span className="text-xs font-medium text-muted">{net >= 0 ? 'Net GST payable' : 'Input credit to carry forward'}</span>
          <Money value={Math.abs(net)} className={cn('text-2xl font-bold', net > 0 ? 'text-expense' : 'text-income')} />
          <span className="text-xs text-muted">Output − input</span>
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Sales/income with GST" value={o.total} />
        <StatCard label="Sales/income without GST" value={nonGstOut} />
        <StatCard label="Spend with GST bill" value={i.total} />
        <StatCard label="Spend without GST" value={nonGstIn} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {(['output', 'input'] as const).map((d) => {
          const list = d === 'output' ? output : input;
          const rates = byRate(list);
          return (
            <Card key={d} className="overflow-hidden">
              <CardHeader title={d === 'output' ? 'Output GST by rate' : 'Input GST by rate'} subtitle={d === 'output' ? 'Sales invoices + GST income entries' : 'Expenses with GST bills'} />
              <div className="mt-3 overflow-x-auto border-t border-line">
                {rates.length ? (
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted">
                        <th className="px-4 py-2 font-semibold sm:px-5">Rate</th>
                        <th className="px-3 py-2 text-right font-semibold">Taxable</th>
                        <th className="px-3 py-2 text-right font-semibold">CGST + SGST</th>
                        <th className="px-3 py-2 text-right font-semibold">IGST</th>
                        <th className="px-4 py-2 text-right font-semibold sm:px-5">Tax</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rates.map(([rate, x]) => (
                        <tr key={rate} className="border-t border-line">
                          <td className="px-4 py-2.5 font-semibold sm:px-5">{rate}%</td>
                          <td className="tabular px-3 py-2.5 text-right">{money(x.taxable, currency)}</td>
                          <td className="tabular px-3 py-2.5 text-right">{money(x.cgst + x.sgst, currency)}</td>
                          <td className="tabular px-3 py-2.5 text-right">{money(x.igst, currency)}</td>
                          <td className="tabular px-4 py-2.5 text-right font-semibold sm:px-5">{money(x.tax, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="p-6 text-center text-sm text-muted">Nothing in this period.</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <Segmented
            value={tab}
            onChange={setTab}
            size="sm"
            options={[
              { value: 'output', label: `Output (${output.length})` },
              { value: 'input', label: `Input (${input.length})` },
              { value: 'nogst', label: `Without GST (${nonGst.length})` },
            ]}
          />
        </div>
        <div className="border-t border-line">
          {tab === 'output' && table(output)}
          {tab === 'input' && table(input)}
          {tab === 'nogst' &&
            (nonGst.length ? (
              <div>
                {nonGst.map((n) => (
                  <div key={n.key} className="flex items-center gap-3 border-b border-line px-4 py-3 text-sm sm:px-5">
                    <span className="w-14 shrink-0 text-ink-2">{fmtDate(n.date, 'dd MMM')}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{n.label}</p>
                      {n.party && <p className="truncate text-xs text-muted">{n.party}</p>}
                    </div>
                    <Badge tone={n.type === 'Expense' ? 'expense' : 'income'}>{n.type}</Badge>
                    <Money value={n.amount} className="w-28 text-right font-semibold" />
                  </div>
                ))}
                <div className="flex justify-between bg-surface-2/60 px-4 py-3 text-sm font-bold sm:px-5">
                  <span>Total without GST</span>
                  <Money value={nonGstIn + nonGstOut} />
                </div>
              </div>
            ) : (
              <p className="p-8 text-center text-sm text-muted">No non-GST entries in this period.</p>
            ))}
        </div>
      </Card>

      <p className="mt-4 flex items-start gap-2 px-1 text-xs text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Figures are a working summary from your entries and invoices to help with GSTR-1 / GSTR-3B. Verify with your accountant before filing.
      </p>
    </div>
  );
}
