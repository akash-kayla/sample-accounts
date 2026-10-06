import { sendPasswordResetEmail } from 'firebase/auth';
import { Building2, Download, ImageUp, KeyRound, Landmark, LogOut, Palette, Plus, ReceiptText, RotateCcw, Save, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button, Card, cn, Field, Input, PageHeader, Segmented, Select, Textarea } from '../components/ui';
import { downloadBlob, toPng } from '../export/common';
import { exportTxnExcel } from '../export/reports';
import { CURRENCIES, DEFAULT_COMPANY, INDIAN_STATES } from '../lib/defaults';
import { auth } from '../lib/firebase';
import { GSTIN_RE } from '../lib/gst';
import { nextInvoiceNumber } from '../lib/invoice';
import { todayISO } from '../lib/dates';
import type { CompanyProfile } from '../lib/types';
import { useAuth } from '../store/auth';
import { useData } from '../store/data';
import { useTheme } from '../store/theme';

function Section({ icon, title, desc, children }: { icon: ReactNode; title: string; desc?: string; children: ReactNode }) {
  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink [&>svg]:size-5">{icon}</span>
        <div>
          <h2 className="font-semibold text-ink">{title}</h2>
          {desc && <p className="text-sm text-muted">{desc}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

export default function SettingsPage() {
  const data = useData();
  const { settings, updateSettings } = data;
  const { user, logout } = useAuth();
  const { mode, setMode } = useTheme();
  const [co, setCo] = useState<CompanyProfile>(settings.company);
  const [inv, setInv] = useState({
    invoicePrefix: settings.invoicePrefix,
    invoiceNotes: settings.invoiceNotes,
    invoiceTerms: settings.invoiceTerms,
    defaultGstRate: settings.defaultGstRate,
  });
  const [newRate, setNewRate] = useState('');

  useEffect(() => setCo(settings.company), [settings.company]);

  const dirty = useMemo(
    () =>
      JSON.stringify(co) !== JSON.stringify(settings.company) ||
      inv.invoicePrefix !== settings.invoicePrefix ||
      inv.invoiceNotes !== settings.invoiceNotes ||
      inv.invoiceTerms !== settings.invoiceTerms ||
      inv.defaultGstRate !== settings.defaultGstRate,
    [co, inv, settings],
  );

  const set = <K extends keyof CompanyProfile>(k: K) => (e: { target: { value: string } }) => setCo((c) => ({ ...c, [k]: e.target.value }));
  const gstinBad = !!co.gstin && !GSTIN_RE.test(co.gstin);

  const save = () => {
    if (!co.name.trim()) return toast.error('Company name is required');
    updateSettings({ company: { ...co, gstin: co.gstin.toUpperCase().trim(), pan: co.pan.toUpperCase().trim() }, ...inv });
    toast.success('Settings saved');
  };

  const onLogo = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Please choose an image file');
    try {
      const url = URL.createObjectURL(file);
      const png = await toPng(url, 600);
      URL.revokeObjectURL(url);
      if (png.dataUrl.length > 700_000) return toast.error('Logo is too large. Use an image under ~400 KB.');
      setCo((c) => ({ ...c, logo: png.dataUrl }));
      toast.success('Logo ready — remember to save');
    } catch {
      toast.error('Could not read that image');
    }
  };

  const backup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'bananads-books',
      settings: data.settings,
      categories: data.categories,
      subcategories: data.subcategories,
      ledgers: data.storedLedgers,
      transactions: data.transactions,
      vouchers: data.vouchers,
      invoices: data.invoices,
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `bananads-books-backup-${todayISO()}.json`);
    toast.success('Backup downloaded');
  };

  const exportAll = async () => {
    const id = toast.loading('Preparing Excel…');
    try {
      await exportTxnExcel(
        { settings, currency: data.currency, catById: data.catById, subById: data.subById, ledgerById: data.ledgerById },
        data.transactions,
        'All Transactions',
        `Up to ${todayISO()}`,
      );
      toast.success('Excel downloaded', { id });
    } catch {
      toast.error('Export failed', { id });
    }
  };

  const resetPw = async () => {
    if (!user?.email) return;
    try {
      await sendPasswordResetEmail(auth, user.email);
      toast.success(`Password reset link sent to ${user.email}`);
    } catch {
      toast.error('Could not send the reset email');
    }
  };

  const rates = settings.gstRates;

  return (
    <div className="pb-20">
      <PageHeader title="Settings" subtitle="Company details, invoices, GST and preferences." />
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <Section icon={<Building2 />} title="Company profile" desc="Shown on invoices and PDF/Excel reports.">
            <div className="mb-5 flex flex-wrap items-center gap-4">
              <div className="flex h-20 w-48 items-center justify-center rounded-xl border border-line bg-white p-3">
                <img src={co.logo || '/logo.png'} alt="Logo" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="inline-flex">
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => void onLogo(e.target.files?.[0])} />
                  <span className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-semibold hover:bg-surface-2">
                    <ImageUp className="size-4" /> Upload logo
                  </span>
                </label>
                {co.logo && (
                  <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setCo((c) => ({ ...c, logo: '' }))}>
                    Use Bananads logo
                  </Button>
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company name" className="sm:col-span-2">
                <Input value={co.name} onChange={set('name')} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Input value={co.address} onChange={set('address')} />
              </Field>
              <Field label="City">
                <Input value={co.city} onChange={set('city')} />
              </Field>
              <Field label="PIN code">
                <Input value={co.pincode} onChange={set('pincode')} inputMode="numeric" />
              </Field>
              <Field label="State" hint="Decides CGST+SGST vs IGST">
                <Select value={co.state} onChange={set('state')}>
                  {INDIAN_STATES.map((s) => (
                    <option key={s.code} value={s.name}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Country">
                <Input value={co.country} onChange={set('country')} />
              </Field>
              <Field label="Phone">
                <Input value={co.phone} onChange={set('phone')} inputMode="tel" />
              </Field>
              <Field label="Email">
                <Input value={co.email} onChange={set('email')} type="email" placeholder="accounts@company.com" />
              </Field>
              <Field label="Website">
                <Input value={co.website} onChange={set('website')} placeholder="www.bananads.com" />
              </Field>
              <Field label="Authorised signatory">
                <Input value={co.signatory} onChange={set('signatory')} placeholder="Name on invoices" />
              </Field>
              <Field label="GSTIN" error={gstinBad && 'GSTIN should be 15 characters, e.g. 32ABCDE1234F1Z5'}>
                <Input value={co.gstin} onChange={(e) => setCo((c) => ({ ...c, gstin: e.target.value.toUpperCase() }))} maxLength={15} className="uppercase" placeholder="32XXXXX0000X1Z5" />
              </Field>
              <Field label="PAN">
                <Input value={co.pan} onChange={(e) => setCo((c) => ({ ...c, pan: e.target.value.toUpperCase() }))} maxLength={10} className="uppercase" />
              </Field>
            </div>
            {JSON.stringify(co) !== JSON.stringify({ ...DEFAULT_COMPANY, logo: co.logo }) && (
              <button type="button" onClick={() => setCo({ ...DEFAULT_COMPANY, logo: co.logo })} className="mt-3 text-xs font-semibold text-muted hover:text-ink">
                Reset to Bananads defaults
              </button>
            )}
          </Section>

          <Section icon={<Landmark />} title="Bank & UPI" desc="Printed on invoices so customers can pay you.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Account name">
                <Input value={co.accountName} onChange={set('accountName')} />
              </Field>
              <Field label="Bank name">
                <Input value={co.bankName} onChange={set('bankName')} />
              </Field>
              <Field label="Account number">
                <Input value={co.accountNumber} onChange={set('accountNumber')} inputMode="numeric" />
              </Field>
              <Field label="IFSC">
                <Input value={co.ifsc} onChange={(e) => setCo((c) => ({ ...c, ifsc: e.target.value.toUpperCase() }))} className="uppercase" />
              </Field>
              <Field label="Branch">
                <Input value={co.branch} onChange={set('branch')} />
              </Field>
              <Field label="UPI ID">
                <Input value={co.upiId} onChange={set('upiId')} placeholder="name@bank" />
              </Field>
            </div>
          </Section>
        </div>

        <div className="space-y-4">
          <Section icon={<ReceiptText />} title="Invoices" desc="Defaults for new invoices.">
            <div className="grid gap-4">
              <Field
                label="Invoice number format"
                hint={
                  <>
                    Use {'{FY}'} for financial year, {'{YYYY}'} year, {'{MM}'} month. Next: <strong className="text-ink">{nextInvoiceNumber(data.invoices, inv.invoicePrefix, todayISO())}</strong>
                  </>
                }
              >
                <Input value={inv.invoicePrefix} onChange={(e) => setInv((v) => ({ ...v, invoicePrefix: e.target.value }))} />
              </Field>
              <Field label="Default GST rate on items">
                <Select value={inv.defaultGstRate} onChange={(e) => setInv((v) => ({ ...v, defaultGstRate: Number(e.target.value) }))}>
                  {rates.map((r) => (
                    <option key={r} value={r}>
                      {r}%
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Default notes">
                <Textarea rows={2} value={inv.invoiceNotes} onChange={(e) => setInv((v) => ({ ...v, invoiceNotes: e.target.value }))} />
              </Field>
              <Field label="Default terms & conditions">
                <Textarea rows={3} value={inv.invoiceTerms} onChange={(e) => setInv((v) => ({ ...v, invoiceTerms: e.target.value }))} />
              </Field>
            </div>
          </Section>

          <Section icon={<Palette />} title="Preferences" desc="Applied instantly.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Currency">
                <Select value={settings.currency} onChange={(e) => updateSettings({ currency: e.target.value })}>
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Year for reports">
                <Select value={settings.yearType} onChange={(e) => updateSettings({ yearType: e.target.value as 'fy' | 'calendar' })}>
                  <option value="fy">Financial year (Apr – Mar)</option>
                  <option value="calendar">Calendar year (Jan – Dec)</option>
                </Select>
              </Field>
              <Field label="Theme" className="sm:col-span-2">
                <Segmented
                  full
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                    { value: 'system', label: 'Auto' },
                  ]}
                />
              </Field>
              <Field label="GST rates" className="sm:col-span-2" hint="Shown as quick choices when adding entries and invoice items.">
                <div className="flex flex-wrap items-center gap-2">
                  {rates.map((r) => (
                    <span key={r} className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-surface pl-3.5 pr-1 text-sm font-medium">
                      {r}%
                      <button
                        type="button"
                        aria-label={`Remove ${r}%`}
                        disabled={rates.length <= 1}
                        onClick={() => updateSettings({ gstRates: rates.filter((x) => x !== r) })}
                        className="flex size-7 items-center justify-center rounded-full text-muted hover:bg-expense-soft hover:text-expense disabled:opacity-30"
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  ))}
                  <form
                    className="inline-flex items-center gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const n = parseFloat(newRate);
                      if (!isFinite(n) || n < 0 || n > 100) return toast.error('Enter a rate between 0 and 100');
                      if (!rates.includes(n)) updateSettings({ gstRates: [...rates, n].sort((a, b) => a - b) });
                      setNewRate('');
                    }}
                  >
                    <Input value={newRate} onChange={(e) => setNewRate(e.target.value)} placeholder="Rate %" inputMode="decimal" className="h-9 w-24 rounded-full" />
                    <Button type="submit" size="sm" className="rounded-full" icon={<Plus className="size-3.5" />}>
                      Add
                    </Button>
                  </form>
                </div>
              </Field>
            </div>
          </Section>

          <Section icon={<Download />} title="Your data" desc="Download a copy anytime.">
            <div className="flex flex-wrap gap-2">
              <Button icon={<Download className="size-4" />} onClick={exportAll}>
                All transactions (Excel)
              </Button>
              <Button icon={<Download className="size-4" />} onClick={backup}>
                Full backup (JSON)
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted">
              {data.transactions.length} entries · {data.vouchers.length} vouchers · {data.invoices.length} invoices · {data.storedLedgers.length} ledgers
            </p>
          </Section>

          <Section icon={<KeyRound />} title="Account">
            <p className="text-sm text-ink-2">
              Signed in as <strong className="text-ink">{user?.email}</strong>
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button icon={<KeyRound className="size-4" />} onClick={resetPw}>
                Change password
              </Button>
              <Button variant="ghost" className="text-expense" icon={<LogOut className="size-4" />} onClick={() => void logout()}>
                Sign out
              </Button>
            </div>
          </Section>
        </div>
      </div>

      <div
        className={cn(
          'pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 transition lg:bottom-6 lg:left-64',
          dirty ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        )}
      >
        <div className={cn('flex items-center gap-3 rounded-2xl border border-line bg-surface p-2 pl-4 shadow-2xl', dirty && 'pointer-events-auto')}>
          <span className="text-sm font-medium text-ink-2">Unsaved changes</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setCo(settings.company);
              setInv({ invoicePrefix: settings.invoicePrefix, invoiceNotes: settings.invoiceNotes, invoiceTerms: settings.invoiceTerms, defaultGstRate: settings.defaultGstRate });
            }}
          >
            Discard
          </Button>
          <Button size="sm" variant="primary" icon={<Save className="size-4" />} onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
