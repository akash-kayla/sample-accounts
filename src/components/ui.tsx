import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, LoaderCircle, X } from 'lucide-react';
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { addDaysISO, todayISO } from '../lib/dates';
import { fmtDate as fmtDateSafe, money, moneyCompact, moneyShort } from '../lib/format';
import { useData } from '../store/data';

export const cn = (...c: ClassValue[]) => twMerge(clsx(c));

/* ---------------- Buttons ---------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:bg-brand-strong shadow-sm shadow-yellow-500/20',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-expense text-white hover:opacity-90',
  dark: 'bg-ink text-bg hover:opacity-90',
};
const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-11 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-base gap-2 rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center font-semibold transition-[background,opacity,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-strong',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-2 transition hover:bg-surface-2 hover:text-ink active:scale-95 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-brand-strong',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------------- Layout bits ---------------- */

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.03)]', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------------- Form controls ---------------- */

const control =
  'w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-muted transition focus:border-brand-strong focus:outline-none focus:ring-4 focus:ring-yellow-400/20 disabled:opacity-60';

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
  aside,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null | false;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
  aside?: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {(label || aside) && (
        <div className="flex items-center justify-between gap-2">
          {label && (
            <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
              {label}
            </label>
          )}
          {aside}
        </div>
      )}
      {children}
      {error ? <p className="text-xs font-medium text-expense">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(control, 'h-11', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cn(control, 'min-h-[84px] py-2.5 leading-relaxed', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          control,
          'h-11 cursor-pointer appearance-none pr-9 [&>option]:bg-surface [&>optgroup]:bg-surface',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden
      >
        <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
      </svg>
    </div>
  );
});

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
  full,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; activeClass?: string }[];
  className?: string;
  size?: 'sm' | 'md';
  full?: boolean;
}) {
  return (
    <div role="radiogroup" className={cn('inline-flex rounded-xl bg-surface-2 p-1', full && 'flex w-full', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition',
              size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
              active ? cn('bg-surface text-ink shadow-sm', o.activeClass) : 'text-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
  className,
  icon,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition active:scale-95',
        active ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm font-semibold text-ink">{label}</span>}
          {description && <span className="block text-xs text-muted">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition focus-visible:outline-2 focus-visible:outline-brand-strong',
          checked ? 'bg-brand' : 'bg-surface-3',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-6 rounded-full bg-white shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
    </label>
  );
}

/* ---------------- Feedback ---------------- */

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn('size-5 animate-spin text-muted', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-surface-2', className)} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
      <Skeleton className="h-40" />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
  className,
}: {
  icon: ReactNode;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-ink [&>svg]:size-6">{icon}</div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  neutral: 'bg-surface-2 text-ink-2',
  income: 'bg-income-soft text-income',
  expense: 'bg-expense-soft text-expense',
  info: 'bg-info-soft text-info',
  warn: 'bg-warn-soft text-warn',
  brand: 'bg-brand-soft text-ink',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: keyof typeof BADGE; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-semibold', BADGE[tone], className)}>
      {children}
    </span>
  );
}

/* ---------------- Money ---------------- */

export function Money({
  value,
  type,
  className,
  compact,
  signed,
  roundOnMobile,
}: {
  value: number;
  type?: 'income' | 'expense' | 'net';
  className?: string;
  compact?: boolean;
  signed?: boolean;
  /** whole rupees on phones, paise from sm: up */
  roundOnMobile?: boolean;
}) {
  const { currency } = useData();
  const color =
    type === 'income' ? 'text-income' : type === 'expense' ? 'text-expense' : type === 'net' ? (value < 0 ? 'text-expense' : 'text-income') : '';
  const sign = signed ? (type === 'expense' ? '−' : type === 'income' ? '+' : value < 0 ? '−' : '') : value < 0 ? '−' : '';
  const abs = Math.abs(value);
  return (
    <span className={cn('tabular whitespace-nowrap', color, className)}>
      {sign}
      {compact ? (
        moneyCompact(abs, currency)
      ) : roundOnMobile ? (
        <>
          <span className="sm:hidden">{abs >= 1e7 ? moneyCompact(abs, currency) : moneyShort(Math.round(abs), currency)}</span>
          <span className="hidden sm:inline">{money(abs, currency)}</span>
        </>
      ) : (
        money(abs, currency)
      )}
    </span>
  );
}

export function StatCard({
  label,
  value,
  type,
  icon,
  sub,
  className,
  onClick,
  dense,
}: {
  label: string;
  value: number;
  type?: 'income' | 'expense' | 'net';
  icon?: ReactNode;
  sub?: ReactNode;
  className?: string;
  onClick?: () => void;
  /** narrow tiles on phones: smaller, rounded value */
  dense?: boolean;
}) {
  const { currency } = useData();
  const Comp = onClick ? 'button' : 'div';
  const full = Math.abs(value) >= 1e7 ? moneyCompact(Math.abs(value), currency) : money(Math.abs(value), currency).replace(/\.00$/, '');
  return (
    <Comp
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-surface text-left',
        dense ? 'p-3 sm:p-4' : 'p-4',
        onClick && 'transition hover:border-line-strong active:scale-[0.99]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-muted">{label}</span>
        {icon && <span className="text-muted [&>svg]:size-4">{icon}</span>}
      </div>
      <span
        className={cn(
          'truncate font-bold tracking-tight sm:text-2xl',
          dense ? 'text-base' : 'text-xl',
          type === 'net' && value < 0 && 'text-expense',
        )}
        title={money(value, currency)}
      >
        {value < 0 ? '−' : ''}
        {dense ? (
          <>
            <span className="sm:hidden">{Math.abs(value) >= 1e5 ? moneyCompact(Math.abs(value), currency) : moneyShort(Math.round(Math.abs(value)), currency)}</span>
            <span className="hidden sm:inline">{full}</span>
          </>
        ) : (
          full
        )}
      </span>
      {sub && <span className="truncate text-xs text-muted">{sub}</span>}
    </Comp>
  );
}

/* ---------------- Modal / sheet ---------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="animate-fade absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cn(
          'animate-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line bg-surface shadow-2xl sm:rounded-2xl',
          width,
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <IconButton label="Close" onClick={onClose} className="-mr-2">
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="safe-bottom flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------- Confirm ---------------- */

interface ConfirmOpts {
  title: string;
  message?: ReactNode;
  confirmText?: string;
  danger?: boolean;
}
type ConfirmFn = (o: ConfirmOpts) => Promise<boolean>;
const ConfirmCtx = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback<ConfirmFn>((o) => new Promise((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button onClick={() => close(false)}>Cancel</Button>
            <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
              {state?.confirmText ?? 'Confirm'}
            </Button>
          </>
        }
      >
        <div className="text-sm text-ink-2">{state?.message}</div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const c = useContext(ConfirmCtx);
  if (!c) throw new Error('useConfirm outside ConfirmProvider');
  return c;
}

/* ---------------- Menu ---------------- */

export function Menu({
  trigger,
  children,
  align = 'right',
}: {
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', fn);
    document.addEventListener('touchstart', fn);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', fn);
      document.removeEventListener('touchstart', fn);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open })}
      {open && (
        <div
          role="menu"
          className={cn(
            'animate-fade absolute z-40 mt-1.5 min-w-[200px] overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-xl',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
  hint,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  hint?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition hover:bg-surface-2 [&>svg]:size-4',
        danger ? 'text-expense' : 'text-ink',
      )}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </button>
  );
}

/* ---------------- Export ---------------- */

export function ExportButtons({
  onExcel,
  onPdf,
  label = 'Download',
  compact,
}: {
  onExcel: () => Promise<void> | void;
  onPdf: () => Promise<void> | void;
  label?: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<'x' | 'p' | null>(null);
  const run = async (k: 'x' | 'p', fn: () => Promise<void> | void) => {
    setBusy(k);
    const id = toast.loading(k === 'x' ? 'Preparing Excel…' : 'Preparing PDF…');
    try {
      await fn();
      toast.success(k === 'x' ? 'Excel downloaded' : 'PDF downloaded', { id });
    } catch (e) {
      console.error(e);
      toast.error('Download failed. Please try again.', { id });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Menu
      trigger={(p) => (
        <Button {...p} icon={busy ? undefined : <Download className="size-4" />} loading={!!busy} size={compact ? 'sm' : 'md'}>
          {label}
        </Button>
      )}
    >
      {(close) => (
        <>
          <MenuItem
            icon={<FileSpreadsheet className="text-income" />}
            hint=".xlsx"
            onClick={() => {
              close();
              void run('x', onExcel);
            }}
          >
            Excel
          </MenuItem>
          <MenuItem
            icon={<FileText className="text-expense" />}
            hint=".pdf"
            onClick={() => {
              close();
              void run('p', onPdf);
            }}
          >
            PDF
          </MenuItem>
        </>
      )}
    </Menu>
  );
}

/* ---------------- Date navigation ---------------- */

export function DateNav({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const today = todayISO();
  return (
    <div className="flex items-center gap-1.5">
      <IconButton label="Previous day" onClick={() => onChange(addDaysISO(value, -1))} className="border border-line bg-surface">
        <ChevronLeft className="size-5" />
      </IconButton>
      <label className="relative flex h-10 min-w-0 cursor-pointer items-center rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-ink">
        <span className="whitespace-nowrap">{value === today ? 'Today' : fmtDateSafe(value, 'EEE, dd MMM yyyy')}</span>
        <input
          type="date"
          value={value}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Pick date"
        />
      </label>
      <IconButton label="Next day" onClick={() => onChange(addDaysISO(value, 1))} className="border border-line bg-surface">
        <ChevronRight className="size-5" />
      </IconButton>
      {value !== today && (
        <Button size="sm" variant="ghost" onClick={() => onChange(today)}>
          Today
        </Button>
      )}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between px-1">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{children}</h2>
      {action}
    </div>
  );
}
