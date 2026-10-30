import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { describeAge, getLastBackup } from '../../data/backupState'
import { backUpNow } from '../../data/backupNow'
import { forSpreadsheet, shareOrDownload, transactionsToCsv } from '../../data/exporters'
import type { Backup, ImportSummary } from '../../data/importBackup'
import { formatMoney, localDateString } from '../../db/money'
import { emptyTrash, purgeTransaction, restoreTransaction, TRASH_DAYS } from '../../db/repo'
import { db } from '../../db/schema'
import { Icon } from '../../ui/Icon'
import { useToast } from '../../ui/toast'
import { card, Group, secondaryButton, type Ledger } from './parts'

const DAY = 86_400_000
const MAX_BACKUP_BYTES = 25 * 1024 * 1024

function TrashList({ ledger }: { ledger: Ledger }) {
  const toast = useToast()
  const { trash, categoryById } = ledger
  const now = Date.now()

  return (
    <details className={`${card} group mt-3`}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block font-medium">Recently deleted</span>
          <span className="block text-sm text-ink-2">
            {trash.length === 0 ? 'Nothing here' : `${trash.length} kept for ${TRASH_DAYS} days`}
          </span>
        </span>
        <span className="text-sm font-medium underline underline-offset-2 group-open:hidden">View</span>
        <span className="hidden text-sm font-medium underline underline-offset-2 group-open:inline">Close</span>
      </summary>
      {trash.length > 0 && (
        <div className="border-t border-line">
          <ul className="divide-y divide-line">
            {trash.slice(0, 100).map((t) => {
              const title = t.merchant || categoryById.get(t.categoryId)?.name || (t.kind === 'income' ? 'Income' : 'Expense')
              const left = Math.max(0, TRASH_DAYS - Math.floor((now - (t.deletedAt ?? now)) / DAY))
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{title}</span>
                    <span className="block text-sm text-ink-2">
                      {formatMoney(t.amountMinor, t.currency)}, {t.date}. {left} {left === 1 ? 'day' : 'days'} left
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      void restoreTransaction(t)
                      toast({ message: 'Restored' })
                    }}
                    className="min-h-11 shrink-0 rounded-full bg-surface-2 px-3.5 text-sm font-medium"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => void purgeTransaction(t.id)}
                    aria-label={`Delete ${title} for good`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full text-critical"
                  >
                    <Icon name="trash" size={20} />
                  </button>
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm(`Delete ${trash.length} transaction${trash.length === 1 ? '' : 's'} for good? This can’t be undone.`)) return
              toast({ message: `Deleted ${await emptyTrash()} for good` })
            }}
            className="min-h-12 w-full border-t border-line font-medium text-critical"
          >
            Empty the trash
          </button>
        </div>
      )}
    </details>
  )
}

