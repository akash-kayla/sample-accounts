import type { jsPDF } from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';
import type { Settings } from '../lib/types';
import { companyLines, loadLogo, safeName } from './common';

export interface PdfCtx {
  doc: jsPDF;
  font: string;
  unicode: boolean;
  W: number;
  H: number;
  M: number;
  autoTable: (d: jsPDF, o: UserOptions) => void;
}

type RGB = [number, number, number];
export const INK: RGB = [17, 17, 16];
export const INK2: RGB = [82, 81, 78];
export const MUTED: RGB = [137, 135, 129];
export const LINE: RGB = [225, 224, 217];
export const BRAND: RGB = [250, 204, 21];
export const SOFT: RGB = [246, 246, 243];
export const INCOME: RGB = [4, 122, 80];
export const EXPENSE: RGB = [199, 54, 47];

let fontPromise: Promise<{ regular: string; bold: string } | null> | null = null;

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function loadFonts() {
  if (!fontPromise) {
    fontPromise = (async () => {
      try {
        const [r, b] = await Promise.all([
          fetch('/fonts/NotoSans-400Regular.ttf').then((x) => (x.ok ? x.arrayBuffer() : Promise.reject())),
          fetch('/fonts/NotoSans-700Bold.ttf').then((x) => (x.ok ? x.arrayBuffer() : Promise.reject())),
        ]);
        return { regular: toBase64(r), bold: toBase64(b) };
      } catch {
        fontPromise = null;
        return null;
      }
    })();
  }
  return fontPromise;
}

export async function createPdf(orientation: 'p' | 'l' = 'p'): Promise<PdfCtx> {
  const [{ jsPDF }, at, fonts] = await Promise.all([import('jspdf'), import('jspdf-autotable'), loadFonts()]);
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
  let font = 'helvetica';
  if (fonts) {
    doc.addFileToVFS('NotoSans-Regular.ttf', fonts.regular);
    doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
    doc.addFileToVFS('NotoSans-Bold.ttf', fonts.bold);
    doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
    font = 'NotoSans';
  }
  doc.setFont(font, 'normal');
  return {
    doc,
    font,
    unicode: !!fonts,
    W: doc.internal.pageSize.getWidth(),
    H: doc.internal.pageSize.getHeight(),
    M: 14,
    autoTable: at.autoTable as unknown as PdfCtx['autoTable'],
  };
}

/** Fallback when the unicode font could not load: ₹ → Rs. */
export function tx(ctx: PdfCtx, s: string) {
  if (ctx.unicode) return s;
  return s.replace(/₹\s?/g, 'Rs. ').replace(/[  ]/g, ' ').replace(/[–—]/g, '-').replace(/[›→]/g, '>');
}

export function setText(ctx: PdfCtx, size: number, color: RGB = INK, weight: 'normal' | 'bold' = 'normal') {
  ctx.doc.setFont(ctx.font, weight);
  ctx.doc.setFontSize(size);
  ctx.doc.setTextColor(...color);
}

export async function drawHeader(ctx: PdfCtx, settings: Settings, title: string, subtitle?: string): Promise<number> {
  const { doc, W, M } = ctx;
  const logo = await loadLogo(settings);
  let y = M;
  if (logo) {
    const h = 9;
    const w = Math.min(48, (logo.width / logo.height) * h);
    doc.addImage(logo.dataUrl, 'PNG', M, y, w, (w / logo.width) * logo.height);
  } else {
    setText(ctx, 16, INK, 'bold');
    doc.text(tx(ctx, settings.company.name), M, y + 7);
  }
  setText(ctx, 10, INK, 'bold');
  doc.text(tx(ctx, settings.company.name), W - M, y + 3, { align: 'right' });
  setText(ctx, 7.5, INK2);
  companyLines(settings).forEach((l, i) => doc.text(tx(ctx, l), W - M, y + 7 + i * 3.6, { align: 'right' }));
  y += 7 + Math.max(2, companyLines(settings).length) * 3.6 + 2;
  doc.setFillColor(...BRAND);
  doc.rect(M, y, W - 2 * M, 1.1, 'F');
  y += 8;
  setText(ctx, 16, INK, 'bold');
  doc.text(tx(ctx, title), M, y);
  y += 5.5;
  if (subtitle) {
    setText(ctx, 9, INK2);
    doc.text(tx(ctx, subtitle), M, y);
    y += 4;
  }
  return y + 3;
}

export function ensureSpace(ctx: PdfCtx, y: number, need: number) {
  if (y + need > ctx.H - 16) {
    ctx.doc.addPage();
    return ctx.M + 2;
  }
  return y;
}

