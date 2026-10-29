import { useEffect, useRef, useState, type FormEvent, memo } from 'react'
import { attachLocation, clearLocation } from '../data/location'
import { INCOME_CATEGORY } from '../db/defaultCategories'
import { localDateString, toMinor } from '../db/money'
import { addTransaction, deleteTransaction, restoreTransaction, updateTransaction } from '../db/repo'
import type { Category, Place, Transaction } from '../db/schema'
import type { Suggestion } from '../insights/suggestions'
import { Icon } from './Icon'
import { SuggestionList } from './SuggestionList'
import { useToast } from './toast'

interface Props {
  open: boolean
  /** When set, the sheet edits this transaction instead of adding a new one. */
  editing: Transaction | null
  /** Every category; the sheet picks the right ones for sent or received money. */
  categories: Category[]
  currency: string
  /** Regulars that fit right now, shown as one-tap fills when adding. */
  suggestions: Suggestion[]
  /** False when the user turned suggestions off in Settings. */
  showSuggestions: boolean
  /** A regular to fill in as soon as the sheet opens (picked from Home). */
  prefill: Suggestion | null
  onClose: () => void
}

type Kind = Transaction['kind']

const PAYMENT_METHODS = ['Cash', 'Card', 'Online'] as const

const KINDS: { id: Kind; label: string }[] = [
  { id: 'expense', label: 'Sent' },
  { id: 'income', label: 'Received' },
]

const chip =
  'flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-surface px-3.5 text-[0.9375rem] shadow-[0_0_0_1px_var(--ring)] ' +
  'has-[:checked]:bg-btn has-[:checked]:text-btn-ink has-[:checked]:shadow-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2'

const input = 'mt-1 min-h-12 w-full rounded-xl bg-surface-2 px-3.5'

export const AddSheet = memo(function AddSheet({ open, editing, categories, currency, suggestions, showSuggestions, prefill, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const amountInput = useRef<HTMLInputElement>(null)
  const toast = useToast()

  const [kind, setKind] = useState<Kind>('expense')
  const [amount, setAmount] = useState('')
  const [merchant, setMerchant] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [date, setDate] = useState(localDateString())
  const [payment, setPayment] = useState('')
  const [note, setNote] = useState('')
  const [place, setPlace] = useState<Place | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Open/close the native dialog and (re)load the form each time it opens.
  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (open && !el.open) {
      const start = editing ?? null
      setKind(start?.kind ?? prefill?.kind ?? 'expense')
      setAmount(start ? String(start.amountMinor / 100) : prefill ? String(prefill.amountMinor / 100) : '')
      setMerchant(start?.merchant ?? prefill?.merchant ?? '')
      setCategoryId(start?.categoryId ?? prefill?.categoryId ?? null)
      setDate(start?.date ?? localDateString())
      setPayment(start?.paymentMethod ?? prefill?.paymentMethod ?? '')
      setNote(start?.note ?? '')
      setPlace(start?.location ?? null)
      setError(null)
      el.showModal()
      // A filled-in form doesn't need the keyboard up; an empty one does.
      if (!start && !prefill) requestAnimationFrame(() => amountInput.current?.focus())
    } else if (!open && el.open) {
      el.close()
    }
  }, [open, editing, prefill])

  /** Fill the form from a regular. The date stays as chosen (today by default). */
  function applySuggestion(s: Suggestion) {
    setKind(s.kind)
    setAmount(String(s.amountMinor / 100))
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
  // Received money always files under Income; an expense keeps its pick unless it came from Income.
  const selectedCategory =
    kind === 'income'
      ? incomeCategoryId
      : categoryId !== null && expenseCategories.some((c) => c.id === categoryId)
        ? categoryId
        : fallbackExpenseId

  const received = kind === 'income'
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const kindSuggestions = suggestions.filter((s) => s.kind === kind).slice(0, 4)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const value = Number(amount.replace(/,/g, ''))
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount above 0.')
      return
    }
    if (selectedCategory === null) {
      setError('Pick a category.')
      return
    }
    const fields = {
      kind,
      amountMinor: toMinor(value),
      categoryId: selectedCategory,
      merchant: merchant.trim(),
      note: note.trim(),
      date,
      paymentMethod: payment,
    }
    try {
      if (editing) {
        await updateTransaction(editing.id, fields)
        toast({ message: 'Changes saved' })
      } else {
        void attachLocation(await addTransaction({ ...fields, currency, source: 'manual' }))
        toast({ message: received ? 'Received money added' : 'Expense added' })
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
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-5 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
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

        <div role="radiogroup" aria-label="Money sent or received" className="grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1">
          {KINDS.map((k) => (
            <label
              key={k.id}
              className="flex min-h-11 cursor-pointer items-center justify-center rounded-full font-medium has-[:checked]:bg-btn has-[:checked]:text-btn-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
            >
              <input
                type="radio"
                name="kind"
                className="sr-only"
                checked={kind === k.id}
                onChange={() => setKind(k.id)}
              />
              {k.label}
            </label>
          ))}
        </div>

        {!editing && showSuggestions && (
          <section aria-labelledby="sheet-suggest-h">
            <h3 id="sheet-suggest-h" className="mb-2 text-sm text-ink-2">
              Suggested for now
            </h3>
            {kindSuggestions.length > 0 ? (
              <SuggestionList items={kindSuggestions} categoryById={categoryById} currency={currency} onPick={applySuggestion} tone="sheet" />
            ) : (
              <p className="text-sm text-ink-2">
                Merchants you add will show up here, so you can fill them in with one tap.
              </p>
            )}
          </section>
        )}

        <div>
          <label htmlFor="amount" className="text-sm text-ink-2">
            Amount ({currency})
          </label>
          <input
            ref={amountInput}
            id="amount"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="next"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={error?.startsWith('Enter') || undefined}
            aria-describedby={error ? 'sheet-error' : undefined}
            className="mt-1 w-full bg-transparent text-5xl font-semibold tracking-tight outline-none"
          />
          {error && (
            <p id="sheet-error" role="alert" className="mt-1 text-sm text-critical">
              {error}
            </p>
          )}
        </div>

        {!received && (
          <fieldset className="min-w-0">
            <legend className="mb-2 text-sm text-ink-2">Category</legend>
            <div className="flex flex-wrap gap-2">
              {expenseCategories.map((c) => (
                <label key={c.id} className={chip}>
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
              className={input}
            />
          </div>
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
          <div className="min-[26rem]:col-span-2">
            <label htmlFor="note" className="text-sm text-ink-2">
              Note
            </label>
            <input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoComplete="off"
              placeholder="Optional"
              className={input}
            />
          </div>
        </div>

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

        <div className="flex items-center gap-3">
          {editing && (
            <button
              type="button"
              onClick={() => void onDelete()}
              className="min-h-12 rounded-full px-4 font-medium text-critical"
            >
              Delete
            </button>
          )}
          <button
            type="submit"
            className="min-h-12 flex-1 rounded-full bg-btn font-semibold text-btn-ink"
          >
            {editing ? 'Save changes' : received ? 'Add received money' : 'Add expense'}
          </button>
        </div>
      </form>
    </dialog>
  )
})
