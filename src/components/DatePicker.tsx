import { addDays, addMonths, addYears, endOfWeek, format, getMonth, getYear, isSameMonth, setMonth, setYear, startOfMonth, startOfWeek } from 'date-fns';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { addDaysISO, fromISO, todayISO, toISO, WEEK_OPTS } from '../lib/dates';
import { fmtDate } from '../lib/format';
import { cn } from './ui';

const MONTHS = Array.from({ length: 12 }, (_, i) => format(new Date(2000, i, 1), 'MMMM'));
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const GAP = 6;
const EDGE = 8;

const navSelect =
  'h-8 cursor-pointer appearance-none rounded-lg border border-line bg-surface px-2.5 text-sm font-semibold text-ink transition hover:border-line-strong focus:border-brand-strong focus:outline-none focus:ring-2 focus:ring-yellow-400/30 [&>option]:bg-surface';

/** Calendar dropdown for picking a single ISO date (yyyy-MM-dd). */
export function DatePicker({
  value,
  onChange,
  marked,
  min,
  max,
  className,
  label = 'Date',
  fromYear,
}: {
  value: string;
  onChange: (iso: string) => void;
  /** ISO dates to flag with a dot (e.g. days that already have entries) */
  marked?: Set<string>;
  min?: string;
  max?: string;
  className?: string;
  label?: string;
  /** earliest year in the year dropdown (default: 10 years back) */
  fromYear?: number;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => startOfMonth(fromISO(value)));
  const [focusDay, setFocusDay] = useState(value);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const wantFocus = useRef(false);

  const today = todayISO();
  const allowed = (iso: string) => (!min || iso >= min) && (!max || iso <= max);

  const openPicker = () => {
    setView(startOfMonth(fromISO(value)));
    setFocusDay(value);
    setPos(null);
    wantFocus.current = true;
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };
  const pick = (iso: string) => {
    if (!allowed(iso)) return;
    onChange(iso);
    close();
  };

  // place under the trigger (or above when there's no room), kept inside the viewport
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const t = triggerRef.current?.getBoundingClientRect();
      const p = popRef.current;
      if (!t || !p) return;
      const w = p.offsetWidth;
      const h = p.offsetHeight;
      let top = t.bottom + GAP;
      if (top + h > window.innerHeight - EDGE && t.top - GAP - h >= EDGE) top = t.top - GAP - h;
      const left = Math.min(Math.max(EDGE, t.left), window.innerWidth - w - EDGE);
      setPos({ top, left: Math.max(EDGE, left) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  // outside click closes; Escape closes without also closing a surrounding modal
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const n = e.target as Node;
      if (popRef.current?.contains(n) || triggerRef.current?.contains(n)) return;
      close(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // move keyboard focus to the active day after opening / arrow-key navigation
  useEffect(() => {
    if (!open || !pos || !wantFocus.current) return;
    wantFocus.current = false;
    popRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)?.focus({ preventScroll: true });
  }, [open, pos, focusDay, view]);

  const days = useMemo(() => {
    const start = startOfWeek(view, WEEK_OPTS);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [view]);

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    let from = Math.min(getYear(view), fromYear ?? now - 10);
    let to = Math.max(getYear(view), now + 1);
    if (min) from = Math.max(from, fromISO(min).getFullYear());
    if (max) to = Math.min(to, fromISO(max).getFullYear());
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }, [view, min, max, fromYear]);

  const moveFocus = (d: Date) => {
    const iso = toISO(d);
    if (!allowed(iso)) return;
    wantFocus.current = true;
    setFocusDay(iso);
    if (!isSameMonth(d, view)) setView(startOfMonth(d));
  };

  const onGridKey = (e: KeyboardEvent) => {
    const cur = fromISO(focusDay);
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(cur, -1),
      ArrowRight: () => addDays(cur, 1),
      ArrowUp: () => addDays(cur, -7),
      ArrowDown: () => addDays(cur, 7),
      PageUp: () => (e.shiftKey ? addYears(cur, -1) : addMonths(cur, -1)),
      PageDown: () => (e.shiftKey ? addYears(cur, 1) : addMonths(cur, 1)),
      Home: () => startOfWeek(cur, WEEK_OPTS),
      End: () => endOfWeek(cur, WEEK_OPTS),
    };
    const fn = moves[e.key];
    if (!fn) return;
    e.preventDefault();
    moveFocus(fn());
  };

  // keep a focusable (tab-reachable) day inside the visible month
  const goTo = (month: Date) => {
    const v = startOfMonth(month);
    setView(v);
    if (!isSameMonth(fromISO(focusDay), v)) setFocusDay(isSameMonth(fromISO(value), v) ? value : toISO(v));
  };

  const yesterday = addDaysISO(today, -1);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${fmtDate(value, 'EEEE, d MMMM yyyy')}`}
        onClick={() => (open ? close() : openPicker())}
        className={cn(
          'flex h-11 w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 text-left text-[15px] text-ink transition hover:border-line-strong focus:outline-none focus-visible:border-brand-strong focus-visible:ring-4 focus-visible:ring-yellow-400/20',
          open && 'border-brand-strong ring-4 ring-yellow-400/20',
          className,
        )}
      >
        <CalendarDays className="size-[18px] shrink-0 text-muted" />
        <span className="tabular min-w-0 flex-1 truncate font-medium">{fmtDate(value, 'EEE, dd MMM yyyy')}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted transition', open && 'rotate-180')} />
      </button>

      {open &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label={`Choose ${label.toLowerCase()}`}
            tabIndex={-1}
            onBlur={(e) => {
              const next = e.relatedTarget as Node | null;
              if (next && !popRef.current?.contains(next) && next !== triggerRef.current) close(false);
            }}
            style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
            className="animate-fade fixed z-[60] w-[304px] rounded-2xl border border-line bg-surface p-3 shadow-2xl outline-none"
          >
            {/* month / year navigation */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => goTo(addMonths(view, -1))}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-2 transition hover:bg-surface-2 hover:text-ink"
              >
                <ChevronLeft className="size-4" />
              </button>
              <div className="flex min-w-0 flex-1 justify-center gap-1.5">
                <select
                  aria-label="Month"
                  value={getMonth(view)}
                  onChange={(e) => goTo(setMonth(view, Number(e.target.value)))}
                  className={cn(navSelect, 'min-w-0 flex-1')}
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Year"
                  value={getYear(view)}
                  onChange={(e) => goTo(setYear(view, Number(e.target.value)))}
                  className={cn(navSelect, 'tabular w-[76px]')}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => goTo(addMonths(view, 1))}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-2 transition hover:bg-surface-2 hover:text-ink"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            {/* day grid */}
            <div className="mt-3 grid grid-cols-7 gap-0.5" onKeyDown={onGridKey}>
              {WEEKDAYS.map((w) => (
                <span key={w} className="pb-1 text-center text-[11px] font-semibold uppercase text-muted">
                  {w}
                </span>
              ))}
              {days.map((d) => {
                const iso = toISO(d);
                const inMonth = isSameMonth(d, view);
                const selected = iso === value;
                const isToday = iso === today;
                const ok = allowed(iso);
                return (
                  <button
                    key={iso}
                    type="button"
                    data-day={iso}
                    tabIndex={iso === focusDay ? 0 : -1}
                    disabled={!ok}
                    aria-pressed={selected}
                    aria-current={isToday ? 'date' : undefined}
                    aria-label={format(d, 'EEEE, d MMMM yyyy')}
                    onClick={() => pick(iso)}
                    className={cn(
                      'tabular relative flex h-9 items-center justify-center rounded-lg text-sm transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-strong disabled:cursor-not-allowed disabled:opacity-30',
                      selected
                        ? 'bg-ink font-semibold text-bg'
                        : cn('hover:bg-surface-2', inMonth ? 'text-ink' : 'text-muted/60', isToday && 'font-semibold ring-1 ring-inset ring-brand-strong'),
                    )}
                  >
                    {d.getDate()}
                    {marked?.has(iso) && (
                      <span className={cn('absolute bottom-1 size-1 rounded-full', selected ? 'bg-brand' : 'bg-muted')} aria-hidden />
                    )}
                  </button>
                );
              })}
            </div>

            {/* shortcuts */}
            <div className="mt-2 flex items-center gap-1.5 border-t border-line pt-2.5">
              {(
                [
                  ['Today', today],
                  ['Yesterday', yesterday],
                ] as const
              ).map(([text, iso]) => (
                <button
                  key={text}
                  type="button"
                  disabled={!allowed(iso)}
                  onClick={() => pick(iso)}
                  className={cn(
                    'h-8 rounded-lg px-3 text-xs font-semibold transition disabled:opacity-40',
                    value === iso ? 'bg-ink text-bg' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  {text}
                </button>
              ))}
              {marked && (
                <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="size-1 rounded-full bg-muted" aria-hidden /> has entries
                </span>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
