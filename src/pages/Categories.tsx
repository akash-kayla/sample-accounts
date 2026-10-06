import { Check, Pencil, Plus, Search, Tags, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, cn, EmptyState, Field, IconButton, Input, Modal, PageHeader, Segmented, Select, useConfirm } from '../components/ui';
import { COLOR_NAMES, COLOR_SLOTS, colorVar } from '../lib/defaults';
import type { Category, CategoryType, Subcategory } from '../lib/types';
import { useData } from '../store/data';

type Tab = 'expense' | 'income';

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLOR_SLOTS.map((s) => (
        <button
          key={s}
          type="button"
          aria-label={COLOR_NAMES[s]}
          title={COLOR_NAMES[s]}
          onClick={() => onChange(s)}
          className={cn('flex size-9 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition', value === s && 'ring-2 ring-ink')}
          style={{ background: colorVar(s) }}
        >
          {value === s && <Check className="size-4 text-white" />}
        </button>
      ))}
    </div>
  );
}

function CategoryModal({ open, onClose, initial, defaultType }: { open: boolean; onClose: () => void; initial?: Category; defaultType: Tab }) {
  const data = useData();
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<CategoryType>(initial?.type ?? defaultType);
  const used = new Set(data.categories.map((c) => c.color));
  const [color, setColor] = useState(initial?.color ?? COLOR_SLOTS.find((s) => s !== 'c0' && !used.has(s)) ?? 'c1');
  const [subsText, setSubsText] = useState('');
  const dup = data.categories.some((c) => c.id !== initial?.id && c.name.trim().toLowerCase() === name.trim().toLowerCase());

  const save = () => {
    if (!name.trim() || dup) return;
    if (initial) {
      data.updateCategory(initial.id, { name: name.trim(), type, color });
      toast.success('Category updated');
    } else {
      const id = data.addCategory({ name: name.trim(), type, color });
      subsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => data.addSubcategory(id, s));
      toast.success(`Category “${name.trim()}” added`);
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit category' : 'New category'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!name.trim() || dup}>
            {initial ? 'Save changes' : 'Add category'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Name" error={dup && 'A category with this name already exists'}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Office Supplies" />
        </Field>
        <Field label="Used for">
          <Segmented
            full
            value={type}
            onChange={setType}
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
              { value: 'both', label: 'Both' },
            ]}
          />
        </Field>
        <Field label="Colour" hint="Used in charts and lists">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        {!initial && (
          <Field label="Sub-categories (optional)" hint="Separate with commas, e.g. Pens, Paper, Printer ink">
            <Input value={subsText} onChange={(e) => setSubsText(e.target.value)} placeholder="Comma separated" />
          </Field>
        )}
      </form>
    </Modal>
  );
}

