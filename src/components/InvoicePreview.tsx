import { stateCode } from '../lib/defaults';
import { amountInWords, fmtDate, money, num } from '../lib/format';
import { calcInvoice } from '../lib/gst';
import type { Invoice, Settings } from '../lib/types';

/** On-screen replica of the invoice PDF (always light, like paper). */
export function InvoicePreview({ inv, settings, paid }: { inv: Invoice; settings: Settings; paid: number }) {
  const co = settings.company;
  const cur = settings.currency;
  const c = calcInvoice(inv, co.state);
  const m = (n: number) => money(n, cur);
  const cu = inv.customer;
  return (
    <div className="mx-auto w-full max-w-[720px] overflow-hidden rounded-xl bg-white text-[11px] leading-snug text-[#111110] shadow-[0_8px_40px_rgba(0,0,0,0.12)] ring-1 ring-black/5">
      <div className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <img src={co.logo || '/logo.png'} alt={co.name} className="h-8 w-auto max-w-[200px] object-contain" />
          <div className="text-right">
            <p className="text-xl font-bold tracking-tight">{inv.withGst ? 'TAX INVOICE' : 'INVOICE'}</p>
            <p className="text-[9px] font-medium tracking-wide text-[#898781]">{inv.status === 'draft' ? 'DRAFT' : 'ORIGINAL FOR RECIPIENT'}</p>
          </div>
        </div>
        <div className="my-4 h-1 rounded bg-[#facc15]" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Invoice No.', inv.number],
            ['Invoice Date', fmtDate(inv.date)],
            ['Due Date', inv.dueDate ? fmtDate(inv.dueDate) : '—'],
            ...(inv.withGst ? [['Place of Supply', `${inv.placeOfSupply}${stateCode(inv.placeOfSupply) ? ` (${stateCode(inv.placeOfSupply)})` : ''}`]] : []),
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-[8px] font-semibold uppercase tracking-wider text-[#898781]">{k}</p>
              <p className="font-bold">{v}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[#e1e0d9] bg-[#f6f6f3] p-3">
            <p className="text-[8px] font-bold uppercase tracking-wider text-[#898781]">From</p>
            <p className="mt-1 text-[13px] font-bold">{co.name}</p>
            <div className="mt-1 space-y-0.5 text-[#52514e]">
              <p>{co.address}</p>
              <p>
                {[co.city, co.state].filter(Boolean).join(', ')}
                {co.pincode && ` - ${co.pincode}`}
              </p>
              {co.phone && <p>Phone: {co.phone}</p>}
              {co.email && <p>Email: {co.email}</p>}
              {co.gstin && <p>GSTIN: {co.gstin}</p>}
            </div>
          </div>
          <div className="rounded-lg border border-[#e1e0d9] bg-[#f6f6f3] p-3">
            <p className="text-[8px] font-bold uppercase tracking-wider text-[#898781]">Bill to</p>
            <p className="mt-1 text-[13px] font-bold">{cu.name || <span className="text-[#c3c2b7]">Customer name</span>}</p>
            <div className="mt-1 space-y-0.5 text-[#52514e]">
              {cu.address && <p className="whitespace-pre-line">{cu.address}</p>}
              {cu.state && <p>State: {cu.state}</p>}
              {cu.phone && <p>Phone: {cu.phone}</p>}
              {cu.email && <p>Email: {cu.email}</p>}
              {(cu.gstin || inv.withGst) && <p>GSTIN: {cu.gstin || 'Unregistered'}</p>}
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-[10px]">
            <thead>
              <tr className="bg-[#111110] text-left text-[9px] font-semibold text-white">
                <th className="px-1.5 py-1.5">#</th>
                <th className="px-1.5 py-1.5">Description</th>
                {inv.withGst && <th className="px-1.5 py-1.5">HSN/SAC</th>}
                <th className="px-1.5 py-1.5 text-right">Qty</th>
                <th className="px-1.5 py-1.5 text-right">Rate</th>
                <th className="px-1.5 py-1.5 text-right">Disc.</th>
                {inv.withGst && <th className="px-1.5 py-1.5 text-right">Taxable</th>}
                {inv.withGst && <th className="px-1.5 py-1.5 text-right">GST</th>}
                <th className="px-1.5 py-1.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {c.lines.map((l, i) => (
                <tr key={l.item.id} className="border-b border-[#e1e0d9] align-top">
                  <td className="px-1.5 py-1.5">{i + 1}</td>
                  <td className="px-1.5 py-1.5">{l.item.description || <span className="text-[#c3c2b7]">Item description</span>}</td>
                  {inv.withGst && <td className="px-1.5 py-1.5">{l.item.hsn}</td>}
                  <td className="px-1.5 py-1.5 text-right">
                    {l.item.qty} {l.item.unit}
                  </td>
                  <td className="px-1.5 py-1.5 text-right">{num(l.item.rate)}</td>
                  <td className="px-1.5 py-1.5 text-right">{l.item.discount ? `${l.item.discount}%` : '—'}</td>
                  {inv.withGst && <td className="px-1.5 py-1.5 text-right">{num(l.taxable)}</td>}
                  {inv.withGst && <td className="px-1.5 py-1.5 text-right">{l.item.gstRate}%</td>}
                  <td className="px-1.5 py-1.5 text-right font-bold">{num(inv.withGst ? l.total : l.taxable)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_230px]">
          <div>
            <p className="text-[8px] font-bold uppercase tracking-wider text-[#898781]">Amount in words</p>
            <p className="font-semibold">{amountInWords(c.total, cur)}</p>
            {inv.withGst && c.byRate.length > 0 && (
              <table className="mt-3 w-full border-collapse text-[9px]">
                <thead>
                  <tr className="bg-[#f6f6f3] text-[#52514e]">
                    <th className="px-1.5 py-1 text-left">GST %</th>
                    <th className="px-1.5 py-1 text-right">Taxable</th>
                    {c.interState ? (
                      <th className="px-1.5 py-1 text-right">IGST</th>
                    ) : (
                      <>
                        <th className="px-1.5 py-1 text-right">CGST</th>
                        <th className="px-1.5 py-1 text-right">SGST</th>
                      </>
                    )}
                    <th className="px-1.5 py-1 text-right">Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {c.byRate.map((r) => (
                    <tr key={r.rate} className="border-b border-[#e1e0d9]">
                      <td className="px-1.5 py-1">{r.rate}%</td>
                      <td className="px-1.5 py-1 text-right">{num(r.taxable)}</td>
                      {c.interState ? (
                        <td className="px-1.5 py-1 text-right">{num(r.igst)}</td>
                      ) : (
                        <>
                          <td className="px-1.5 py-1 text-right">{num(r.cgst)}</td>
                          <td className="px-1.5 py-1 text-right">{num(r.sgst)}</td>
                        </>
                      )}
                      <td className="px-1.5 py-1 text-right">{num(r.tax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="space-y-1">
            {c.discount > 0 && (
              <>
                <Line k="Sub total" v={m(c.gross)} />
                <Line k="Discount" v={`− ${m(c.discount)}`} />
              </>
            )}
            <Line k={inv.withGst ? 'Taxable amount' : 'Sub total'} v={m(c.taxable)} />
            {inv.withGst &&
              (c.interState ? (
                <Line k="IGST" v={m(c.igst)} />
              ) : (
                <>
                  <Line k="CGST" v={m(c.cgst)} />
                  <Line k="SGST" v={m(c.sgst)} />
                </>
              ))}
            {c.roundOff !== 0 && <Line k="Round off" v={`${c.roundOff > 0 ? '+' : '−'} ${m(Math.abs(c.roundOff))}`} />}
            <div className="mt-1 flex items-center justify-between rounded-md bg-[#facc15] px-2.5 py-2 text-[13px] font-bold">
              <span>TOTAL</span>
              <span>{m(c.total)}</span>
            </div>
            {paid > 0 && inv.status === 'final' && (
              <>
                <Line k="Received" v={m(paid)} />
                <Line k={<b>Balance due</b>} v={<b>{m(Math.max(0, c.total - paid))}</b>} />
              </>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            {(co.bankName || co.accountNumber || co.upiId) && (
              <div>
                <p className="text-[8px] font-bold uppercase tracking-wider text-[#898781]">Bank details</p>
                <div className="mt-0.5 grid grid-cols-[70px_1fr] gap-x-2 text-[10px]">
                  {(
                    [
                      ['Account', co.accountName || co.name],
                      ['Bank', [co.bankName, co.branch].filter(Boolean).join(', ')],
                      ['A/c No.', co.accountNumber],
                      ['IFSC', co.ifsc],
                      ['UPI', co.upiId],
                    ] as [string, string][]
                  )
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k} className="contents">
                        <span className="text-[#898781]">{k}</span>
                        <span className="font-semibold">{v}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
            {inv.notes && (
              <div>
                <p className="text-[8px] font-bold uppercase tracking-wider text-[#898781]">Notes</p>
                <p className="whitespace-pre-line text-[#52514e]">{inv.notes}</p>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end justify-between text-right">
            <p className="font-bold">For {co.name}</p>
            <div className="mt-10 w-44 border-t border-[#e1e0d9] pt-1 text-[9px] text-[#898781]">
              {co.signatory ? `${co.signatory} · ` : ''}Authorised Signatory
            </div>
          </div>
        </div>
        {inv.terms && (
          <div className="mt-4">
            <p className="text-[8px] font-bold uppercase tracking-wider text-[#898781]">Terms & conditions</p>
            <p className="whitespace-pre-line text-[10px] text-[#52514e]">{inv.terms}</p>
          </div>
        )}
      </div>
      <div className="bg-[#facc15] px-6 py-1.5 text-center text-[9px] font-medium">
        This is a computer-generated invoice · {co.name} · {co.phone}
      </div>
    </div>
  );
}

function Line({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-2.5 text-[11px]">
      <span className="text-[#52514e]">{k}</span>
      <span className="tabular">{v}</span>
    </div>
  );
}
