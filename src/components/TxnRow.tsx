import { Copy, Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { todayISO } from '../lib/dates';
import { colorVar } from '../lib/defaults';
import { fmtDate } from '../lib/format';
import type { Transaction } from '../lib/types';
import { useData } from '../store/data';
import { EntryForm } from './EntryForm';
import { Badge, cn, IconButton, Menu, MenuItem, Modal, Money, useConfirm } from './ui';

const MODE_LABEL = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank' } as const;

export function TxnRow({
  t,
  compact,
  showDate,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  t: Transaction;
  compact?: boolean;
  showDate?: boolean;
  onEdit?: (t: Transaction) => void;
  onDuplicate?: (t: Transaction) => void;
  onDelete?: (t: Transaction) => void;
}) {
  const { catById, subById, ledgerById } = useData();
  const cat = catById.get(t.categoryId);
  const sub = t.subcategoryId ? subById.get(t.subcategoryId) : undefined;
  const ledger = ledgerById.get(t.ledgerId);
  const initial = (cat?.name ?? '?')[0]?.toUpperCase();
  const clickable = !!onEdit;

  return (
    <div
      className={cn(
        'group flex items-center gap-3 border-b border-line px-4 last:border-b-0 sm:px-5',
        compact ? 'py-2.5' : 'py-3',
        clickable && 'cursor-pointer transition hover:bg-surface-2/60',
      )}
      onClick={clickable ? () => onEdit!(t) : undefined}
    >
      <div
        className={cn('flex shrink-0 items-center justify-center rounded-xl font-bold text-white', compact ? 'size-8 text-xs' : 'size-10 text-sm')}
        style={{ background: colorVar(cat?.color) }}
        aria-hidden
      >
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn('truncate font-semibold text-ink', compact ? 'text-[13px]' : 'text-sm')}>
          {cat?.name ?? 'Uncategorised'}
          {sub && <span className="font-normal text-muted"> › {sub.name}</span>}
        </p>
        {!compact && (
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
            {t.gstEnabled ? <Badge tone="info" className="h-5 shrink-0 px-1.5">GST {t.gstRate}%</Badge> : null}
            <span className="truncate">
              {[
                showDate ? fmtDate(t.date, 'dd MMM') : '',
                MODE_LABEL[t.paymentMode],
                ledger && ledger.group !== 'cash' && ledger.name !== 'Bank Account' ? ledger.name : '',
                t.notes,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        )}
        {compact && t.notes && <p className="truncate text-xs text-muted">{t.notes}</p>}
      </div>
      <Money value={t.amount} type={t.type} signed className={cn('font-semibold', compact ? 'text-[13px]' : 'text-[15px]')} />
      {(onEdit || onDelete) && !compact && (
        <div onClick={(e) => e.stopPropagation()}>
          <Menu
            trigger={(p) => (
              <IconButton label="Entry actions" {...p} className="-mr-2 size-9">
                <Ellipsis className="size-4" />
              </IconButton>
            )}
          >
            {(close) => (
              <>
                {onEdit && (
                  <MenuItem icon={<Pencil />} onClick={() => (close(), onEdit(t))}>
                    Edit
                  </MenuItem>
                )}
                {onDuplicate && (
                  <MenuItem icon={<Copy />} onClick={() => (close(), onDuplicate(t))}>
                    Duplicate to today
                  </MenuItem>
                )}
                {onDelete && (
                  <MenuItem icon={<Trash2 />} danger onClick={() => (close(), onDelete(t))}>
                    Delete
                  </MenuItem>
                )}
              </>
            )}
          </Menu>
        </div>
      )}
    </div>
  );
}

/** A list of entries with edit / duplicate / delete wired up. */
export function TxnList({ items, showDate, compact, limit }: { items: Transaction[]; showDate?: boolean; compact?: boolean; limit?: number }) {
  const data = useData();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [shown, setShown] = useState(limit ?? 50);

  const remove = async (t: Transaction) => {
    const ok = await confirm({
      title: 'Delete this entry?',
      message: 'It will be removed from all reports and ledgers.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    data.deleteTransaction(t.id);
    toast.success('Entry deleted', { action: { label: 'Undo', onClick: () => data.restoreTransaction(t) } });
  };

  const duplicate = (t: Transaction) => {
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = t;
    const nid = data.addTransaction({ ...rest, date: todayISO() });
    toast.success('Duplicated to today', { action: { label: 'Undo', onClick: () => data.deleteTransaction(nid) } });
  };

  return (
    <>
      {items.slice(0, shown).map((t) => (
        <TxnRow key={t.id} t={t} showDate={showDate} compact={compact} onEdit={setEditing} onDuplicate={duplicate} onDelete={remove} />
      ))}
      {items.length > shown && (
        <button
          type="button"
          onClick={() => setShown((s) => s + 100)}
          className="w-full border-t border-line py-3 text-sm font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          Show more ({items.length - shown} more)
        </button>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit entry" size="lg">
        {editing && <EntryForm key={editing.id} initial={editing} autoFocus={false} inModal onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}
