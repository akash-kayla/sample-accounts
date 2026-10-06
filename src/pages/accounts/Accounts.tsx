import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { cn, PageHeader } from '../../components/ui';
import { CashBankBook, DayBook } from './Books';
import { LedgersPage, LedgerView } from './Ledgers';
import { BalanceSheetPage, ProfitLossPage, TrialBalancePage } from './Statements';
import { VouchersPage } from './Vouchers';

const TABS = [
  { to: 'ledgers', label: 'Ledgers' },
  { to: 'vouchers', label: 'Vouchers' },
  { to: 'daybook', label: 'Day Book' },
  { to: 'cashbook', label: 'Cash Book' },
  { to: 'bankbook', label: 'Bank Book' },
  { to: 'trial-balance', label: 'Trial Balance' },
  { to: 'pnl', label: 'Profit & Loss' },
  { to: 'balance-sheet', label: 'Balance Sheet' },
];

export default function Accounts() {
  return (
    <div>
      <PageHeader title="Ledgers & Books" subtitle="Double-entry accounting — every entry and invoice posts here automatically." />
      <nav className="no-scrollbar -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={`/accounts/${t.to}`}
            className={({ isActive }) =>
              cn(
                '-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition',
                isActive ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink',
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Navigate to="ledgers" replace />} />
        <Route path="ledgers" element={<LedgersPage />} />
        <Route path="ledgers/:id" element={<LedgerView />} />
        <Route path="vouchers" element={<VouchersPage />} />
        <Route path="daybook" element={<DayBook />} />
        <Route path="cashbook" element={<CashBankBook key="cash" group="cash" />} />
        <Route path="bankbook" element={<CashBankBook key="bank" group="bank" />} />
        <Route path="trial-balance" element={<TrialBalancePage />} />
        <Route path="pnl" element={<ProfitLossPage />} />
        <Route path="balance-sheet" element={<BalanceSheetPage />} />
        <Route path="*" element={<Navigate to="ledgers" replace />} />
      </Routes>
    </div>
  );
}
