import { ArrowLeft, BookOpen, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge, Button, Card, EmptyState, ExportButtons, Field, IconButton, Input, Modal, Segmented, Select, Textarea, useConfirm } from '../../components/ui';
import { exportSimpleExcel, exportSimplePdf, statementSection } from '../../export/reports';
import { computeBalances, GROUP_ORDER, GROUPS, ledgerStatement } from '../../lib/accounting';
import { rangeLabel, todayISO, yearRange, type DateRange } from '../../lib/dates';
import { INDIAN_STATES } from '../../lib/defaults';
import { money, parseAmount } from '../../lib/format';
import { GSTIN_RE } from '../../lib/gst';
import type { DrCr, Ledger, LedgerGroup } from '../../lib/types';
import { useData } from '../../store/data';
import { Bal, RangeBar, StatementView } from './shared';

const CREATABLE: LedgerGroup[] = ['cash', 'bank', 'customers', 'suppliers', 'expenses', 'income', 'capital', 'loans', 'fixed_assets', 'current_assets', 'current_liabilities', 'duties_taxes'];

export function LedgerModal({ initial, defaultGroup, onClose }: { initial?: Ledger; defaultGroup?: LedgerGroup; onClose: (id?: string) => void }) {
  const data = useData();
  const [name, setName] = useState(initial?.name ?? '');
  const [group, setGroup] = useState<LedgerGroup>(initial?.group ?? defaultGroup ?? 'customers');
  const [opening, setOpening] = useState(initial?.openingBalance ? String(initial.openingBalance) : '');
  const [openingType, setOpeningType] = useState<DrCr>(initial?.openingType ?? (GROUPS[defaultGroup ?? 'customers'].nature === 'asset' ? 'Dr' : 'Cr'));
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [gstin, setGstin] = useState(initial?.gstin ?? '');
  const [state, setState] = useState(initial?.state ?? data.settings.company.state);
  const nominal = GROUPS[group].nature === 'income' || GROUPS[group].nature === 'expense';
  const party = group === 'customers' || group === 'suppliers';
  const dup = data.ledgers.some((l) => l.id !== initial?.id && l.name.trim().toLowerCase() === name.trim().toLowerCase());
  const badGstin = !!gstin && !GSTIN_RE.test(gstin);

  const save = () => {
    if (!name.trim() || dup || badGstin) return;
    const payload = {
      name: name.trim(),
      group,
      openingBalance: nominal ? 0 : Math.abs(parseAmount(opening)),
      openingType: nominal ? ('Dr' as DrCr) : openingType,
      phone: party ? phone : '',
      email: party ? email : '',
      address: party ? address : '',
      gstin: party ? gstin.toUpperCase() : '',
      state: party ? state : '',
    };
    if (initial) {
      data.updateLedger(initial.id, payload);
      toast.success('Ledger updated');
      onClose(initial.id);
    } else {
      const id = data.addLedger(payload);
      toast.success(`Ledger “${payload.name}” created`);
      onClose(id);
    }
  };

  return (
    <Modal
      open
      onClose={() => onClose()}
      title={initial ? 'Edit ledger' : 'New ledger'}
      footer={
        <>
          <Button onClick={() => onClose()}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!name.trim() || dup || badGstin}>
            {initial ? 'Save' : 'Create ledger'}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Ledger name" className="sm:col-span-2" error={dup && 'A ledger with this name exists'}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HDFC Current A/c, ABC Traders" />
        </Field>
        <Field label="Under group" className="sm:col-span-2">
          <Select
            value={group}
            onChange={(e) => {
              const g = e.target.value as LedgerGroup;
              setGroup(g);
              if (!initial) setOpeningType(GROUPS[g].nature === 'asset' ? 'Dr' : 'Cr');
            }}
          >
            {CREATABLE.map((g) => (
              <option key={g} value={g}>
                {GROUPS[g].label}
              </option>
            ))}
          </Select>
        </Field>
        {!nominal && (
          <>
            <Field label="Opening balance">
              <Input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Opening is">
              <Segmented
                full
                value={openingType}
                onChange={setOpeningType}
                options={[
                  { value: 'Dr', label: 'Dr (they owe / asset)' },
                  { value: 'Cr', label: 'Cr (we owe)' },
                ]}
                size="sm"
              />
            </Field>
          </>
        )}
        {party && (
          <>
            <Field label="Phone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
            </Field>
            <Field label="Email">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            <Field label="GSTIN" error={badGstin && 'Invalid GSTIN'}>
              <Input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} maxLength={15} className="uppercase" placeholder="Optional" />
            </Field>
            <Field label="State">
              <Select value={state} onChange={(e) => setState(e.target.value)}>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
      </form>
    </Modal>
  );
}

export function LedgersPage() {
  const data = useData();
  const { ledgers, entries, currency } = data;
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<{ open: boolean; ledger?: Ledger }>({ open: false });
  const [showAuto, setShowAuto] = useState(true);
  const bal = useMemo(() => computeBalances(ledgers, entries, { to: todayISO() }), [ledgers, entries]);

  const groups = GROUP_ORDER.map((g) => {
    const items = ledgers
      .filter((l) => l.group === g && l.id !== 'sys:suspense' && (showAuto || !l.virtual) && (!q || l.name.toLowerCase().includes(q.toLowerCase())))
      .filter((l) => !l.virtual || Math.abs(bal.get(l.id)?.closing ?? 0) > 0.005 || l.id.startsWith('cat:') || l.id === 'sys:sales')
      .sort((a, b) => a.name.localeCompare(b.name));
    const total = items.reduce((s, l) => s + (bal.get(l.id)?.closing ?? 0), 0);
    return { g, items, total };
  }).filter((x) => x.items.length);
  const suspense = bal.get('sys:suspense')?.closing ?? 0;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ledgers" className="h-10 pl-9" />
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            size="sm"
            value={showAuto ? 'all' : 'mine'}
            onChange={(v) => setShowAuto(v === 'all')}
            options={[
              { value: 'all', label: 'All' },
              { value: 'mine', label: 'Created by me' },
            ]}
          />
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setModal({ open: true })}>
            New ledger
          </Button>
        </div>
      </div>

      {Math.abs(suspense) > 0.005 && (
        <p className="mt-3 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
          {money(Math.abs(suspense), currency)} is in Suspense A/c (entries pointing to a deleted ledger). Edit those entries to fix it.
        </p>
      )}

      {groups.length === 0 ? (
        <Card className="mt-4">
          <EmptyState icon={<BookOpen />} title="No ledgers found" text="Try a different search or create a ledger." />
        </Card>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {groups.map(({ g, items, total }) => (
            <Card key={g} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line bg-surface-2/60 px-4 py-3 sm:px-5">
                <div>
                  <h3 className="text-sm font-semibold">{GROUPS[g].label}</h3>
                  <p className="text-xs text-muted">{items.length} ledger{items.length > 1 ? 's' : ''}</p>
                </div>
                <Bal value={total} className="text-sm font-bold" />
              </div>
              {items.map((l) => (
                <div
                  key={l.id}
                  onClick={() => nav(`/accounts/ledgers/${encodeURIComponent(l.id)}`)}
                  className="group flex cursor-pointer items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 hover:bg-surface-2/60 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      {l.name}
                      {l.virtual && <Badge>Auto</Badge>}
                    </p>
                    {l.gstin && <p className="font-mono text-[11px] text-muted">{l.gstin}</p>}
                  </div>
                  <Bal value={bal.get(l.id)?.closing ?? 0} className="text-sm" />
                  {!l.virtual && (
                    <IconButton
                      label="Edit ledger"
                      className="size-8 opacity-60 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setModal({ open: true, ledger: l });
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </IconButton>
                  )}
                </div>
              ))}
            </Card>
          ))}
        </div>
      )}
      <p className="mt-4 px-1 text-xs text-muted">
        “Auto” ledgers are maintained for you: each category is an expense/income ledger, GST entries post to Input/Output GST, and invoices post to Sales Account.
      </p>
      {modal.open && <LedgerModal initial={modal.ledger} onClose={() => setModal({ open: false })} />}
    </div>
  );
}

