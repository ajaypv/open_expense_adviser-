import { forSpreadsheet, shareOrDownload, transactionsToCsv } from '../../data/exporters'
import { formatMoney, localDateString } from '../../db/money'
import { emptyTrash, purgeTransaction, restoreTransaction, TRASH_DAYS } from '../../db/repo'
import { db } from '../../db/schema'
import { Icon } from '../../ui/Icon'
import { useToast } from '../../ui/toast'
import { card, Group, type Ledger } from './parts'

const DAY = 86_400_000

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

/** Spreadsheet export and the trash. Backup and restore are at the top of Settings. */
export function DataSection({ ledger }: { ledger: Ledger }) {
  const toast = useToast()
  const empty = ledger.txs.length === 0

  async function exportCsv() {
    const csv = transactionsToCsv(await db.transactions.toArray(), ledger.categoryById, ledger.accountById)
    const result = await shareOrDownload(`expenses-${localDateString()}.csv`, 'text/csv;charset=utf-8', forSpreadsheet(csv))
    if (result !== 'cancelled') toast({ message: result === 'shared' ? 'Export shared' : 'Export saved to your downloads' })
  }

  return (
    <Group
      id="data-h"
      title="Your data"
      hint={`${ledger.txs.length === 1 ? '1 transaction is' : `${ledger.txs.length} transactions are`} stored only on this device. Backup and restore are at the top of Settings.`}
    >
      <ul className={`${card} divide-y divide-line px-4`}>
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
      </ul>

      <TrashList ledger={ledger} />
    </Group>
  )
}
