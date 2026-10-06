import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Layout } from './components/Layout';
import { ConfirmProvider, PageSkeleton, Spinner } from './components/ui';
import { AuthProvider, useAuth } from './store/auth';
import { DataProvider, useData } from './store/data';
import { ThemeProvider, useTheme } from './store/theme';
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const AddEntry = lazy(() => import('./pages/AddEntry'));
const Daily = lazy(() => import('./pages/Daily'));
const Reports = lazy(() => import('./pages/Reports'));
const Categories = lazy(() => import('./pages/Categories'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Gst = lazy(() => import('./pages/Gst'));
const Invoices = lazy(() => import('./pages/Invoices'));
const InvoiceEditor = lazy(() => import('./pages/InvoiceEditor'));
const Accounts = lazy(() => import('./pages/accounts/Accounts'));

function Ready({ children }: { children: ReactNode }) {
  const { ready } = useData();
  return ready ? <>{children}</> : <PageSkeleton />;
}

function Shell() {
  return (
    <DataProvider>
      <ConfirmProvider>
        <BrowserRouter>
          <Layout>
            <Suspense fallback={<PageSkeleton />}>
              <Ready>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/add" element={<AddEntry />} />
                  <Route path="/daily" element={<Daily />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/categories" element={<Categories />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/gst" element={<Gst />} />
                  <Route path="/invoices" element={<Invoices />} />
                  <Route path="/invoices/new" element={<InvoiceEditor />} />
                  <Route path="/invoices/:id" element={<InvoiceEditor />} />
                  <Route path="/accounts/*" element={<Accounts />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Ready>
            </Suspense>
          </Layout>
        </BrowserRouter>
      </ConfirmProvider>
    </DataProvider>
  );
}

function Gate() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-7" />
      </div>
    );
  return user ? <Shell key={user.uid} /> : <Login />;
}

function Toasts() {
  const { dark } = useTheme();
  return <Toaster position="top-center" richColors closeButton theme={dark ? 'dark' : 'light'} toastOptions={{ duration: 3500 }} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Gate />
        <Toasts />
      </AuthProvider>
    </ThemeProvider>
  );
}
