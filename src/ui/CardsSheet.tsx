import { useMemo, useState, type FormEvent } from 'react'
import type { LedgerTx } from '../data/buildLedger'
import { useDisplay } from '../data/display'
import type { useLedger } from '../data/useLedger'
import { categoryIdByName, addTransaction, purgeTransaction } from '../db/repo'
import { formatMoney, localDateString, parseLocalDate, toMinor } from '../db/money'
import { cardLog, cardSummaries, isCard, type CardSummary } from '../insights/cards'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { useToast } from './toast'
import { TxRow } from './TxRow'

type Ledger = ReturnType<typeof useLedger>

interface Props {
  open: boolean
  onClose: () => void
  ledger: Ledger
  today: Date
  /** Opens an entry to look at or change it; the sheet closes first. */
  onEdit: (tx: LedgerTx) => void
}

const card = 'rounded-3xl bg-surface-2/60'
const field = 'mt-1 min-h-12 w-full rounded-xl bg-surface shadow-[inset_0_0_0_1px_var(--edge)] px-3.5'
/** How many statements of the log are shown before "Show earlier". */
const SHOWN = 3

let dayFormat: Intl.DateTimeFormat | undefined
const shortDay = (date: string) => (dayFormat ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })).format(parseLocalDate(date))

/** "In 5 days", "Tomorrow", "Today", or how long it is overdue. */
const inDays = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`)

/** What the card owes, and how much of the limit that is: the first thing to know about a card. */
function Standing({ summary, currency }: { summary: CardSummary; currency: string }) {
  const money = (m: number) => formatMoney(m, currency)
  const { owedMinor, limitMinor, availableMinor, usedRatio, due, cycle } = summary
  const percent = usedRatio === null ? 0 : Math.round(usedRatio * 100)
  const over = usedRatio !== null && usedRatio >= 1
  const close = usedRatio !== null && usedRatio >= 0.8 && !over

  return (
    <section aria-label={`${summary.account.name} standing`} className={`${card} mt-4 p-5`}>
      <p className="text-sm text-ink-2">{owedMinor < 0 ? 'In credit' : 'You owe'}</p>
      <p className="mt-0.5 text-[clamp(2rem,10vw,2.5rem)] font-semibold leading-none tracking-tight tabular-nums">{money(Math.abs(owedMinor))}</p>

      {limitMinor !== null && (
        <>
          <span
            role="meter"
            aria-label="Credit limit used"
            aria-valuemin={0}
            aria-valuemax={limitMinor / 100}
            aria-valuenow={Math.min(Math.max(owedMinor, 0), limitMinor) / 100}
            aria-valuetext={`${percent}% of the ${money(limitMinor)} limit used`}
            className="mt-4 block h-2.5 overflow-hidden rounded-full"
            style={{ background: 'color-mix(in oklab, var(--accent) 16%, var(--surface))' }}
          >
            <span
              className="block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${Math.min(100, percent)}%`, background: over ? 'var(--critical)' : close ? 'var(--warn-ui)' : 'var(--accent)' }}
            />
          </span>
          <p className="mt-2 flex items-baseline justify-between gap-3 text-[0.9375rem] tabular-nums">
            <span className="text-ink-2">{`${percent}% of ${money(limitMinor)} limit`}</span>
            <span className={`font-medium ${over ? 'text-critical' : ''}`}>{over ? 'Over the limit' : `${money(availableMinor ?? 0)} available`}</span>
          </p>
        </>
      )}

      <p className={`mt-4 flex items-center gap-2 border-t border-line pt-3 ${due && due.daysAway <= 3 ? 'font-semibold text-critical' : ''}`}>
        {due ? (
          <>
            {due.daysAway <= 3 && <Icon name="warn" size={18} />}
            {`Bill due ${shortDay(due.date)}, ${inDays(due.daysAway)}`}
          </>
        ) : owedMinor > 0 ? (
          <span className="text-ink-2">No due day set. Add one in Settings, under Accounts.</span>
        ) : (
          <>
            <span className="text-good">
              <Icon name="check" size={18} />
            </span>
            Nothing to pay
          </>
        )}
      </p>
      <p className="mt-1 text-[0.9375rem] text-ink-2 tabular-nums">
        {`${summary.account.statementDay ? 'This statement' : 'This month'}, ${shortDay(cycle.from)} to ${shortDay(cycle.to)}: ${money(cycle.chargedMinor)} charged${cycle.paidMinor > 0 ? `, ${money(cycle.paidMinor)} paid` : ''}`}
      </p>
    </section>
  )
}

