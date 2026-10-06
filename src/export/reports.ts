import type { BookEntry, Statement } from '../lib/accounting';
import { byCategory, byDay, gstByRate, totals } from '../lib/analytics';
import { rangeDays, type DateRange } from '../lib/dates';
import { colorHex } from '../lib/defaults';
import { fmtDate, money, pct } from '../lib/format';
import type { Category, Ledger, Settings, Subcategory, Transaction } from '../lib/types';
import { companyLines } from './common';
import { colLetter, exportWorkbook, type XCol, type XSheet, type XSummaryItem } from './excel';
import { createPdf, drawBars, drawHeader, drawSummary, finalize, sectionTitle, table, type SummaryBox } from './pdf';

export interface ExportCtx {
  settings: Settings;
  currency: string;
  catById: Map<string, Category>;
  subById: Map<string, Subcategory>;
  ledgerById: Map<string, Ledger>;
}

const MODE = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank' } as const;

function txnRow(ctx: ExportCtx, t: Transaction) {
  const tax = t.gstEnabled ? t.cgst + t.sgst + t.igst : 0;
  return {
    date: t.date,
    type: t.type === 'expense' ? 'Expense' : 'Income',
    category: ctx.catById.get(t.categoryId)?.name ?? 'Uncategorised',
    sub: t.subcategoryId ? (ctx.subById.get(t.subcategoryId)?.name ?? '') : '',
    mode: MODE[t.paymentMode],
    account: ctx.ledgerById.get(t.ledgerId)?.name ?? '',
    gst: t.gstEnabled ? 'Yes' : 'No',
    rate: t.gstEnabled ? t.gstRate : 0,
    party: t.partyName,
    gstin: t.gstin,
    bill: t.billNo,
    taxable: t.gstEnabled ? t.taxableAmount : t.amount,
    cgst: t.cgst || 0,
    sgst: t.sgst || 0,
    igst: t.igst || 0,
    tax,
    income: t.type === 'income' ? t.amount : 0,
    expense: t.type === 'expense' ? t.amount : 0,
    notes: t.notes,
  };
}

const TXN_COLS: XCol[] = [
  { header: 'Date', key: 'date', type: 'date' },
  { header: 'Type', key: 'type' },
  { header: 'Category', key: 'category' },
  { header: 'Sub-category', key: 'sub' },
  { header: 'Payment Mode', key: 'mode' },
  { header: 'Account', key: 'account' },
  { header: 'GST Bill', key: 'gst' },
  { header: 'GST %', key: 'rate', type: 'int' },
  { header: 'Party', key: 'party' },
  { header: 'GSTIN', key: 'gstin' },
  { header: 'Bill No', key: 'bill' },
  { header: 'Taxable Value', key: 'taxable', type: 'money', sum: true },
  { header: 'CGST', key: 'cgst', type: 'money', sum: true },
  { header: 'SGST', key: 'sgst', type: 'money', sum: true },
  { header: 'IGST', key: 'igst', type: 'money', sum: true },
  { header: 'Total GST', key: 'tax', type: 'money', sum: true },
  { header: 'Income', key: 'income', type: 'money', sum: true },
  { header: 'Expense', key: 'expense', type: 'money', sum: true },
  { header: 'Notes', key: 'notes' },
];
const L = (key: string) => colLetter(TXN_COLS.findIndex((c) => c.key === key) + 1);

