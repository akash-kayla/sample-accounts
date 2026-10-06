import {
  BadgePercent,
  BookOpen,
  CalendarDays,
  ChartPie,
  CirclePlus,
  Ellipsis,
  House,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  Plus,
  ReceiptText,
  Settings,
  Sun,
  Tags,
  TriangleAlert,
  WifiOff,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { useData } from '../store/data';
import { useTheme, type ThemeMode } from '../store/theme';
import { cn, IconButton, Modal, Segmented } from './ui';

export const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/add', label: 'Add Entry', icon: CirclePlus, hint: 'N' },
  { to: '/daily', label: 'Daily Expenses', icon: CalendarDays },
  { to: '/invoices', label: 'Invoices', icon: ReceiptText },
  { to: '/accounts', label: 'Ledgers & Books', icon: BookOpen },
  { to: '/gst', label: 'GST', icon: BadgePercent },
  { to: '/reports', label: 'Reports', icon: ChartPie },
  { to: '/categories', label: 'Categories', icon: Tags },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Logo({ className }: { className?: string }) {
  const { dark } = useTheme();
  return <img src={dark ? '/logo-white.png' : '/logo.png'} alt="bananads." className={cn('h-6 w-auto select-none', className)} draggable={false} />;
}

const THEME_OPTS: { value: ThemeMode; label: ReactNode }[] = [
  { value: 'light', label: <Sun className="size-4" aria-label="Light" /> },
  { value: 'dark', label: <Moon className="size-4" aria-label="Dark" /> },
  { value: 'system', label: <Monitor className="size-4" aria-label="System" /> },
];

function Sidebar() {
  const { user, logout } = useAuth();
  const { mode, setMode } = useTheme();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-16 items-center gap-2 px-6">
        <Logo />
        <span className="ml-1 rounded-md bg-brand px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-ink">Books</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              cn(
                'group flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition',
                isActive ? 'bg-ink text-bg' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                <n.icon className={cn('size-[18px]', isActive && n.to === '/add' && 'text-brand')} />
                <span className="flex-1">{n.label}</span>
                {n.hint && (
                  <kbd className={cn('rounded border px-1.5 text-[10px] font-semibold', isActive ? 'border-white/20' : 'border-line text-muted')}>
                    {n.hint}
                  </kbd>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-3 border-t border-line p-4">
        <Segmented size="sm" full value={mode} onChange={setMode} options={THEME_OPTS} />
        <div className="flex items-center gap-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-ink">
            {(user?.email ?? '?')[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-ink">{user?.email}</p>
            <p className="text-[11px] text-muted">Signed in</p>
          </div>
          <IconButton label="Sign out" onClick={() => void logout()}>
            <LogOut className="size-4" />
          </IconButton>
        </div>
      </div>
    </aside>
  );
}

function MobileTopBar() {
  const { dark, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/85 px-4 backdrop-blur-md lg:hidden">
      <NavLink to="/" className="flex items-center gap-2">
        <Logo className="h-5" />
      </NavLink>
      <IconButton label={dark ? 'Light mode' : 'Dark mode'} onClick={toggle}>
        {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </IconButton>
    </header>
  );
}

function BottomNav({ onMore }: { onMore: () => void }) {
  const tab = (to: string, label: string, Icon: typeof House, end?: boolean) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn('flex flex-1 flex-col items-center justify-center gap-0.5 pt-1 text-[11px] font-medium', isActive ? 'text-ink' : 'text-muted')
      }
    >
      {({ isActive }) => (
        <>
          <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition', isActive && 'bg-brand-soft')}>
            <Icon className="size-5" />
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden">
      <div className="flex h-16 items-stretch">
        {tab('/', 'Home', House, true)}
        {tab('/daily', 'Daily', CalendarDays)}
        <div className="flex flex-1 items-center justify-center">
          <NavLink
            to="/add"
            aria-label="Add entry"
            className="-mt-6 flex size-14 items-center justify-center rounded-2xl bg-brand text-brand-ink shadow-lg shadow-yellow-500/30 ring-4 ring-bg transition active:scale-95"
          >
            <Plus className="size-7" strokeWidth={2.5} />
          </NavLink>
        </div>
        {tab('/reports', 'Reports', ChartPie)}
        <button
          type="button"
          onClick={onMore}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 pt-1 text-[11px] font-medium text-muted"
        >
          <span className="flex h-7 w-12 items-center justify-center rounded-full">
            <Ellipsis className="size-5" />
          </span>
          More
        </button>
      </div>
    </nav>
  );
}

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const { mode, setMode } = useTheme();
  return (
    <Modal open={open} onClose={onClose} title="Menu">
      <div className="grid grid-cols-3 gap-2">
        {NAV.filter((n) => n.to !== '/add').map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-2 rounded-2xl border p-3 text-center text-xs font-medium transition',
                isActive ? 'border-ink bg-ink text-bg' : 'border-line bg-surface-2/50 text-ink',
              )
            }
          >
            <n.icon className="size-5" />
            {n.label}
          </NavLink>
        ))}
      </div>
      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-ink-2">Theme</span>
          <Segmented size="sm" value={mode} onChange={setMode} options={THEME_OPTS} />
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-surface-2 p-3">
          <span className="truncate text-sm text-ink-2">{user?.email}</span>
          <button type="button" onClick={() => void logout()} className="flex items-center gap-1.5 text-sm font-semibold text-expense">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [more, setMore] = useState(false);
  const { error, ready, slow, online } = useData();
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  // "N" anywhere → new entry
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (el.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        nav('/add');
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [nav]);

  return (
    <div className="min-h-dvh">
      <Sidebar />
      <MobileTopBar />
      <main className="pb-nav lg:pl-64">
        <div className="mx-auto w-full max-w-7xl px-4 pt-5 sm:px-6 lg:px-8 lg:pt-8">
          {error && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl border border-expense/30 bg-expense-soft p-4 text-sm text-expense">
              <TriangleAlert className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-semibold">Can’t reach your data</p>
                <p className="mt-0.5 opacity-90">{error}</p>
              </div>
            </div>
          )}
          {slow && !error && (
            <div className="mb-4 rounded-2xl border border-warn/30 bg-warn-soft p-4 text-sm text-warn">
              {ready ? 'Showing your last saved copy — still syncing with the database…' : 'Connecting to the database…'} If this keeps happening,
              check your internet connection and that the Realtime Database rules are published.
            </div>
          )}
          {ready && !online && !slow && (
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink-2">
              <WifiOff className="size-4 shrink-0" />
              You’re offline. New entries are kept and will sync when you’re back online — keep this tab open until then.
            </div>
          )}
          {children}
        </div>
      </main>
      <BottomNav onMore={() => setMore(true)} />
      <MoreSheet open={more} onClose={() => setMore(false)} />
    </div>
  );
}