export interface SummaryBox {
  label: string;
  value: string;
  tone?: 'income' | 'expense' | 'neutral';
}

export function drawSummary(ctx: PdfCtx, items: SummaryBox[], y: number, perRow = 4): number {
  const { doc, W, M } = ctx;
  const gap = 3;
  const w = (W - 2 * M - gap * (perRow - 1)) / perRow;
  const h = 15;
  items.forEach((it, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = M + col * (w + gap);
    const yy = y + row * (h + gap);
    doc.setFillColor(...SOFT);
    doc.setDrawColor(...LINE);
    doc.roundedRect(x, yy, w, h, 2, 2, 'FD');
    setText(ctx, 7, MUTED);
    doc.text(tx(ctx, it.label.toUpperCase()), x + 3, yy + 5);
    setText(ctx, 11, it.tone === 'income' ? INCOME : it.tone === 'expense' ? EXPENSE : INK, 'bold');
    doc.text(tx(ctx, it.value), x + 3, yy + 11.3, { maxWidth: w - 5 });
  });
  const rows = Math.ceil(items.length / perRow);
  return y + rows * (h + gap) + 3;
}

export function sectionTitle(ctx: PdfCtx, title: string, y: number): number {
  y = ensureSpace(ctx, y, 22);
  setText(ctx, 11, INK, 'bold');
  ctx.doc.text(tx(ctx, title), ctx.M, y + 2);
  return y + 5;
}

/** Horizontal bar list (category share) */
export function drawBars(ctx: PdfCtx, items: { label: string; value: number; valueText: string; color: string }[], y: number): number {
  const { doc, W, M } = ctx;
  const max = Math.max(...items.map((i) => i.value), 1);
  const labelW = 42;
  const valueW = 34;
  const barW = W - 2 * M - labelW - valueW - 4;
  for (const it of items) {
    y = ensureSpace(ctx, y, 7);
    setText(ctx, 8, INK2);
    doc.text(tx(ctx, it.label), M, y + 3.2, { maxWidth: labelW - 2 });
    doc.setFillColor(240, 239, 236);
    doc.roundedRect(M + labelW, y, barW, 4.2, 1, 1, 'F');
    const hex = it.color.replace('#', '');
    doc.setFillColor(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
    doc.roundedRect(M + labelW, y, Math.max(1.2, (it.value / max) * barW), 4.2, 1, 1, 'F');
    setText(ctx, 8, INK, 'bold');
    doc.text(tx(ctx, it.valueText), W - M, y + 3.2, { align: 'right' });
    y += 6.5;
  }
  return y + 2;
}

export function table(ctx: PdfCtx, y: number, opts: UserOptions): number {
  const clean = (rows?: UserOptions['body']) =>
    rows?.map((r) =>
      Array.isArray(r) ? r.map((c) => (typeof c === 'string' ? tx(ctx, c) : c && typeof c === 'object' && 'content' in c && typeof c.content === 'string' ? { ...c, content: tx(ctx, c.content) } : c)) : r,
    );
  ctx.autoTable(ctx.doc, {
    startY: y,
    margin: { left: ctx.M, right: ctx.M, bottom: 16 },
    theme: 'plain',
    styles: { font: ctx.font, fontSize: 8, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 }, textColor: INK, lineColor: LINE, overflow: 'linebreak' },
    headStyles: { fillColor: BRAND, textColor: INK, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [243, 242, 238], textColor: INK, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 248] },
    bodyStyles: { lineWidth: { bottom: 0.1 } as never },
    ...opts,
    didParseCell: (d) => {
      const cs = opts.columnStyles?.[d.column.index] as { halign?: 'left' | 'right' | 'center' } | undefined;
      if ((d.section === 'head' || d.section === 'foot') && cs?.halign) d.cell.styles.halign = cs.halign;
      opts.didParseCell?.(d);
    },
    head: clean(opts.head),
    body: clean(opts.body),
    foot: clean(opts.foot),
  });
  const last = (ctx.doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return (last?.finalY ?? y) + 6;
}

export function finalize(ctx: PdfCtx, settings: Settings, fileName: string) {
  const { doc, W, H, M } = ctx;
  const n = doc.getNumberOfPages();
  const stamp = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE);
    doc.line(M, H - 11, W - M, H - 11);
    setText(ctx, 7, MUTED);
    doc.text(tx(ctx, `${settings.company.name} · Generated ${stamp}`), M, H - 7);
    doc.text(`Page ${i} of ${n}`, W - M, H - 7, { align: 'right' });
  }
  doc.save(`${safeName(fileName)}.pdf`);
}
