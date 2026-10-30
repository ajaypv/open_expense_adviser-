import { memo, useEffect, useRef, useState, type FormEvent } from 'react'
import type { LedgerTx } from '../data/buildLedger'
import { useDisplay } from '../data/display'
import { attachLocation, clearLocation } from '../data/location'
import { CURRENCIES } from '../db/currencies'
import { INCOME_CATEGORY } from '../db/defaultCategories'
import { localDateString, parseLocalDate, toMinor } from '../db/money'
import {
  addRecurring,
  addTransaction,
  deleteTransaction,
  duplicateTransaction,
  restoreTransaction,
  updateTransaction,
} from '../db/repo'
import { db, type Account, type Category, type Place, type Transaction } from '../db/schema'
import { defaultAccountId } from '../insights/accounts'
import { nextDueAfter } from '../insights/recurring'
import type { Suggestion } from '../insights/suggestions'
import { Icon } from './Icon'
import { SuggestionList } from './SuggestionList'
import { useToast } from './toast'

interface Props {
  open: boolean
  /** When set, the sheet edits this transaction instead of adding a new one. */
  editing: LedgerTx | null
  /** Every category; the sheet picks the right ones for sent or received money. */
  categories: Category[]
  accounts: Account[]
  /** The main currency, used unless the user picks another for a transaction. */
  currency: string
  /** Regulars that fit right now, shown as one-tap fills when adding. */
  suggestions: Suggestion[]
  /** False when the user turned suggestions off in Settings. */
  showSuggestions: boolean
  /** A regular to fill in as soon as the sheet opens (picked from Home). */
  prefill: Suggestion | null
  /** Which kind to start on when adding (a home-screen shortcut can ask for "received"). */
  startKind: Transaction['kind']
  onClose: () => void
}

type Kind = Transaction['kind']
type Repeat = 'never' | 'weekly' | 'monthly'

const PAYMENT_METHODS = ['Cash', 'Card', 'Online'] as const

const chip =
  'flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-surface px-3.5 text-[0.9375rem] shadow-[inset_0_0_0_1px_var(--ring)] ' +
  'has-[:checked]:bg-btn has-[:checked]:text-btn-ink has-[:checked]:shadow-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2'

const input = 'mt-1 min-h-12 w-full rounded-xl bg-surface-2 px-3.5'

/** The short sign for a currency (₹, $, €), or its code when it has none. */
function symbolFor(code: string): string {
  try {
    const parts = new Intl.NumberFormat(undefined, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0)
    return parts.find((p) => p.type === 'currency')?.value ?? code
  } catch {
    return code
  }
}