export async function exportTxnExcel(ctx: ExportCtx, txns: Transaction[], title: string, period: string, range?: DateRange) {
  const rows = [...txns].sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1)).map((t) => txnRow(ctx, t));
  const n = Math.max(rows.length + 1, 2);
  const T = (key: string) => `Transactions!${L(key)}2:${L(key)}${n}`;
  const tt = totals(txns);

  const summary: XSummaryItem[] = [
    { label: 'Period', value: period, type: 'text' },
    { label: 'Total income', value: tt.income, formula: `SUM(${T('income')})` },
    { label: 'Total expense', value: tt.expense, formula: `SUM(${T('expense')})` },
    { label: 'Net savings', value: tt.net, formula: `SUM(${T('income')})-SUM(${T('expense')})` },
    { label: 'Savings rate', value: tt.income ? tt.net / tt.income : 0, type: 'percent', formula: `IFERROR((SUM(${T('income')})-SUM(${T('expense')}))/SUM(${T('income')}),0)` },
    { label: 'Number of entries', value: tt.count, type: 'int', formula: `COUNTA(${T('date')})` },
    { label: 'Expense — with GST bill', value: tt.expenseWithGst, formula: `SUMIF(${T('gst')},"Yes",${T('expense')})` },
    { label: 'Expense — without GST', value: tt.expenseWithoutGst, formula: `SUMIF(${T('gst')},"No",${T('expense')})` },
    { label: 'Income — with GST', value: tt.incomeWithGst, formula: `SUMIF(${T('gst')},"Yes",${T('income')})` },
    { label: 'Income — without GST', value: tt.incomeWithoutGst, formula: `SUMIF(${T('gst')},"No",${T('income')})` },
    { label: 'GST paid (input credit)', value: tt.gstPaid, formula: `SUMIF(${T('type')},"Expense",${T('tax')})` },
    { label: 'GST collected (output)', value: tt.gstCollected, formula: `SUMIF(${T('type')},"Income",${T('tax')})` },
    { label: 'Net GST payable', value: tt.gstCollected - tt.gstPaid, formula: `SUMIF(${T('type')},"Income",${T('tax')})-SUMIF(${T('type')},"Expense",${T('tax')})` },
  ];

  const transactions: XSheet = { name: 'Transactions', columns: TXN_COLS, rows };

  // Category summary
  const catRows = [
    ...byCategory(txns, 'expense', ctx.catById, ctx.subById),
    ...byCategory(txns, 'income', ctx.catById, ctx.subById),
  ].map((c) => ({ type: c.type === 'expense' ? 'Expense' : 'Income', category: c.name, count: c.count, amount: c.amount, share: c.pct / 100 }));
  const catSheet: XSheet = {
    name: 'Category Summary',
    columns: [
      { header: 'Type', key: 'type' },
      { header: 'Category', key: 'category' },
      { header: 'Entries', key: 'count', type: 'int' },
      { header: 'Amount', key: 'amount', type: 'money' },
      { header: 'Share of type', key: 'share', type: 'percent' },
    ],
    rows: catRows,
    totals: false,
    rowFormulas: {
      share: (r, col) => {
        const last = catRows.length + 1;
        return `IFERROR(${col('amount')}${r}/SUMIF($${col('type')}$2:$${col('type')}$${last},${col('type')}${r},$${col('amount')}$2:$${col('amount')}$${last}),0)`;
      },
    },
    footer: (ref) => [
      { label: 'Total Expense', cells: { count: { formula: `SUMIF(${ref('type')},"Expense",${ref('count')})`, result: tt.expenseCount }, amount: { formula: `SUMIF(${ref('type')},"Expense",${ref('amount')})`, result: tt.expense } } },
      { label: 'Total Income', cells: { count: { formula: `SUMIF(${ref('type')},"Income",${ref('count')})`, result: tt.incomeCount }, amount: { formula: `SUMIF(${ref('type')},"Income",${ref('amount')})`, result: tt.income } } },
    ],
  };

  // Sub-category breakdown
  const subRows: Record<string, unknown>[] = [];
  for (const type of ['expense', 'income'] as const) {
    for (const c of byCategory(txns, type, ctx.catById, ctx.subById))
      for (const s of c.subs)
        subRows.push({ type: type === 'expense' ? 'Expense' : 'Income', category: c.name, sub: s.name, count: s.count, amount: s.amount, share: s.pct / 100 });
  }
  const subSheet: XSheet = {
    name: 'Sub-category Summary',
    columns: [
      { header: 'Type', key: 'type' },
      { header: 'Category', key: 'category' },
      { header: 'Sub-category', key: 'sub' },
      { header: 'Entries', key: 'count', type: 'int' },
      { header: 'Amount', key: 'amount', type: 'money' },
      { header: 'Share of category', key: 'share', type: 'percent' },
    ],
    rows: subRows,
    totals: false,
    footer: (ref) => [
      { label: 'Total Expense', cells: { amount: { formula: `SUMIF(${ref('type')},"Expense",${ref('amount')})`, result: tt.expense } } },
      { label: 'Total Income', cells: { amount: { formula: `SUMIF(${ref('type')},"Income",${ref('amount')})`, result: tt.income } } },
    ],
  };

  // Daily summary
  const days = range && rangeDays(range) <= 93 ? byDay(txns, range) : byDay(txns, spanOf(txns)).filter((d) => d.count > 0);
  const dailySheet: XSheet = {
    name: 'Daily Summary',
    columns: [
      { header: 'Date', key: 'date', type: 'date' },
      { header: 'Entries', key: 'count', type: 'int', sum: true },
      { header: 'Income', key: 'income', type: 'money', sum: true },
      { header: 'Expense', key: 'expense', type: 'money', sum: true },
      { header: 'Net', key: 'net', type: 'money', sum: true },
    ],
    rows: days.map((d) => ({ ...d, net: d.income - d.expense })),
    rowFormulas: { net: (r, col) => `${col('income')}${r}-${col('expense')}${r}` },
  };

  // GST summary
  const gstRows = [
    ...gstByRate(txns, 'income').map((r) => ({ dir: 'Output (Sales/Income)', ...r })),
    ...gstByRate(txns, 'expense').map((r) => ({ dir: 'Input (Purchases/Expenses)', ...r })),
  ];
  const gstSheet: XSheet = {
    name: 'GST Summary',
    columns: [
      { header: 'Direction', key: 'dir' },
      { header: 'GST %', key: 'rate', type: 'int' },
      { header: 'Entries', key: 'count', type: 'int' },
      { header: 'Taxable Value', key: 'taxable', type: 'money' },
      { header: 'CGST', key: 'cgst', type: 'money' },
      { header: 'SGST', key: 'sgst', type: 'money' },
      { header: 'IGST', key: 'igst', type: 'money' },
      { header: 'Total GST', key: 'tax', type: 'money' },
      { header: 'Gross Amount', key: 'total', type: 'money' },
    ],
    rows: gstRows,
    totals: false,
    footer: (ref) => {
      const mk = (label: string, crit: string, result: Record<string, number>) => ({
        label,
        cells: Object.fromEntries(
          ['taxable', 'cgst', 'sgst', 'igst', 'tax', 'total'].map((k) => [k, { formula: `SUMIF(${ref('dir')},"${crit}",${ref(k)})`, result: result[k] ?? 0 }]),
        ),
      });
      const sumOf = (dir: string) => {
        const o: Record<string, number> = {};
        for (const r of gstRows.filter((x) => x.dir.startsWith(dir))) for (const k of ['taxable', 'cgst', 'sgst', 'igst', 'tax', 'total']) o[k] = (o[k] ?? 0) + (r as unknown as Record<string, number>)[k]!;
        return o;
      };
      return [
        mk('Total Output GST', 'Output*', sumOf('Output')),
        mk('Total Input GST', 'Input*', sumOf('Input')),
        {
          label: 'Net GST payable',
          cells: {
            tax: { formula: `SUMIF(${ref('dir')},"Output*",${ref('tax')})-SUMIF(${ref('dir')},"Input*",${ref('tax')})`, result: tt.gstCollected - tt.gstPaid },
          },
        },
      ];
    },
  };

  await exportWorkbook({
    fileName: `${title} ${period}`,
    title,
    subtitle: period,
    companyName: ctx.settings.company.name,
    companyLines: companyLines(ctx.settings),
    currency: ctx.currency,
    summary,
    sheets: [transactions, catSheet, subSheet, dailySheet, gstSheet],
  });
}

