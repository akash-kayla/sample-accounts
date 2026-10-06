import type { Workbook, Worksheet } from 'exceljs';
import { currencySymbol } from '../lib/format';
import { downloadBlob, safeName } from './common';

export type XType = 'text' | 'date' | 'money' | 'number' | 'int' | 'percent';

export interface XCol {
  header: string;
  key: string;
  type?: XType;
  /** sum this column in the totals row */
  sum?: boolean;
  width?: number;
}

export interface XFooterRow {
  label: string;
  /** key → formula (without "=") built from ref(key) → "D2:D15"; result is the cached value */
  cells: Record<string, { formula: string; result: number }>;
}

export interface XSheet {
  name: string;
  columns: XCol[];
  rows: Record<string, unknown>[];
  /** add a TOTAL row with SUM formulas for columns with sum: true (default true when any sum col) */
  totals?: boolean;
  /** extra footer rows (e.g. SUMIF per type). Gets ref(key) → data range like "E2:E40" and col(key) → "E" */
  footer?: (ref: (key: string) => string, col: (key: string) => string, lastRow: number) => XFooterRow[];
  /** per-row formula cells: key → (rowNumber, col) => formula */
  rowFormulas?: Record<string, (row: number, col: (key: string) => string) => string>;
  /** bold rows where predicate true */
  boldRow?: (row: Record<string, unknown>) => boolean;
}

export interface XSummaryItem {
  label: string;
  value: number | string;
  type?: XType;
  formula?: string;
}

export interface XBook {
  fileName: string;
  title: string;
  subtitle?: string;
  companyName: string;
  companyLines?: string[];
  currency: string;
  summary?: XSummaryItem[];
  sheets: XSheet[];
}

const HEADER_FILL = 'FFFACC15'; // brand yellow
const HEADER_FONT = 'FF111110';
const TOTAL_FILL = 'FFF3F2EE';
const BORDER = 'FFE1E0D9';

function moneyFmt(currency: string) {
  const sym = currencySymbol(currency).replace(/"/g, '');
  return `"${sym}"#,##0.00;[Red]-"${sym}"#,##0.00;"${sym}"0.00`;
}

const DATE_FMT = 'dd-mmm-yyyy';

function toExcelDate(iso: string): Date | string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
}

function display(v: unknown, type: XType | undefined): string {
  if (v === null || v === undefined) return '';
  if (type === 'money') return (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }) + '  ₹';
  if (type === 'date') return '00-Mmm-0000';
  if (type === 'percent') return '100.0%';
  return String(v);
}

