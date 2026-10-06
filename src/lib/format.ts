import { format, parseISO } from 'date-fns';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const fmtCache = new Map<string, Intl.NumberFormat>();
function nf(currency: string, decimals: number) {
  const key = `${currency}|${decimals}`;
  let f = fmtCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    } catch {
      f = new Intl.NumberFormat('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }
    fmtCache.set(key, f);
  }
  return f;
}

/** ₹1,23,456.50 — always 2 decimals (accounting) */
export function money(n: number, currency = 'INR') {
  return nf(currency, 2).format(round2(n || 0));
}

/** ₹1,23,457 — no decimals unless fractional */
export function moneyShort(n: number, currency = 'INR') {
  const v = round2(n || 0);
  return nf(currency, Number.isInteger(v) ? 0 : 2).format(v);
}

export function currencySymbol(currency = 'INR') {
  const parts = nf(currency, 0).formatToParts(0);
  return parts.find((p) => p.type === 'currency')?.value ?? currency;
}

/** ₹1.2L / ₹3.4Cr / ₹12.5K for compact tiles & axis ticks */
export function moneyCompact(n: number, currency = 'INR') {
  const sym = currencySymbol(currency);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const trim = (v: number) => (v >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, ''));
  if (currency === 'INR') {
    if (abs >= 1e7) return `${sign}${sym}${trim(abs / 1e7)}Cr`;
    if (abs >= 1e5) return `${sign}${sym}${trim(abs / 1e5)}L`;
  } else {
    if (abs >= 1e9) return `${sign}${sym}${trim(abs / 1e9)}B`;
    if (abs >= 1e6) return `${sign}${sym}${trim(abs / 1e6)}M`;
  }
  if (abs >= 1e3) return `${sign}${sym}${trim(abs / 1e3)}K`;
  return `${sign}${sym}${Math.round(abs)}`;
}

export function num(n: number, decimals = 2) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(
    round2(n || 0),
  );
}

export function pct(n: number, decimals = 1) {
  if (!isFinite(n)) return '—';
  return `${n.toFixed(decimals).replace(/\.0$/, '')}%`;
}

export function fmtDate(iso: string, pattern = 'dd MMM yyyy') {
  if (!iso) return '';
  try {
    return format(parseISO(iso), pattern);
  } catch {
    return iso;
  }
}

export function parseAmount(v: string | number): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return isFinite(n) ? n : 0;
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n]!;
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? twoDigits(r) : ''].filter(Boolean).join(' ');
}

/** Indian numbering: 12,34,567.50 → "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Fifty Paise" */
export function amountInWords(amount: number, currency = 'INR'): string {
  const value = round2(Math.abs(amount));
  let rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);
  const parts: string[] = [];
  const crore = Math.floor(rupees / 1e7);
  rupees %= 1e7;
  const lakh = Math.floor(rupees / 1e5);
  rupees %= 1e5;
  const thousand = Math.floor(rupees / 1000);
  rupees %= 1000;
  if (crore) parts.push(`${crore >= 100 ? threeDigits(crore) : twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rupees) parts.push(threeDigits(rupees));
  const main = parts.join(' ') || 'Zero';
  const isInr = currency === 'INR';
  const unit = isInr ? 'Rupees' : currency;
  const sub = isInr ? 'Paise' : 'Cents';
  return `${unit} ${main}${paise ? ` and ${twoDigits(paise)} ${sub}` : ''} Only`;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Evaluates "120+35.5*2" safely (digits and + - * / ( ) only). */
export function evalAmount(src: string): number | null {
  const s = src.replace(/,/g, '').replace(/\s/g, '');
  if (!s) return null;
  if (!/^[0-9+\-*/().]+$/.test(s)) return null;
  let i = 0;
  const peek = () => s[i];
  const num = (): number => {
    if (peek() === '(') {
      i++;
      const v = expr();
      if (peek() === ')') i++;
      return v;
    }
    if (peek() === '-') {
      i++;
      return -num();
    }
    const start = i;
    while (i < s.length && /[0-9.]/.test(s[i]!)) i++;
    const v = parseFloat(s.slice(start, i));
    if (isNaN(v)) throw new Error('bad');
    return v;
  };
  const term = (): number => {
    let v = num();
    while (peek() === '*' || peek() === '/') {
      const op = s[i++];
      const r = num();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  try {
    const v = expr();
    if (i !== s.length || !isFinite(v)) return null;
    return round2(v);
  } catch {
    return null;
  }
}