function spanOf(txns: Transaction[]): DateRange {
  if (!txns.length) return { from: '2000-01-01', to: '2000-01-01' };
  let from = txns[0]!.date;
  let to = from;
  for (const t of txns) {
    if (t.date < from) from = t.date;
    if (t.date > to) to = t.date;
  }
  return { from, to };
}

export async function exportTxnPdf(ctx: ExportCtx, txns: Transaction[], title: string, period: string, range?: DateRange) {
  const c = await createPdf('p');
  const cur = ctx.currency;
  const m = (n: number) => money(n, cur);
  let y = await drawHeader(c, ctx.settings, title, period);
  const tt = totals(txns);
  const boxes: SummaryBox[] = [
    { label: 'Income', value: m(tt.income), tone: 'income' },
    { label: 'Expense', value: m(tt.expense), tone: 'expense' },
    { label: 'Net savings', value: m(tt.net), tone: tt.net < 0 ? 'expense' : 'income' },
    { label: 'Savings rate', value: tt.income ? pct((tt.net / tt.income) * 100) : '—' },
    { label: 'Expense with GST', value: m(tt.expenseWithGst) },
    { label: 'Expense without GST', value: m(tt.expenseWithoutGst) },
    { label: 'GST paid (input)', value: m(tt.gstPaid) },
    { label: 'GST collected (output)', value: m(tt.gstCollected) },
  ];
  y = drawSummary(c, boxes, y);

  const cats = byCategory(txns, 'expense', ctx.catById, ctx.subById);
  if (cats.length) {
    y = sectionTitle(c, 'Expense by category', y);
    y = drawBars(
      c,
      cats.slice(0, 10).map((x) => ({ label: x.name, value: x.amount, valueText: `${m(x.amount)}  (${pct(x.pct)})`, color: colorHex(x.color) })),
      y + 1,
    );
    const body: (string | { content: string; styles?: object })[][] = [];
    for (const x of cats) {
      body.push([{ content: x.name, styles: { fontStyle: 'bold' } }, String(x.count), { content: m(x.amount), styles: { fontStyle: 'bold' } }, pct(x.pct)]);
      if (x.subs.length > 1 || (x.subs[0] && x.subs[0].id !== '_none'))
        for (const s of x.subs) body.push([`     ${s.name}`, String(s.count), m(s.amount), `${pct(s.pct)} of ${x.name}`]);
    }
    y = sectionTitle(c, 'Category & sub-category summary — expenses', y);
    y = table(c, y, {
      head: [['Category / Sub-category', 'Entries', 'Amount', 'Share']],
      body,
      foot: [['Total expense', String(tt.expenseCount), m(tt.expense), '100%']],
      columnStyles: { 1: { halign: 'right', cellWidth: 18 }, 2: { halign: 'right', cellWidth: 36 }, 3: { halign: 'right', cellWidth: 36 } },
    });
  }

  const inc = byCategory(txns, 'income', ctx.catById, ctx.subById);
  if (inc.length) {
    y = sectionTitle(c, 'Income by category', y);
    y = table(c, y, {
      head: [['Category', 'Entries', 'Amount', 'Share']],
      body: inc.map((x) => [x.name, String(x.count), m(x.amount), pct(x.pct)]),
      foot: [['Total income', String(tt.incomeCount), m(tt.income), '100%']],
      columnStyles: { 1: { halign: 'right', cellWidth: 18 }, 2: { halign: 'right', cellWidth: 36 }, 3: { halign: 'right', cellWidth: 36 } },
    });
  }

  if (range && rangeDays(range) > 1) {
    const days = (rangeDays(range) <= 93 ? byDay(txns, range) : byDay(txns, spanOf(txns))).filter((d) => d.count > 0);
    if (days.length) {
      y = sectionTitle(c, 'Daily summary', y);
      y = table(c, y, {
        head: [['Date', 'Entries', 'Income', 'Expense', 'Net']],
        body: days.map((d) => [fmtDate(d.date, 'EEE, dd MMM yyyy'), String(d.count), m(d.income), m(d.expense), m(d.income - d.expense)]),
        foot: [['Total', String(tt.count), m(tt.income), m(tt.expense), m(tt.net)]],
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      });
    }
  }

  const gIn = gstByRate(txns, 'expense');
  const gOut = gstByRate(txns, 'income');
  if (gIn.length || gOut.length) {
    y = sectionTitle(c, 'GST summary (rate-wise)', y);
    y = table(c, y, {
      head: [['Direction', 'Rate', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total GST']],
      body: [
        ...gOut.map((r) => ['Output (sales)', `${r.rate}%`, m(r.taxable), m(r.cgst), m(r.sgst), m(r.igst), m(r.tax)]),
        ...gIn.map((r) => ['Input (purchases)', `${r.rate}%`, m(r.taxable), m(r.cgst), m(r.sgst), m(r.igst), m(r.tax)]),
      ],
      foot: [['Net GST payable', '', '', '', '', '', m(tt.gstCollected - tt.gstPaid)]],
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    });
  }

  y = sectionTitle(c, `Transactions (${txns.length})`, y);
  const sorted = [...txns].sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));
  table(c, y, {
    head: [['Date', 'Category', 'Mode', 'GST', 'Notes', 'Income', 'Expense']],
    body: sorted.map((t) => {
      const r = txnRow(ctx, t);
      return [
        fmtDate(t.date, 'dd MMM yy'),
        r.sub ? `${r.category} › ${r.sub}` : r.category,
        r.mode,
        t.gstEnabled ? `${t.gstRate}%` : '—',
        [t.partyName, t.billNo && `#${t.billNo}`, t.notes].filter(Boolean).join(' · '),
        r.income ? m(r.income) : '',
        r.expense ? m(r.expense) : '',
      ];
    }),
    foot: [['', '', '', '', 'Total', m(tt.income), m(tt.expense)]],
    columnStyles: { 0: { cellWidth: 18 }, 2: { cellWidth: 13 }, 3: { cellWidth: 11 }, 5: { halign: 'right', cellWidth: 26 }, 6: { halign: 'right', cellWidth: 26 } },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 5) d.cell.styles.textColor = [4, 122, 80];
      if (d.section === 'body' && d.column.index === 6) d.cell.styles.textColor = [199, 54, 47];
    },
  });
  finalize(c, ctx.settings, `${title} ${period}`);
}