export function colLetter(n: number) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function styleHeader(ws: Worksheet, row: number, count: number) {
  const r = ws.getRow(row);
  r.height = 22;
  for (let i = 1; i <= count; i++) {
    const c = r.getCell(i);
    c.font = { bold: true, color: { argb: HEADER_FONT }, size: 11 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    c.alignment = { vertical: 'middle', horizontal: 'left' };
    c.border = { bottom: { style: 'medium', color: { argb: 'FF111110' } } };
  }
}

function addDataSheet(wb: Workbook, sheet: XSheet, currency: string) {
  const ws = wb.addWorksheet(sheet.name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
  const cols = sheet.columns;
  const idx = new Map(cols.map((c, i) => [c.key, i + 1]));
  const col = (key: string) => colLetter(idx.get(key) ?? 1);
  const mfmt = moneyFmt(currency);

  ws.columns = cols.map((c) => ({ header: c.header, key: c.key }));
  styleHeader(ws, 1, cols.length);

  const widths = cols.map((c) => Math.max(c.header.length + 2, 8));
  sheet.rows.forEach((row, ri) => {
    const values: Record<string, unknown> = {};
    for (const c of cols) {
      const v = row[c.key];
      values[c.key] = c.type === 'date' && typeof v === 'string' ? toExcelDate(v) : v;
    }
    const r = ws.addRow(values);
    const rowNum = ri + 2;
    if (sheet.rowFormulas) {
      for (const [key, fn] of Object.entries(sheet.rowFormulas)) {
        const n = idx.get(key);
        if (n) r.getCell(n).value = { formula: fn(rowNum, col), result: Number(row[key]) || 0 };
      }
    }
    cols.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      if (c.type === 'money') cell.numFmt = mfmt;
      else if (c.type === 'date') cell.numFmt = DATE_FMT;
      else if (c.type === 'percent') cell.numFmt = '0.0%';
      else if (c.type === 'number') cell.numFmt = '#,##0.00';
      else if (c.type === 'int') cell.numFmt = '0';
      cell.border = { bottom: { style: 'hair', color: { argb: BORDER } } };
      if (c.type === 'text' || !c.type) cell.alignment = { vertical: 'top', wrapText: false };
      const len = display(row[c.key], c.type).length;
      widths[i] = Math.max(widths[i]!, Math.min(len + 2, 60));
    });
    if (sheet.boldRow?.(row)) r.font = { bold: true };
  });

  const first = 2;
  const last = sheet.rows.length + 1;
  const ref = (key: string) => `${col(key)}${first}:${col(key)}${Math.max(last, first)}`;

  const footerRows: XFooterRow[] = [];
  const wantTotals = sheet.totals ?? cols.some((c) => c.sum);
  if (wantTotals && cols.some((c) => c.sum)) {
    const cells: XFooterRow['cells'] = {};
    for (const c of cols) {
      if (!c.sum) continue;
      const result = sheet.rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
      cells[c.key] = { formula: sheet.rows.length ? `SUM(${ref(c.key)})` : '0', result };
    }
    footerRows.push({ label: 'TOTAL', cells });
  }
  if (sheet.footer) footerRows.push(...sheet.footer(ref, col, last));

  for (const f of footerRows) {
    const r = ws.addRow({});
    r.getCell(1).value = f.label;
    for (const [key, v] of Object.entries(f.cells)) {
      const n = idx.get(key);
      if (!n) continue;
      const cell = r.getCell(n);
      cell.value = { formula: v.formula, result: v.result };
      const t = cols[n - 1]!.type;
      cell.numFmt = t === 'percent' ? '0.0%' : t === 'int' ? '0' : mfmt;
    }
    for (let i = 1; i <= cols.length; i++) {
      const cell = r.getCell(i);
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } };
      cell.border = { top: { style: 'thin', color: { argb: 'FF111110' } } };
    }
  }

  ws.columns.forEach((c, i) => {
    c.width = cols[i]!.width ?? Math.max(widths[i]!, cols[i]!.type === 'money' ? 14 : 10);
  });
  if (sheet.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

function addSummarySheet(wb: Workbook, book: XBook) {
  const ws = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 34 }, { width: 22 }, { width: 4 }];
  const t = ws.addRow([book.companyName]);
  t.font = { bold: true, size: 16 };
  for (const l of book.companyLines ?? []) ws.addRow([l]).font = { color: { argb: 'FF52514E' }, size: 10 };
  ws.addRow([]);
  const h = ws.addRow([book.title]);
  h.font = { bold: true, size: 13 };
  if (book.subtitle) ws.addRow([book.subtitle]).font = { color: { argb: 'FF52514E' } };
  ws.addRow([`Generated on ${new Date().toLocaleString('en-IN')}`]).font = { color: { argb: 'FF898781' }, size: 9, italic: true };
  ws.addRow([]);
  if (book.summary?.length) {
    const hr = ws.addRow(['Particulars', 'Value']);
    styleHeader(ws, hr.number, 2);
    const mfmt = moneyFmt(book.currency);
    for (const s of book.summary) {
      const r = ws.addRow([s.label, s.formula ? { formula: s.formula, result: s.value } : s.value]);
      const c = r.getCell(2);
      if (s.type === 'money' || (!s.type && typeof s.value === 'number')) c.numFmt = mfmt;
      if (s.type === 'percent') c.numFmt = '0.0%';
      if (s.type === 'int') c.numFmt = '0';
      r.eachCell((cell) => (cell.border = { bottom: { style: 'hair', color: { argb: BORDER } } }));
    }
  }
}

export async function exportWorkbook(book: XBook) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = book.companyName;
  wb.created = new Date();
  if (book.summary) addSummarySheet(wb, book);
  for (const s of book.sheets) addDataSheet(wb, s, book.currency);
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${safeName(book.fileName)}.xlsx`,
  );
}