function DeleteCategoryModal({ cat, onClose }: { cat: Category | null; onClose: () => void }) {
  const data = useData();
  const count = cat ? data.transactions.filter((t) => t.categoryId === cat.id).length : 0;
  const targets = cat ? data.categories.filter((c) => c.id !== cat.id && (cat.type === 'both' || c.type === cat.type || c.type === 'both')) : [];
  const [moveTo, setMoveTo] = useState('');
  const target = moveTo || targets[0]?.id || '';
  if (!cat) return null;
  const run = async () => {
    try {
      await data.deleteCategory(cat.id, count ? target : undefined);
      toast.success(`Deleted “${cat.name}”${count ? ` and moved ${count} entries` : ''}`);
      onClose();
    } catch {
      toast.error('Could not delete this category');
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Delete “${cat.name}”?`}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={run} disabled={count > 0 && !target}>
            Delete
          </Button>
        </>
      }
    >
      {count ? (
        <div className="space-y-3 text-sm text-ink-2">
          <p>
            <strong className="text-ink">{count} entries</strong> use this category. Choose where to move them:
          </p>
          <Select value={target} onChange={(e) => setMoveTo(e.target.value)}>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted">Its sub-categories will be removed too.</p>
        </div>
      ) : (
        <p className="text-sm text-ink-2">This category and its sub-categories will be removed. No entries use it.</p>
      )}
    </Modal>
  );
}

function SubChip({ sub, count }: { sub: Subcategory; count: number }) {
  const data = useData();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(sub.name);
  if (editing)
    return (
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) data.updateSubcategory(sub.id, { name: name.trim() });
          setEditing(false);
        }}
      >
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-36 rounded-full px-3 text-sm" onBlur={() => setEditing(false)} />
      </form>
    );
  return (
    <span className="group inline-flex h-8 items-center gap-1 rounded-full border border-line bg-surface pl-3 pr-1 text-sm text-ink">
      <button type="button" onClick={() => setEditing(true)} className="hover:underline" title="Rename">
        {sub.name}
      </button>
      {count > 0 && <span className="text-[11px] text-muted">{count}</span>}
      <button
        type="button"
        aria-label={`Delete ${sub.name}`}
        className="flex size-6 items-center justify-center rounded-full text-muted hover:bg-expense-soft hover:text-expense"
        onClick={async () => {
          const ok = await confirm({
            title: `Delete “${sub.name}”?`,
            message: count ? `${count} entries will keep their category but lose this sub-category.` : 'This sub-category will be removed.',
            confirmText: 'Delete',
            danger: true,
          });
          if (ok) {
            await data.deleteSubcategory(sub.id);
            toast.success('Sub-category deleted');
          }
        }}
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

function AddSub({ categoryId }: { categoryId: string }) {
  const data = useData();
  const [v, setV] = useState<string | null>(null);
  if (v === null)
    return (
      <button
        type="button"
        onClick={() => setV('')}
        className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-line-strong px-3 text-sm font-medium text-ink-2 hover:border-ink hover:text-ink"
      >
        <Plus className="size-3.5" /> Add
      </button>
    );
  const add = () => {
    const name = v.trim();
    if (name) {
      data.addSubcategory(categoryId, name);
      toast.success(`Added “${name}”`);
    }
    setV(null);
  };
  return (
    <form
      className="inline-flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <Input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="Sub-category" className="h-8 w-36 rounded-full px-3 text-sm" onKeyDown={(e) => e.key === 'Escape' && setV(null)} />
      <IconButton label="Add" type="submit" className="size-8 bg-brand text-brand-ink hover:bg-brand-strong">
        <Check className="size-4" />
      </IconButton>
    </form>
  );
}

export default function Categories() {
  const data = useData();
  const [tab, setTab] = useState<Tab>('expense');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<{ open: boolean; cat?: Category }>({ open: false });
  const [deleting, setDeleting] = useState<Category | null>(null);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const t of data.transactions) {
      c.set(t.categoryId, (c.get(t.categoryId) ?? 0) + 1);
      if (t.subcategoryId) c.set(t.subcategoryId, (c.get(t.subcategoryId) ?? 0) + 1);
    }
    return c;
  }, [data.transactions]);

  const list = data.categories.filter(
    (c) =>
      (c.type === tab || c.type === 'both') &&
      (!q ||
        c.name.toLowerCase().includes(q.toLowerCase()) ||
        data.subcategories.some((s) => s.categoryId === c.id && s.name.toLowerCase().includes(q.toLowerCase()))),
  );

  return (
    <div>
      <PageHeader
        title="Categories"
        subtitle="Organise how you group expenses and income."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setModal({ open: true })}>
            New category
          </Button>
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'expense', label: `Expense (${data.categories.filter((c) => c.type !== 'income').length})` },
            { value: 'income', label: `Income (${data.categories.filter((c) => c.type !== 'expense').length})` },
          ]}
        />
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search categories" className="h-10 pl-9" />
        </div>
      </div>

      {list.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            icon={<Tags />}
            title={q ? 'No matching categories' : 'No categories yet'}
            text={q ? 'Try a different search.' : 'Create categories to organise your entries.'}
            action={
              !q && (
                <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setModal({ open: true })}>
                  New category
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {list.map((c) => {
            const subs = data.subcategories.filter((s) => s.categoryId === c.id);
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: colorVar(c.color) }}>
                    {c.name[0]?.toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-ink">{c.name}</h3>
                      {c.type === 'both' && <Badge>Income & expense</Badge>}
                    </div>
                    <p className="text-xs text-muted">
                      {counts.get(c.id) ?? 0} entries · {subs.length} sub-categories
                    </p>
                  </div>
                  <IconButton label="Edit category" onClick={() => setModal({ open: true, cat: c })}>
                    <Pencil className="size-4" />
                  </IconButton>
                  <IconButton label="Delete category" onClick={() => setDeleting(c)} className="hover:bg-expense-soft hover:text-expense">
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {subs.map((s) => (
                    <SubChip key={s.id} sub={s} count={counts.get(s.id) ?? 0} />
                  ))}
                  <AddSub categoryId={c.id} />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {modal.open && <CategoryModal open onClose={() => setModal({ open: false })} initial={modal.cat} defaultType={tab} />}
      <DeleteCategoryModal key={deleting?.id} cat={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}