/* ---------------- Generic tabular exports for accounting pages ---------------- */

export interface SimpleSection {
  title?: string;
  head: string[];
  rows: (string | number)[][];
  foot?: (string | number)[];
  /** column types for Excel; 'money' cols are right-aligned in PDF */
  types?: ('text' | 'money' | 'date' | 'int')[];
}

export async function exportSimplePdf(
  ctx: ExportCtx,
  opts: { title: string; subtitle: string; fileName: string; summary?: SummaryBox[]; sections: SimpleSection[]; landscape?: boolean },
) {
  const c = await createPdf(opts.landscape ? 'l' : 'p');
  const m = (v: string | number, t?: string) => (t === 'money' && typeof v === 'number' ? money(v, ctx.currency) : t === 'date' && typeof v === 'string' ? fmtDate(v, 'dd MMM yy') : String(v));
  let y = await drawHeader(c, ctx.settings, opts.title, opts.subtitle);
  if (opts.summary?.length) y = drawSummary(c, opts.summary, y);
  for (const s of opts.sections) {
    if (s.title) y = sectionTitle(c, s.title, y);
    const colStyles: Record<number, object> = {};
    s.types?.forEach((t, i) => {
      if (t === 'money' || t === 'int') colStyles[i] = { halign: 'right' };
      if (t === 'date') colStyles[i] = { cellWidth: 18 };
    });
    y = table(c, y, {
      head: [s.head],
      body: s.rows.length ? s.rows.map((r) => r.map((v, i) => m(v, s.types?.[i]))) : [[{ content: 'No records', colSpan: s.head.length, styles: { halign: 'center', textColor: [137, 135, 129] } }]],
      foot: s.foot ? [s.foot.map((v, i) => m(v, s.types?.[i]))] : undefined,
      columnStyles: colStyles,
    });
  }
  finalize(c, ctx.settings, opts.fileName);
}