/** Records a payment of the bill: money moved from a bank or cash account to the card, which takes down what is owed and is not spending. */
function PayBill({ summary, ledger, today, onDone }: { summary: CardSummary; ledger: Ledger; today: Date; onDone: () => void }) {
  const toast = useToast()
  const sources = ledger.accounts.filter((a) => !isCard(a) && !a.archived)
  const [amount, setAmount] = useState('')
  const [from, setFrom] = useState<number | null>(null)
  const [date, setDate] = useState(localDateString(today))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const owed = summary.owedMinor > 0 ? summary.owedMinor : 0
  const fromId = from ?? sources[0]?.id ?? null

  async function pay(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const value = Number((amount.trim() === '' ? String(owed / 100) : amount).replace(/,/g, ''))
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter the amount you paid, like 5000.')
      return
    }
    if (fromId === null) {
      setError('Add a bank or cash account to pay from.')
      return
    }
    setBusy(true)
    try {
      const id = await addTransaction({
        kind: 'transfer', amountMinor: toMinor(value), currency: ledger.currency, categoryId: await categoryIdByName('Other'), merchant: '',
        note: 'Card bill', date, paymentMethod: '', source: 'manual', accountId: fromId, toAccountId: summary.account.id,
      })
      setAmount('')
      setError(null)
      toast({ message: `Paid ${formatMoney(toMinor(value), ledger.currency)} to ${summary.account.name}`, actionLabel: 'Undo', onAction: () => void purgeTransaction(id), icon: 'card' })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save that. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className={`${card} group mt-3`}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 font-medium [&::-webkit-details-marker]:hidden">
        Pay the bill
        <span className="transition-transform duration-200 group-open:rotate-180">
          <Icon name="chevDown" size={18} />
        </span>
      </summary>
      <form onSubmit={(e) => void pay(e)} className="px-5 pb-5">
        <p className="text-sm text-ink-2">Moves money from your account to the card. It takes down what you owe, and is not counted as spending.</p>
        <label htmlFor="pay-amount" className="mt-3 block text-sm text-ink-2">
          Amount ({ledger.currency})
        </label>
        <input id="pay-amount" inputMode="decimal" autoComplete="off" placeholder={owed > 0 ? String(owed / 100) : 'Amount'} value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={error ? true : undefined} className={field} />
        {owed > 0 && <p className="mt-1 text-sm text-ink-2">{`Leave it empty to pay all of ${formatMoney(owed, ledger.currency)}.`}</p>}
        <div className="mt-3 grid grid-cols-1 gap-3 min-[26rem]:grid-cols-2">
          <div>
            <label htmlFor="pay-from" className="text-sm text-ink-2">
              Paid from
            </label>
            <select id="pay-from" value={fromId ?? ''} onChange={(e) => setFrom(Number(e.target.value))} className={field}>
              {sources.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="pay-date" className="text-sm text-ink-2">
              On
            </label>
            <input id="pay-date" type="date" required max={localDateString(today)} value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-critical">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="mt-4 min-h-12 w-full rounded-full bg-btn font-semibold text-btn-ink disabled:opacity-60">
          Record payment
        </button>
      </form>
    </details>
  )
}

/**
 * Credit cards, in a sheet opened from the card on Home: for each card what is owed, how much of the limit that is, when the
 * bill is due and what the statement holds, a way to record paying the bill, and the card's log, a statement at a time with
 * everything charged to it and every payment made. Spending on a card counts as spending the day it is charged; paying the bill
 * only moves money, so it is never counted twice.
 */
export function CardsSheet({ open, onClose, ledger, today, onEdit }: Props) {
  useDisplay() // amounts are masked or regrouped by display settings, so redraw when they change
  const summaries = useMemo(() => cardSummaries(ledger.accounts, ledger.txs, ledger.balances, today), [ledger.accounts, ledger.txs, ledger.balances, today])
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [all, setAll] = useState(false)
  const summary = summaries.find((s) => s.account.id === pickedId) ?? summaries[0]
  const groups = useMemo(() => (summary ? cardLog(summary.account, ledger.txs, ledger.accounts) : []), [summary, ledger.txs, ledger.accounts])
  const shown = all ? groups : groups.slice(0, SHOWN)

  const edit = (tx: LedgerTx) => {
    onClose()
    onEdit(tx)
  }

  return (
    <Dialog open={open} onClose={onClose} labelledBy="cards-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="cards-title" className="min-w-0 text-2xl font-semibold tracking-tight">
          Credit cards
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-surface-2">
          <Icon name="close" />
        </button>
      </div>

      {!summary ? (
        <p className={`${card} mt-4 p-5 text-ink-2`}>No credit cards yet. Add one in Settings, under Money and Accounts.</p>
      ) : (
        <>
          {summaries.length > 1 && (
            <div role="group" aria-label="Choose a card" className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {summaries.map((s) => (
                <button
                  key={s.account.id}
                  type="button"
                  aria-pressed={s.account.id === summary.account.id}
                  onClick={() => {
                    setPickedId(s.account.id)
                    setAll(false)
                  }}
                  className={`min-h-11 shrink-0 rounded-full px-4 font-medium ${s.account.id === summary.account.id ? 'bg-btn text-btn-ink' : 'bg-surface-2'}`}
                >
                  {s.account.name}
                </button>
              ))}
            </div>
          )}

          <Standing summary={summary} currency={ledger.currency} />
          <PayBill key={summary.account.id} summary={summary} ledger={ledger} today={today} onDone={() => {}} />

          <section aria-label={`${summary.account.name} log`} className="mt-6">
            <h3 className="mb-2 px-1 text-lg font-semibold">Log</h3>
            {groups.length === 0 ? (
              <p className={`${card} p-5 text-ink-2`}>Nothing on this card yet. When you add an expense, choose {summary.account.name} under Paid from.</p>
            ) : (
              <>
                {shown.map((g, i) => (
                  <div key={g.key} data-statement={g.key} className="mb-4">
                    <div className="flex items-baseline justify-between gap-3 px-1">
                      <h4 className="font-medium">
                        {i === 0 && g.to >= localDateString(today) ? (summary.account.statementDay ? 'This statement' : 'This month') : `${shortDay(g.from)} to ${shortDay(g.to)}`}
                      </h4>
                      <p className="text-sm tabular-nums text-ink-2">{`${formatMoney(g.chargedMinor, ledger.currency)} charged${g.paidMinor > 0 ? `, ${formatMoney(g.paidMinor, ledger.currency)} paid` : ''}`}</p>
                    </div>
                    <ul className="mt-1 divide-y divide-line overflow-hidden rounded-3xl bg-surface shadow-[0_0_0_1px_var(--ring)]">
                      {g.entries.map((e) => (
                        <li key={e.tx.id} data-entry={e.kind}>
                          <TxRow tx={e.tx} category={ledger.categoryById.get(e.tx.categoryId)} currency={ledger.currency} accountById={ledger.accountById} showDate onClick={edit} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {groups.length > SHOWN && !all && (
                  <button type="button" onClick={() => setAll(true)} className="min-h-12 w-full rounded-full bg-surface-2 font-medium">
                    Show earlier statements
                  </button>
                )}
              </>
            )}
          </section>
        </>
      )}
    </Dialog>
  )
}
