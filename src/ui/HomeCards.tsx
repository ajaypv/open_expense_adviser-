import { useLiveQuery } from 'dexie-react-hooks'
import { backUpNow } from '../data/backupNow'
import { backupNudge, getLastBackup, getSnoozedUntil, snoozeBackupNudge } from '../data/backupState'
import type { useLedger } from '../data/useLedger'
import { formatMoney, localDateString, parseLocalDate } from '../db/money'
import { applyRecurring, skipRecurring, type Applied } from '../db/recurringOps'
import { dueRules, occurrencesDue } from '../insights/recurring'
import { Icon } from './Icon'
import { useToast } from './toast'

type Ledger = ReturnType<typeof useLedger>

const cardBase = 'rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--ring)]'

/** "You haven't backed up in a while", with one tap to do it. Quiet until there is enough data to lose. */
export function BackupNudge({ transactionCount }: { transactionCount: number }) {
  const toast = useToast()
  const state = useLiveQuery(async () => ({ last: await getLastBackup(), snoozed: await getSnoozedUntil() }), [])
  if (!state) return null
  const nudge = backupNudge({ transactionCount, lastBackup: state.last, snoozedUntil: state.snoozed })
  if (!nudge) return null

  async function backUp() {
    const result = await backUpNow()
    if (result !== 'cancelled') toast({ message: result === 'shared' ? 'Backup shared' : 'Backup saved to your downloads' })
  }

  return (
    <section aria-label="Backup reminder" className={`${cardBase} mt-3 flex items-start gap-3`}>
      <span aria-hidden="true" className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2">
        <Icon name="download" size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {nudge.daysSince === null ? 'Back up your data' : `Last backup was ${nudge.daysSince} days ago`}
        </p>
        <p className="text-sm text-ink-2">Your transactions live only on this device. A backup takes a few seconds.</p>
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={() => void backUp()} className="min-h-11 rounded-full bg-btn px-4 text-sm font-semibold text-btn-ink">
            Back up now
          </button>
          <button type="button" onClick={() => void snoozeBackupNudge()} className="min-h-11 rounded-full px-3 text-sm font-medium">
            Later
          </button>
        </div>
      </div>
    </section>
  )
}

let shortDate: Intl.DateTimeFormat | undefined

/** Recurring transactions that have come due, each added with one tap. */
export function DueCard({ ledger, today }: { ledger: Ledger; today: Date }) {
  const toast = useToast()
  const todayKey = localDateString(today)
  const due = dueRules(ledger.recurring, todayKey)
  if (due.length === 0) return null

  const total = due.reduce((n, r) => n + occurrencesDue(r, todayKey).length, 0)

  async function addOne(rule: (typeof due)[number]) {
    const applied = await applyRecurring(rule, todayKey)
    toast({ message: `Added ${rule.merchant || 'recurring'}`, actionLabel: 'Undo', onAction: () => void applied.undo() })
  }

  async function skip(rule: (typeof due)[number]) {
    const undo = await skipRecurring(rule)
    toast({ message: 'Skipped', actionLabel: 'Undo', onAction: () => void undo() })
  }

  async function addAll() {
    const all: Applied[] = []
    for (const rule of due) all.push(await applyRecurring(rule, todayKey, true))
    const count = all.reduce((n, a) => n + a.ids.length, 0)
    toast({
      message: `Added ${count} recurring transaction${count === 1 ? '' : 's'}`,
      actionLabel: 'Undo',
      onAction: () => void Promise.all(all.map((a) => a.undo())),
    })
  }

  return (
    <section aria-label="Due now" className={`${cardBase} mt-3`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Icon name="repeat" size={18} />
          Due now
        </h2>
        {total > 1 && (
          <button type="button" onClick={() => void addAll()} className="min-h-11 rounded-full bg-btn px-4 text-sm font-semibold text-btn-ink">
            Add all {total}
          </button>
        )}
      </div>
      <ul className="mt-1 divide-y divide-line">
        {due.map((r) => {
          const missed = occurrencesDue(r, todayKey).length
          const name = r.merchant || ledger.categoryById.get(r.categoryId)?.name || (r.kind === 'income' ? 'Income' : 'Expense')
          const when = (shortDate ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })).format(parseLocalDate(r.nextDue))
          return (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{name}</p>
                <p className="text-sm text-ink-2">
                  {r.kind === 'income' ? '+' : ''}
                  {formatMoney(r.amountMinor, r.currency)}, due {when}
                  {missed > 1 ? ` (${missed} due)` : ''}
                </p>
              </div>
              <button type="button" onClick={() => void skip(r)} className="min-h-11 shrink-0 rounded-full px-3 text-sm font-medium">
                Skip
              </button>
              <button type="button" onClick={() => void addOne(r)} className="min-h-11 shrink-0 rounded-full bg-surface-2 px-4 text-sm font-semibold">
                Add
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Past the reminder time with nothing logged today. Shows even when notifications aren't allowed. */
export function LogNudge({ onAdd }: { onAdd: () => void }) {
  return (
    <section aria-label="Reminder" className={`${cardBase} mt-3 flex items-center gap-3`}>
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2">
        <Icon name="bell" size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">Nothing added today yet</p>
        <p className="text-sm text-ink-2">Type it below, or tap Add.</p>
      </div>
      <button type="button" onClick={onAdd} className="min-h-11 shrink-0 rounded-full bg-btn px-4 text-sm font-semibold text-btn-ink">
        Add
      </button>
    </section>
  )
}
