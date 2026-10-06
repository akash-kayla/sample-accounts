import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

export interface DateRange {
  from: string;
  to: string;
}

export type RangePreset = 'today' | 'week' | 'month' | 'year' | 'custom';
export type PeriodKind = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
export type YearType = 'fy' | 'calendar';

export const WEEK_OPTS = { weekStartsOn: 1 as const };

export const toISO = (d: Date) => format(d, 'yyyy-MM-dd');
export const todayISO = () => toISO(new Date());
export const fromISO = (s: string) => parseISO(s);

export function inRange(iso: string, r: DateRange) {
  return iso >= r.from && iso <= r.to;
}

export function fyStartYear(d: Date) {
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

/** "2026-27" */
export function fyLabel(d: Date = new Date()) {
  const y = fyStartYear(d);
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

export function yearRange(d: Date, yearType: YearType): DateRange {
  if (yearType === 'calendar') return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` };
  const y = fyStartYear(d);
  return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
}

export function periodRange(kind: Exclude<PeriodKind, 'custom'>, anchor: Date, yearType: YearType): DateRange {
  switch (kind) {
    case 'daily':
      return { from: toISO(anchor), to: toISO(anchor) };
    case 'weekly':
      return { from: toISO(startOfWeek(anchor, WEEK_OPTS)), to: toISO(endOfWeek(anchor, WEEK_OPTS)) };
    case 'monthly':
      return { from: toISO(startOfMonth(anchor)), to: toISO(endOfMonth(anchor)) };
    case 'yearly':
      return yearRange(anchor, yearType);
  }
}

export function shiftAnchor(kind: Exclude<PeriodKind, 'custom'>, anchor: Date, dir: 1 | -1) {
  switch (kind) {
    case 'daily':
      return addDays(anchor, dir);
    case 'weekly':
      return addWeeks(anchor, dir);
    case 'monthly':
      return addMonths(anchor, dir);
    case 'yearly':
      return addYears(anchor, dir);
  }
}

export function periodLabel(kind: PeriodKind, r: DateRange, yearType: YearType) {
  const f = fromISO(r.from);
  const t = fromISO(r.to);
  switch (kind) {
    case 'daily':
      return format(f, 'EEE, dd MMM yyyy');
    case 'weekly':
      return `${format(f, 'dd MMM')} – ${format(t, 'dd MMM yyyy')}`;
    case 'monthly':
      return format(f, 'MMMM yyyy');
    case 'yearly':
      return yearType === 'fy' ? `FY ${fyLabel(f)}` : format(f, 'yyyy');
    default:
      return rangeLabel(r);
  }
}

export function rangeLabel(r: DateRange) {
  if (r.from === r.to) return format(fromISO(r.from), 'dd MMM yyyy');
  const f = fromISO(r.from);
  const t = fromISO(r.to);
  const sameYear = f.getFullYear() === t.getFullYear();
  return `${format(f, sameYear ? 'dd MMM' : 'dd MMM yyyy')} – ${format(t, 'dd MMM yyyy')}`;
}

export function presetRange(preset: Exclude<RangePreset, 'custom'>, yearType: YearType, ref = new Date()): DateRange {
  switch (preset) {
    case 'today':
      return periodRange('daily', ref, yearType);
    case 'week':
      return periodRange('weekly', ref, yearType);
    case 'month':
      return periodRange('monthly', ref, yearType);
    case 'year':
      return periodRange('yearly', ref, yearType);
  }
}

export function eachDay(r: DateRange): string[] {
  const out: string[] = [];
  const start = fromISO(r.from);
  const n = differenceInCalendarDays(fromISO(r.to), start);
  for (let i = 0; i <= n && i < 3700; i++) out.push(toISO(addDays(start, i)));
  return out;
}

/** "2026-10" keys from range start to end */
export function eachMonth(r: DateRange): string[] {
  const out: string[] = [];
  let d = startOfMonth(fromISO(r.from));
  const end = fromISO(r.to);
  while (d <= end && out.length < 240) {
    out.push(format(d, 'yyyy-MM'));
    d = addMonths(d, 1);
  }
  return out;
}

export function rangeDays(r: DateRange) {
  return differenceInCalendarDays(fromISO(r.to), fromISO(r.from)) + 1;
}

export function lastNMonths(n: number, end = new Date()): DateRange {
  return { from: toISO(startOfMonth(addMonths(end, -(n - 1)))), to: toISO(endOfMonth(end)) };
}

export function monthLabel(key: string, pattern = 'MMM yy') {
  return format(parseISO(`${key}-01`), pattern);
}

export function addDaysISO(iso: string, n: number) {
  return toISO(addDays(fromISO(iso), n));
}