export async function exportSimpleExcel(
  ctx: ExportCtx,
  opts: { title: string; subtitle: string; fileName: string; summary?: XSummaryItem[]; sections: (SimpleSection & { sheet: string; sum?: number[] })[] },
) {
  await exportWorkbook({
    fileName: opts.fileName,
    title: opts.title,
    subtitle: opts.subtitle,
    companyName: ctx.settings.company.name,
    companyLines: companyLines(ctx.settings),
    currency: ctx.currency,
    summary: opts.summary ?? [{ label: 'Period', value: opts.subtitle, type: 'text' }],
    sheets: opts.sections.map((s) => ({
      name: s.sheet,
      columns: s.head.map((h, i) => ({ header: h, key: `c${i}`, type: s.types?.[i] ?? 'text', sum: s.sum?.includes(i) })),
      rows: s.rows.map((r) => Object.fromEntries(r.map((v, i) => [`c${i}`, v]))),
    })),
  });
}

/* ---------------- Ledger statement ---------------- */

export function statementSection(st: Statement, currency: string): SimpleSection {
  const bal = (n: number) => `${money(Math.abs(n), currency)} ${n >= 0 ? 'Dr' : 'Cr'}`;
  return {
    head: ['Date', 'Particulars', 'Vch Type', 'Vch No', 'Debit', 'Credit', 'Balance'],
    types: ['date', 'text', 'text', 'text', 'money', 'money', 'text'],
    rows: [
      ['', 'Opening Balance', '', '', '', '', bal(st.opening)],
      ...st.rows.map((r) => [r.entry.date, `${r.particulars}${r.entry.narration ? ` — ${r.entry.narration}` : ''}`, r.entry.vtype, r.entry.number, r.debit || '', r.credit || '', bal(r.balance)]),
    ],
    foot: ['', 'Closing Balance', '', '', st.debit, st.credit, bal(st.closing)],
  };
}

export function dayBookSection(entries: BookEntry[], name: (id: string) => string): SimpleSection {
  return {
    head: ['Date', 'Vch Type', 'Vch No', 'Debit (Dr)', 'Credit (Cr)', 'Narration', 'Amount'],
    types: ['date', 'text', 'text', 'text', 'text', 'text', 'money'],
    rows: entries.map((e) => [
      e.date,
      e.vtype,
      e.number,
      e.lines.filter((l) => l.debit).map((l) => name(l.ledgerId)).join(', '),
      e.lines.filter((l) => l.credit).map((l) => name(l.ledgerId)).join(', '),
      e.narration,
      e.amount,
    ]),
    foot: ['', '', '', '', '', 'Total', entries.reduce((s, e) => s + e.amount, 0)],
  };
}