export function LedgerView() {
  const { id = '' } = useParams();
  const ledgerId = decodeURIComponent(id);
  const data = useData();
  const { ledgerById, ledgers, entries, settings, currency } = data;
  const confirm = useConfirm();
  const nav = useNavigate();
  const ledger = ledgerById.get(ledgerId);
  const [range, setRange] = useState<DateRange>(() => yearRange(new Date(), 'fy'));
  const [editing, setEditing] = useState(false);
  const st = useMemo(() => ledgerStatement([ledgerId], ledgers, entries, range), [ledgerId, ledgers, entries, range]);

  if (!ledger)
    return (
      <Card>
        <EmptyState
          icon={<BookOpen />}
          title="Ledger not found"
          action={
            <Link to="/accounts/ledgers">
              <Button>Back to ledgers</Button>
            </Link>
          }
        />
      </Card>
    );

  const used =
    entries.some((e) => e.lines.some((l) => l.ledgerId === ledgerId)) || data.transactions.some((t) => t.ledgerId === ledgerId) || data.invoices.some((i) => i.customerLedgerId === ledgerId);

  const remove = async () => {
    if (used) return toast.error('This ledger has entries. Move or delete them first.');
    const ok = await confirm({ title: `Delete ledger “${ledger.name}”?`, confirmText: 'Delete', danger: true });
    if (!ok) return;
    data.deleteLedger(ledger.id);
    toast.success('Ledger deleted');
    nav('/accounts/ledgers');
  };

  const ctx = { settings, currency, catById: data.catById, subById: data.subById, ledgerById };
  const title = `Ledger: ${ledger.name}`;
  const sub = `${GROUPS[ledger.group].label} · ${rangeLabel(range)}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to="/accounts/ledgers">
          <IconButton label="Back" className="border border-line bg-surface">
            <ArrowLeft className="size-5" />
          </IconButton>
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 truncate text-xl font-bold">
            {ledger.name} {ledger.virtual && <Badge>Auto</Badge>}
          </h2>
          <p className="text-sm text-muted">{GROUPS[ledger.group].label}</p>
        </div>
        <ExportButtons
          compact
          onExcel={() => exportSimpleExcel(ctx, { title, subtitle: sub, fileName: title, sections: [{ ...statementSection(st, currency), sheet: 'Ledger', sum: [4, 5] }] })}
          onPdf={() => exportSimplePdf(ctx, { title, subtitle: sub, fileName: title, sections: [statementSection(st, currency)] })}
        />
        {!ledger.virtual && (
          <>
            <IconButton label="Edit ledger" onClick={() => setEditing(true)} className="border border-line bg-surface">
              <Pencil className="size-4" />
            </IconButton>
            <IconButton label="Delete ledger" onClick={() => void remove()} className="border border-line bg-surface hover:text-expense">
              <Trash2 className="size-4" />
            </IconButton>
          </>
        )}
      </div>
      <RangeBar value={range} onChange={setRange} />
      <Card className="mt-4 overflow-hidden">
        <StatementView st={st} />
      </Card>
      {editing && <LedgerModal initial={ledger} onClose={() => setEditing(false)} />}
    </div>
  );
}
