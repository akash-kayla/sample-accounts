import { stateCode } from '../lib/defaults';
import { amountInWords, fmtDate, money, num } from '../lib/format';
import { calcInvoice } from '../lib/gst';
import type { Invoice, Settings } from '../lib/types';
import { loadLogo, safeName } from './common';
import { BRAND, createPdf, INCOME, INK, INK2, LINE, MUTED, setText, SOFT, table, tx } from './pdf';

export async function exportInvoicePdf(inv: Invoice, settings: Settings, paid: number, mode: 'download' | 'open' = 'download') {
  const c = await createPdf('p');
  const { doc, W, H, M } = c;
  const co = settings.company;
  const cur = settings.currency;
  const m = (n: number) => money(n, cur);
  const calc = calcInvoice(inv, co.state);
  const title = inv.withGst ? 'TAX INVOICE' : 'INVOICE';

  // ---- Top band
  let y = M;
  const logo = await loadLogo(settings);
  if (logo) {
    const h = 11;
    const w = Math.min(60, (logo.width / logo.height) * h);
    doc.addImage(logo.dataUrl, 'PNG', M, y, w, (w / logo.width) * logo.height);
  } else {
    setText(c, 18, INK, 'bold');
    doc.text(tx(c, co.name), M, y + 8);
  }
  setText(c, 20, INK, 'bold');
  doc.text(title, W - M, y + 7, { align: 'right' });
  setText(c, 8, MUTED);
  doc.text(inv.status === 'draft' ? 'DRAFT' : 'ORIGINAL FOR RECIPIENT', W - M, y + 12, { align: 'right' });

  y += 18;
  doc.setFillColor(...BRAND);
  doc.rect(M, y, W - 2 * M, 1.2, 'F');
  y += 6;

  // ---- Meta row
  const meta: [string, string][] = [
    ['Invoice No.', inv.number],
    ['Invoice Date', fmtDate(inv.date)],
    ['Due Date', inv.dueDate ? fmtDate(inv.dueDate) : '—'],
  ];
  if (inv.withGst) meta.push(['Place of Supply', `${inv.placeOfSupply}${stateCode(inv.placeOfSupply) ? ` (${stateCode(inv.placeOfSupply)})` : ''}`]);
  const mw = (W - 2 * M) / meta.length;
  meta.forEach(([k, v], i) => {
    setText(c, 7, MUTED);
    doc.text(k.toUpperCase(), M + i * mw, y);
    setText(c, 9.5, INK, 'bold');
    doc.text(tx(c, v), M + i * mw, y + 4.8, { maxWidth: mw - 3 });
  });
  y += 11;

  // ---- From / Bill to
  const boxW = (W - 2 * M - 6) / 2;
  const fromLines = [
    co.address,
    [co.city, co.state].filter(Boolean).join(', ') + (co.pincode ? ` - ${co.pincode}` : ''),
    co.country,
    co.phone && `Phone: ${co.phone}`,
    co.email && `Email: ${co.email}`,
    co.website,
    co.gstin && `GSTIN: ${co.gstin}`,
    co.pan && `PAN: ${co.pan}`,
  ].filter(Boolean) as string[];
  const cu = inv.customer;
  const toLines = [
    cu.address,
    cu.state && `State: ${cu.state}${stateCode(cu.state) ? ` (${stateCode(cu.state)})` : ''}`,
    cu.phone && `Phone: ${cu.phone}`,
    cu.email && `Email: ${cu.email}`,
    cu.gstin ? `GSTIN: ${cu.gstin}` : inv.withGst ? 'GSTIN: Unregistered' : '',
  ].filter(Boolean) as string[];

  const party = (x: number, label: string, name: string, lines: string[]) => {
    let yy = y;
    setText(c, 7, MUTED, 'bold');
    doc.text(label, x + 4, yy + 5);
    setText(c, 10.5, INK, 'bold');
    doc.text(tx(c, name || '—'), x + 4, yy + 10.5, { maxWidth: boxW - 8 });
    yy += 15;
    setText(c, 8, INK2);
    for (const l of lines) {
      const wrapped = doc.splitTextToSize(tx(c, l), boxW - 8) as string[];
      doc.text(wrapped, x + 4, yy);
      yy += wrapped.length * 3.7;
    }
    return yy;
  };
  const measure = (lines: string[]) => 15 + lines.reduce((s, l) => s + (doc.splitTextToSize(l, boxW - 8) as string[]).length * 3.7, 0) + 2;
  const boxH = Math.max(measure(fromLines), measure(toLines), 30);
  doc.setFillColor(...SOFT);
  doc.setDrawColor(...LINE);
  doc.roundedRect(M, y, boxW, boxH, 2, 2, 'FD');
  doc.roundedRect(M + boxW + 6, y, boxW, boxH, 2, 2, 'FD');
  party(M, 'FROM', co.name, fromLines);
  party(M + boxW + 6, 'BILL TO', cu.name, toLines);
  y += boxH + 6;

  // ---- Items
  const head = inv.withGst
    ? [['#', 'Description', 'HSN/SAC', 'Qty', 'Rate', 'Disc.', 'Taxable', 'GST', 'Amount']]
    : [['#', 'Description', 'Qty', 'Rate', 'Disc.', 'Amount']];
  const body = calc.lines.map((l, i) => {
    const qty = `${num(l.item.qty, Number.isInteger(l.item.qty) ? 0 : 2)}${l.item.unit ? ` ${l.item.unit}` : ''}`;
    const disc = l.item.discount ? `${l.item.discount}%` : '—';
    return inv.withGst
      ? [String(i + 1), l.item.description || '—', l.item.hsn || '', qty, num(l.item.rate), disc, num(l.taxable), `${l.item.gstRate}%`, num(l.total)]
      : [String(i + 1), l.item.description || '—', qty, num(l.item.rate), disc, num(l.taxable)];
  });
  const right = { halign: 'right' as const };
  y = table(c, y, {
    head,
    body,
    theme: 'plain',
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    styles: { font: c.font, fontSize: 8.5, cellPadding: { top: 2.4, bottom: 2.4, left: 2, right: 2 }, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.15 } as never },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    columnStyles: inv.withGst
      ? { 0: { cellWidth: 8 }, 2: { cellWidth: 17 }, 3: { ...right, cellWidth: 19 }, 4: { ...right, cellWidth: 20 }, 5: { ...right, cellWidth: 12 }, 6: { ...right, cellWidth: 22 }, 7: { ...right, cellWidth: 11 }, 8: { ...right, cellWidth: 24, fontStyle: 'bold' } }
      : { 0: { cellWidth: 8 }, 2: { ...right, cellWidth: 20 }, 3: { ...right, cellWidth: 24 }, 4: { ...right, cellWidth: 14 }, 5: { ...right, cellWidth: 28, fontStyle: 'bold' } },
  });

  // ---- Totals (right) & words (left)
  if (y > H - 95) {
    doc.addPage();
    y = M + 4;
  }
  const totX = W - M - 78;
  const rows: [string, string, boolean?][] = [];
  if (calc.discount) {
    rows.push(['Sub total', m(calc.gross)]);
    rows.push(['Discount', `− ${m(calc.discount)}`]);
  }
  rows.push([inv.withGst ? 'Taxable amount' : 'Sub total', m(calc.taxable)]);
  if (inv.withGst) {
    if (calc.interState) rows.push(['IGST', m(calc.igst)]);
    else {
      rows.push(['CGST', m(calc.cgst)]);
      rows.push(['SGST', m(calc.sgst)]);
    }
  }
  if (calc.roundOff) rows.push(['Round off', `${calc.roundOff > 0 ? '+' : '−'} ${m(Math.abs(calc.roundOff))}`]);
  let ty = y;
  for (const [k, v] of rows) {
    setText(c, 8.5, INK2);
    doc.text(k, totX, ty);
    setText(c, 8.5, INK);
    doc.text(tx(c, v), W - M, ty, { align: 'right' });
    ty += 5.2;
  }
  doc.setFillColor(...BRAND);
  doc.roundedRect(totX - 3, ty - 3.5, W - M - totX + 3, 10, 1.5, 1.5, 'F');
  setText(c, 10, INK, 'bold');
  doc.text('TOTAL', totX, ty + 3);
  setText(c, 12, INK, 'bold');
  doc.text(tx(c, m(calc.total)), W - M - 2, ty + 3, { align: 'right' });
  ty += 12;
  if (paid > 0 && inv.status === 'final') {
    setText(c, 8.5, INK2);
    doc.text('Received', totX, ty);
    doc.text(tx(c, m(paid)), W - M, ty, { align: 'right' });
    ty += 5.2;
    setText(c, 9, INK, 'bold');
    doc.text('Balance due', totX, ty);
    doc.text(tx(c, m(Math.max(0, calc.total - paid))), W - M, ty, { align: 'right' });
    ty += 6;
  }

  // words + tax summary on the left
  const leftW = totX - M - 8;
  let ly = y - 3;
  setText(c, 7, MUTED, 'bold');
  doc.text('AMOUNT IN WORDS', M, ly + 1);
  setText(c, 8.5, INK, 'bold');
  const words = doc.splitTextToSize(tx(c, amountInWords(calc.total, cur)), leftW) as string[];
  doc.text(words, M, ly + 5.5);
  ly += 7 + words.length * 3.9;

  if (inv.withGst && calc.byRate.length) {
    const tHead = calc.interState ? [['GST %', 'Taxable', 'IGST', 'Total tax']] : [['GST %', 'Taxable', 'CGST', 'SGST', 'Total tax']];
    const tBody = calc.byRate.map((r) =>
      calc.interState ? [`${r.rate}%`, num(r.taxable), num(r.igst), num(r.tax)] : [`${r.rate}%`, num(r.taxable), num(r.cgst), num(r.sgst), num(r.tax)],
    );
    ly = table(c, ly + 1, {
      head: tHead,
      body: tBody,
      tableWidth: leftW,
      margin: { left: M, right: W - M - leftW },
      headStyles: { fillColor: SOFT, textColor: INK2, fontStyle: 'bold', fontSize: 7 },
      styles: { font: c.font, fontSize: 7.5, cellPadding: 1.4, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.1 } as never },
      columnStyles: { 1: right, 2: right, 3: right, 4: right },
    });
  }
  y = Math.max(ty, ly) + 2;

  // ---- Bank / notes / terms + signature
  const hasBank = co.bankName || co.accountNumber || co.upiId;
  const blockH = 34;
  if (y + blockH > H - 22) {
    doc.addPage();
    y = M + 4;
  }
  const colW = (W - 2 * M - 6) / 2;
  let by = y;
  if (hasBank) {
    setText(c, 7, MUTED, 'bold');
    doc.text('BANK DETAILS', M, by);
    by += 4.5;
    const bank: [string, string][] = (
      [
        ['Account name', co.accountName || co.name],
        ['Bank', [co.bankName, co.branch].filter(Boolean).join(', ')],
        ['A/c No.', co.accountNumber],
        ['IFSC', co.ifsc],
        ['UPI', co.upiId],
      ] as [string, string][]
    ).filter(([, v]) => v);
    for (const [k, v] of bank) {
      setText(c, 8, MUTED);
      doc.text(k, M, by);
      setText(c, 8, INK, 'bold');
      doc.text(tx(c, v), M + 24, by, { maxWidth: colW - 26 });
      by += 4.2;
    }
    by += 2;
  }
  if (inv.notes) {
    setText(c, 7, MUTED, 'bold');
    doc.text('NOTES', M, by);
    setText(c, 8, INK2);
    const nl = doc.splitTextToSize(tx(c, inv.notes), colW) as string[];
    doc.text(nl, M, by + 4.2);
    by += 6 + nl.length * 3.7;
  }

  // signature on the right
  const sx = M + colW + 6;
  setText(c, 8.5, INK, 'bold');
  doc.text(tx(c, `For ${co.name}`), W - M, y + 2, { align: 'right' });
  doc.setDrawColor(...LINE);
  doc.line(W - M - 55, y + 20, W - M, y + 20);
  setText(c, 7.5, MUTED);
  doc.text(tx(c, co.signatory ? `${co.signatory} · Authorised Signatory` : 'Authorised Signatory'), W - M, y + 24, { align: 'right' });
  void sx;

  y = Math.max(by, y + 30);
  if (inv.terms) {
    if (y > H - 30) {
      doc.addPage();
      y = M + 4;
    }
    setText(c, 7, MUTED, 'bold');
    doc.text('TERMS & CONDITIONS', M, y);
    setText(c, 7.5, INK2);
    const tl = doc.splitTextToSize(tx(c, inv.terms), W - 2 * M) as string[];
    doc.text(tl, M, y + 4);
  }

  // PAID stamp
  if (inv.status === 'final' && paid >= calc.total - 0.005 && calc.total > 0) {
    doc.setPage(1);
    setText(c, 34, INCOME, 'bold');
    const { GState } = await import('jspdf');
    doc.saveGraphicsState();
    doc.setGState(new GState({ opacity: 0.18 }));
    doc.text('PAID', W / 2, 150, { align: 'center', angle: 20 });
    doc.restoreGraphicsState();
  }

  // footer
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFillColor(...BRAND);
    doc.rect(0, H - 4, W, 4, 'F');
    setText(c, 7, MUTED);
    doc.text(tx(c, `This is a computer-generated invoice.  ·  ${co.name}  ·  ${co.phone}`), W / 2, H - 8, { align: 'center' });
    if (n > 1) doc.text(`Page ${i} of ${n}`, W - M, H - 8, { align: 'right' });
  }

  const fname = `${safeName(`Invoice ${inv.number} ${inv.customer.name}`)}.pdf`;
  if (mode === 'open') {
    const url = doc.output('bloburl') as unknown as string;
    const w = window.open(url, '_blank');
    if (!w) doc.save(fname);
  } else doc.save(fname);
}