/** Backups, restore, spreadsheet export and the trash. */
export function DataSection({ ledger }: { ledger: Ledger }) {
  const toast = useToast()
  const picker = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ name: string; backup: Backup; summary: ImportSummary } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const last = useLiveQuery(getLastBackup, [])
  const empty = ledger.txs.length === 0

  async function backUp() {
    const result = await backUpNow()
    if (result === 'cancelled') return
    toast({ message: result === 'shared' ? 'Backup shared' : 'Backup saved to your downloads' })
  }

  async function exportCsv() {
    const csv = transactionsToCsv(await db.transactions.toArray(), ledger.categoryById, ledger.accountById)
    const result = await shareOrDownload(`expenses-${localDateString()}.csv`, 'text/csv;charset=utf-8', forSpreadsheet(csv))
    if (result !== 'cancelled') toast({ message: result === 'shared' ? 'Export shared' : 'Export saved to your downloads' })
  }

  async function choose(file: File | undefined) {
    setError(null)
    setPending(null)
    if (!file) return
    if (file.size > MAX_BACKUP_BYTES) {
      setError('That file is too large to be a backup.')
      return
    }
    // Loaded on demand: the validation library is only needed here, so it stays out of the main bundle.
    const { parseBackup, summarizeImport } = await import('../../data/importBackup')
    const parsed = parseBackup(await file.text())
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setPending({ name: file.name, backup: parsed.backup, summary: await summarizeImport(parsed.backup) })
  }

  async function restore(mode: 'merge' | 'replace') {
    if (!pending) return
    if (mode === 'replace' && !window.confirm('Replace everything in the app with this backup? Your current transactions will be removed.')) return
    setBusy(true)
    try {
      const { importBackup } = await import('../../data/importBackup')
      const { added, skipped } = await importBackup(pending.backup, mode)
      toast({ message: `Restored ${added} transaction${added === 1 ? '' : 's'}${skipped ? `, ${skipped} already here` : ''}` })
      setPending(null)
    } catch {
      setError('Something went wrong while restoring. Nothing was changed.')
    } finally {
      setBusy(false)
      if (picker.current) picker.current.value = ''
    }
  }

  return (
    <Group
      id="data-h"
      title="Your data"
      hint={`${ledger.txs.length === 1 ? '1 transaction is' : `${ledger.txs.length} transactions are`} stored only on this device. Back up now and then, because clearing browser data erases it.`}
    >
      <ul className={`${card} divide-y divide-line px-4`}>
        <li>
          <button type="button" onClick={() => void backUp()} disabled={empty} className="flex min-h-16 w-full items-center gap-3 py-2 text-left disabled:opacity-40">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2">
              <Icon name="download" size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Back up everything</span>
              <span className="block text-sm text-ink-2">
                {last === undefined ? ' ' : last === null ? 'Never backed up' : `Last backup ${describeAge(last)}`}
              </span>
            </span>
          </button>
        </li>
        <li>
          <button type="button" onClick={() => void exportCsv()} disabled={empty} className="flex min-h-16 w-full items-center gap-3 py-2 text-left disabled:opacity-40">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2">
              <Icon name="download" size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Export transactions</span>
              <span className="block text-sm text-ink-2">CSV file for a spreadsheet</span>
            </span>
          </button>
        </li>
        <li>
          <button type="button" onClick={() => picker.current?.click()} className="flex min-h-16 w-full items-center gap-3 py-2 text-left">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2">
              <Icon name="undo" size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Restore from a backup</span>
              <span className="block text-sm text-ink-2">Choose a backup file you saved earlier</span>
            </span>
          </button>
          <input
            ref={picker}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-label="Backup file"
            onChange={(e) => void choose(e.target.files?.[0])}
          />
        </li>
      </ul>

      {error && (
        <p role="alert" className="mt-3 rounded-2xl bg-surface px-4 py-3 text-critical shadow-[0_0_0_1px_var(--ring)]">
          {error}
        </p>
      )}

      {pending && (
        <div className={`${card} mt-3 p-4`}>
          <p className="font-medium">{pending.name}</p>
          <p className="mt-1 text-ink-2">
            {pending.summary.total} transaction{pending.summary.total === 1 ? '' : 's'} in this file,{' '}
            {pending.summary.newCount === 0 ? 'none of them new' : `${pending.summary.newCount} new`}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void restore('merge')} className="min-h-12 rounded-full bg-btn px-5 font-semibold text-btn-ink disabled:opacity-50">
              Add what’s missing
            </button>
            <button type="button" disabled={busy} onClick={() => void restore('replace')} className={secondaryButton}>
              Replace everything
            </button>
            <button type="button" disabled={busy} onClick={() => setPending(null)} className="min-h-12 rounded-full px-4 font-medium">
              Cancel
            </button>
          </div>
          <p className="mt-2 text-sm text-ink-2">“Add what’s missing” keeps what you have and skips anything already here.</p>
        </div>
      )}

      <TrashList ledger={ledger} />
    </Group>
  )
}