/** Play a short animation, unless the person asked for less motion. */
function playOnce(el: HTMLElement | null, keyframes: Keyframe[], duration: number) {
  if (!el || typeof el.animate !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  el.animate(keyframes, { duration, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
}

/** "Oct 28" for a stored local date. */
const shortDay = (date: string) =>
  date ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(parseLocalDate(date)) : 'Pick a date'

const POP: Keyframe[] = [{ transform: 'scale(1.05)' }, { transform: 'scale(1)' }]
const SHAKE: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-8px)' },
  { transform: 'translateX(7px)' },
  { transform: 'translateX(-4px)' },
  { transform: 'translateX(0)' },
]

/** A labelled drop-down that looks like the other fields. */
function Select({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string
  label: string
  value: string | number
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm text-ink-2">
        {label}
      </label>
      <div className="relative">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${input} appearance-none pr-10`}>
          {children}
        </select>
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center pt-1 text-ink-2">
          <Icon name="chevDown" size={20} />
        </span>
      </div>
    </div>
  )
}

export const AddSheet = memo(function AddSheet({
  open, editing, categories, accounts, currency, suggestions, showSuggestions, prefill, startKind, onClose,
}: Props) {
  useDisplay() // the suggestions show amounts, so redraw when display settings change
  const dialog = useRef<HTMLDialogElement>(null)
  const amountInput = useRef<HTMLInputElement>(null)
  const amountCard = useRef<HTMLDivElement>(null)
  const categoryRow = useRef<HTMLDivElement>(null)
  const toast = useToast()

  const [kind, setKind] = useState<Kind>('expense')
  const [amount, setAmount] = useState('')
  const [txCurrency, setTxCurrency] = useState(currency)
  const [merchant, setMerchant] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [accountId, setAccountId] = useState<number | null>(null)
  const [toAccountId, setToAccountId] = useState<number | null>(null)
  const [date, setDate] = useState(localDateString())
  const [payment, setPayment] = useState('')
  const [note, setNote] = useState('')
  const [repeat, setRepeat] = useState<Repeat>('never')
  const [place, setPlace] = useState<Place | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [more, setMore] = useState(false)

  // Open/close the native dialog and (re)load the form each time it opens.
  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (open && !el.open) {
      const start = editing ?? null
      setKind(start?.kind ?? prefill?.kind ?? startKind)
      // A transaction recorded in another currency is edited in that currency, not the converted one.
      setAmount(start ? String((start.originalMinor ?? start.amountMinor) / 100) : prefill ? String(prefill.amountMinor / 100) : '')
      setTxCurrency(start ? (start.originalCurrency ?? start.currency) : currency)
      setMerchant(start?.merchant ?? prefill?.merchant ?? '')
      setCategoryId(start?.categoryId ?? prefill?.categoryId ?? null)
      setAccountId(start?.accountId ?? null)
      setToAccountId(start?.toAccountId ?? null)
      setDate(start?.date ?? localDateString())
      setPayment(start?.paymentMethod ?? prefill?.paymentMethod ?? '')
      setNote(start?.note ?? '')
      setRepeat('never')
      setPlace(start?.location ?? null)
      setError(null)
      setMore(start !== null) // an edit shows everything; a new entry keeps the extras tucked away
      el.showModal()
      // A filled-in form doesn't need the keyboard up; an empty one does.
      if (!start && !prefill) requestAnimationFrame(() => amountInput.current?.focus())
    } else if (!open && el.open) {
      el.close()
    }
  }, [open, editing, prefill, currency, startKind])

  /** Fill the form from a regular. The date stays as chosen (today by default). */
  function applySuggestion(s: Suggestion) {
    setKind(s.kind)
    setAmount(String(s.amountMinor / 100))
    playOnce(amountInput.current, POP, 220) // show where the number landed
    setMerchant(s.merchant)
    setCategoryId(s.categoryId)
    setPayment(s.paymentMethod)
    setError(null)
  }

  // Dialogs use closedby="any" where supported; light-dismiss is added by hand for Safari.
  useEffect(() => {
    dialog.current?.setAttribute('closedby', 'any')
  }, [])

  const expenseCategories = categories.filter((c) => c.name !== INCOME_CATEGORY)
  const incomeCategoryId = categories.find((c) => c.name === INCOME_CATEGORY)?.id ?? null
  const fallbackExpenseId = expenseCategories.find((c) => c.name === 'Other')?.id ?? expenseCategories[0]?.id ?? null
  // Received money files under Income, a transfer under nothing in particular (it is in no total),
  // and an expense keeps its pick unless it came from Income.
  const selectedCategory =
    kind === 'income'
      ? incomeCategoryId
      : kind === 'transfer'
        ? fallbackExpenseId
        : categoryId !== null && expenseCategories.some((c) => c.id === categoryId)
          ? categoryId
          : fallbackExpenseId

  // Keep the chosen category in view in the swipeable row (an edited one may be off to the side).
  useEffect(() => {
    if (!open) return
    // Move only the row itself. scrollIntoView would also nudge the sheet sideways.
    const row = categoryRow.current
    const chip = row?.querySelector('input:checked')?.parentElement
    if (row && chip) row.scrollLeft = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2
  }, [open, selectedCategory, kind])

  const received = kind === 'income'
  const transfer = kind === 'transfer'
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const kindSuggestions = suggestions.filter((s) => s.kind === kind).slice(0, 4)

  // Accounts. With one account there is nothing to choose, so the pickers stay out of the way.
  const activeAccounts = accounts.filter((a) => !a.archived)
  const fallbackAccount = defaultAccountId(accounts)
  const fromId = accountId ?? fallbackAccount ?? null
  const toId = toAccountId ?? activeAccounts.find((a) => a.id !== fromId)?.id ?? null
  const canTransfer = activeAccounts.length >= 2 || editing?.kind === 'transfer'
  const showAccounts = activeAccounts.length > 1 || (editing !== null && accounts.length > 1)
  const pickable = (selected: number | null) => accounts.filter((a) => !a.archived || a.id === selected)

  const kinds: { id: Kind; label: string }[] = [
    { id: 'expense', label: 'Sent' },
    { id: 'income', label: 'Received' },
    ...(canTransfer ? [{ id: 'transfer' as const, label: 'Transfer' }] : []),
  ]
  const currencies = [...new Set([currency, ...CURRENCIES, txCurrency])]

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const value = Number(amount.replace(/,/g, ''))
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount above 0.')
      playOnce(amountCard.current, SHAKE, 320)
      amountInput.current?.focus()
      return
    }
    if (selectedCategory === null) {
      setError('Pick a category.')
      return
    }
    if (transfer && (fromId === null || toId === null || fromId === toId)) {
      setError('Choose two different accounts.')
      return
    }
    const fields = {
      kind,
      amountMinor: toMinor(value),
      currency: transfer ? currency : txCurrency,
      categoryId: selectedCategory,
      merchant: transfer ? '' : merchant.trim(),
      note: note.trim(),
      date,
      paymentMethod: transfer ? '' : payment,
      ...(fromId !== null ? { accountId: fromId } : {}),
      ...(transfer && toId !== null ? { toAccountId: toId } : {}),
    }
    try {
      if (editing) {
        // A transaction that stopped being a transfer must forget its second account.
        await updateTransaction(editing.id, transfer ? fields : { ...fields, toAccountId: undefined })
        toast({ message: 'Changes saved' })
      } else {
        void attachLocation(await addTransaction({ ...fields, source: 'manual' }))
        let message = transfer ? 'Transfer added' : received ? 'Received money added' : 'Expense added'
        if (repeat !== 'never' && !transfer) {
          await addRecurring({
            kind: kind as 'expense' | 'income',
            amountMinor: fields.amountMinor,
            currency: fields.currency,
            categoryId: selectedCategory,
            merchant: fields.merchant,
            note: fields.note,
            paymentMethod: fields.paymentMethod,
            accountId: fromId ?? undefined,
            frequency: repeat,
            nextDue: nextDueAfter(date, repeat, parseLocalDate(date).getDate()),
            active: true,
          })
          message += repeat === 'weekly' ? '. Repeats every week.' : '. Repeats every month.'
        }
        toast({ message })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.')
    }
  }

  async function onDelete() {
    if (!editing) return
    const removed = await deleteTransaction(editing.id)
    onClose()
    toast({
      message: 'Transaction deleted',
      actionLabel: 'Undo',
      onAction: () => removed && void restoreTransaction(removed),
    })
  }

  async function onDuplicate() {
    if (!editing) return
    // Copy the stored row, not the converted one the screens see, so the currency and amount stay as paid.
    const raw = await db.transactions.get(editing.id)
    if (!raw) return
    const id = await duplicateTransaction(raw)
    onClose()
    toast({ message: 'Copied to today', actionLabel: 'Undo', onAction: () => void deleteTransaction(id) })
  }

  const title = editing ? 'Edit transaction' : 'Add transaction'

  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby="sheet-title"
      onClose={onClose}
      onClick={(e) => {
        // Clicks on the backdrop target the dialog itself (its content fills everything else).
        if (e.target === e.currentTarget) e.currentTarget.close()
      }}
    >
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4 px-5 pt-5">
        <div className="flex items-center justify-between">
          <h2 id="sheet-title" className="text-xl font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close"
            className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2"
          >
            <Icon name="close" />
          </button>
        </div>

        <div
          role="radiogroup"
          aria-label="Money sent, received or moved between accounts"
          className="grid gap-1 rounded-full bg-surface-2 p-1"
          style={{ gridTemplateColumns: `repeat(${kinds.length}, minmax(0, 1fr))` }}
        >
          {kinds.map((k) => (
            <label
              key={k.id}
              className="flex min-h-11 cursor-pointer items-center justify-center rounded-full font-medium has-[:checked]:bg-btn has-[:checked]:text-btn-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
            >
              <input type="radio" name="kind" className="sr-only" checked={kind === k.id} onChange={() => setKind(k.id)} />
              {k.label}
            </label>
          ))}
        </div>

        {!editing && showSuggestions && !transfer && (
          <section aria-labelledby="sheet-suggest-h">
            <h3 id="sheet-suggest-h" className="mb-2 text-sm text-ink-2">
              Suggested for now
            </h3>
            {kindSuggestions.length > 0 ? (
              <SuggestionList items={kindSuggestions} categoryById={categoryById} currency={currency} onPick={applySuggestion} tone="sheet" />
            ) : (
              <p className="text-sm text-ink-2">Merchants you add will show up here, so you can fill them in with one tap.</p>
            )}
          </section>
        )}

        <div>
          <label htmlFor="amount" className="sr-only">
            Amount
          </label>
          {/* The amount is the point of the form, so it gets its own large field, with the currency
              inside it. The ring appears on focus, the digits pop as they are typed, and the card
              shakes when the amount is missing. */}
          <div
            ref={amountCard}
            className="flex items-center gap-2 rounded-3xl bg-surface-2 py-3 pl-5 pr-3 shadow-[0_0_0_2px_transparent] transition-shadow duration-200 focus-within:shadow-[0_0_0_2px_var(--ink)] has-[[aria-invalid]]:shadow-[0_0_0_2px_var(--color-critical)]"
          >
            <span
              aria-hidden="true"
              className={`text-3xl font-medium transition-colors duration-200 ${amount ? 'text-ink' : 'text-ink-2'}`}
            >
              {symbolFor(transfer ? currency : txCurrency)}
            </span>
            <input
              ref={amountInput}
              id="amount"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="next"
              placeholder="0"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                if (error) setError(null)
                playOnce(e.currentTarget, POP, 140)
              }}
              aria-invalid={error?.startsWith('Enter') || undefined}
              aria-describedby={error ? 'sheet-error' : undefined}
              // Long numbers step down in size so they always fit on the line. The sizes are important
              // because the global "inputs are at least 1rem" rule would otherwise win over them.
              className={`min-w-0 flex-1 origin-left bg-transparent font-semibold tabular-nums tracking-tight caret-ink outline-none transition-[font-size] duration-150 placeholder:text-ink-2/60 ${
                amount.length > 10 ? 'text-4xl!' : amount.length > 7 ? 'text-5xl!' : 'text-6xl!'
              }`}
            />
            {!transfer && (
              <div className="relative shrink-0 self-center">
                <label htmlFor="tx-currency" className="sr-only">
                  Currency
                </label>
                <select
                  id="tx-currency"
                  value={txCurrency}
                  onChange={(e) => setTxCurrency(e.target.value)}
                  className="min-h-11 appearance-none rounded-full bg-surface py-1 pl-3.5 pr-9 text-sm font-medium"
                >
                  {currencies.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-2">
                  <Icon name="chevDown" size={16} />
                </span>
              </div>
            )}
          </div>
          {!transfer && txCurrency !== currency && (
            <p className="mt-1 text-sm text-ink-2">Recorded in {txCurrency}. Totals show it in {currency} at your exchange rate.</p>
          )}
          {error && (
            <p id="sheet-error" role="alert" className="mt-1 text-sm text-critical">
              {error}
            </p>
          )}
        </div>

        {!received && !transfer && (
          <fieldset className="min-w-0">
            <legend className="mb-3 text-sm text-ink-2">Category</legend>
            {/* One swipeable row instead of four wrapped ones, so the form is shorter. */}
            <div
              ref={categoryRow}
              className="-mx-5 flex snap-x scroll-px-5 gap-2 overflow-x-auto overscroll-x-contain px-5 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {expenseCategories.map((c) => (
                <label key={c.id} className={`${chip} shrink-0 snap-start whitespace-nowrap`}>
                  <input
                    type="radio"
                    name="category"
                    className="sr-only"
                    checked={selectedCategory === c.id}
                    onChange={() => setCategoryId(c.id)}
                  />
                  <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: c.color }} />
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="grid grid-cols-1 gap-3 min-[26rem]:grid-cols-2">
          {transfer ? (
            <>
              <Select id="from-account" label="From" value={fromId ?? ''} onChange={(v) => setAccountId(Number(v))}>
                {pickable(fromId).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
              <Select id="to-account" label="To" value={toId ?? ''} onChange={(v) => setToAccountId(Number(v))}>
                {pickable(toId).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </>
          ) : (
            <>
              <div className="min-[26rem]:col-span-2">
                <label htmlFor="merchant" className="text-sm text-ink-2">
                  {received ? 'From' : 'Where'}
                </label>
                <input
                  id="merchant"
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  autoComplete="off"
                  placeholder={received ? 'Person or employer' : 'Merchant or place'}
                  className={input}
                />
              </div>
              {showAccounts && (
                <div className="min-[26rem]:col-span-2">
                  <Select id="account" label={received ? 'Received in' : 'Paid from'} value={fromId ?? ''} onChange={(v) => setAccountId(Number(v))}>
                    {pickable(fromId).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </>
          )}
        </div>

        {/* Date, payment method, note and repeat are usually left alone, so they sit behind one row. */}
        <details
          open={more}
          onToggle={(e) => setMore(e.currentTarget.open)}
          className="group -mt-1 rounded-2xl bg-surface-2/60"
        >
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 [&::-webkit-details-marker]:hidden">
            <span className="font-medium">More details</span>
            <span className="flex min-w-0 items-center gap-2 text-sm text-ink-2">
              <span className="truncate">
                {date === localDateString() ? 'Today' : shortDay(date)}
                {!transfer && payment ? `, ${payment}` : ''}
                {repeat !== 'never' ? `, repeats ${repeat === 'weekly' ? 'weekly' : 'monthly'}` : ''}
              </span>
              <span className="transition-transform duration-200 group-open:rotate-180">
                <Icon name="chevDown" size={18} />
              </span>
            </span>
          </summary>
          <div className="grid grid-cols-1 gap-3 px-4 pb-4 min-[26rem]:grid-cols-2">
          <div>
            <label htmlFor="date" className="text-sm text-ink-2">
              Date
            </label>
            <input
              id="date"
              type="date"
              required
              max={localDateString()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              onInvalid={() => setMore(true)} // a bad date can't be fixed while it is folded away
              className={input}
            />
          </div>
          {!transfer && (
            <fieldset className="min-w-0">
              <legend className="text-sm text-ink-2">{received ? 'Received via' : 'Paid with'}</legend>
              <div className="mt-1 flex gap-1.5">
                {PAYMENT_METHODS.map((m) => (
                  <label key={m} className={`${chip} flex-1 justify-center px-2`}>
                    <input
                      type="radio"
                      name="payment"
                      className="sr-only"
                      checked={payment === m}
                      // Re-tapping the selected method clears it.
                      onClick={() => payment === m && setPayment('')}
                      onChange={() => setPayment(m)}
                    />
                    {m}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="min-[26rem]:col-span-2">
            <label htmlFor="note" className="text-sm text-ink-2">
              Note
            </label>
            <input id="note" value={note} onChange={(e) => setNote(e.target.value)} autoComplete="off" placeholder="Optional" className={input} />
          </div>
          {!editing && !transfer && (
            <div className="min-[26rem]:col-span-2">
              <Select id="repeat" label="Repeat" value={repeat} onChange={(v) => setRepeat(v as Repeat)}>
                <option value="never">Doesn’t repeat</option>
                <option value="weekly">Every week</option>
                <option value="monthly">Every month</option>
              </Select>
            </div>
          )}
          </div>
        </details>

        {editing && place && (
          <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-3.5 py-2.5">
            <Icon name="pin" size={20} />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">Added at this location</p>
              <p className="text-ink-2">
                {place.lat.toFixed(4)}, {place.lon.toFixed(4)}
                {place.accuracyM > 0 && ` · within ${place.accuracyM} m`}
              </p>
            </div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center px-1 text-sm font-medium underline underline-offset-2"
            >
              View map
            </a>
            <button
              type="button"
              onClick={() => {
                void clearLocation(editing.id)
                setPlace(null)
              }}
              className="min-h-11 px-1 text-sm font-medium text-critical"
            >
              Remove
            </button>
          </div>
        )}

        {/* Always in reach: the button stays at the bottom of the sheet while the form scrolls under it. */}
        <div className="sticky bottom-0 -mx-5 flex items-center gap-3 bg-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-1px_0_var(--ring)]">
          {editing && (
            <>
              <button type="button" onClick={() => void onDelete()} className="min-h-12 rounded-full px-3 font-medium text-critical">
                Delete
              </button>
              <button
                type="button"
                onClick={() => void onDuplicate()}
                aria-label="Copy this transaction to today"
                className="flex min-h-12 items-center gap-1.5 rounded-full bg-surface-2 px-4 font-medium"
              >
                <Icon name="copy" size={18} />
                Copy
              </button>
            </>
          )}
          <button type="submit" className="min-h-12 flex-1 rounded-full bg-btn font-semibold text-btn-ink">
            {editing ? 'Save changes' : transfer ? 'Add transfer' : received ? 'Add received money' : 'Add expense'}
          </button>
        </div>
      </form>
    </dialog>
  )
})
