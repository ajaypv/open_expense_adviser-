import { useId, useMemo, useState } from 'react'
import { formatMoney, localDateString, toMinor } from '../db/money'
import type { Category } from '../db/schema'
import { guessCategoryName, parseExpense } from '../ingest/localParser'
import { Dialog } from './Dialog'
import { Icon } from './Icon'

/** What is saved: the amount, what it was, which category, and the day. */
export interface QuickEntry {
  amountMinor: number
  merchant: string
  categoryId: number
  /** YYYY-MM-DD. */
  date: string
}

interface Props {
  open: boolean
  onClose: () => void
  /** The spending categories, the ones used most first. */
  categories: Category[]
  currency: string
  today: Date
  /** Saves it; rejects (and the sheet stays open) when it could not be saved. */
  onSave: (entry: QuickEntry) => Promise<void>
  /** Your own earlier choice for a name, if there is one: it beats the guess from the words. */
  learned?: (merchant: string) => number | null
  /** Opens the full form, which has all the rest: money received, a transfer, an account, a note, a repeat. */
  onMore: () => void
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'] as const
const MAX_INTEGER_DIGITS = 9

const dayKey = (d: Date, back = 0) => localDateString(new Date(d.getFullYear(), d.getMonth(), d.getDate() - back))

/** The keys of the pad applied to what has been typed so far: digits, one point and at most two places after it. */
export function pressKey(digits: string, key: (typeof KEYS)[number]): string {
  if (key === 'del') return digits.slice(0, -1)
  if (key === '.') return digits.includes('.') ? digits : `${digits === '' ? '0' : digits}.`
  const [whole, decimals] = digits.split('.')
  if (decimals !== undefined) return decimals.length >= 2 ? digits : digits + key
  if (whole === '0') return key
  return whole.length >= MAX_INTEGER_DIGITS ? digits : digits + key
}

/**
 * The quick way to add an expense, built for one thumb: the amount from a big number pad, what it was in a few words (or all of it in
 * one line, "450 lunch at Cafe yesterday", which is understood), a category from chips with the likely one already chosen, and the
 * day as Today, Yesterday or a date. One button saves it, and the toast that follows has Undo. What the full form has beyond this (money
 * received, a transfer, an account, a note, a repeat) is a tap away under "More options".
 */
export function QuickAdd({ open, onClose, categories, currency, today, onSave, learned, onMore }: Props) {
  const titleId = useId()
  const [digits, setDigits] = useState('')
  const [text, setText] = useState('')
  const [chosen, setChosen] = useState<number | null>(null)
  const [pickedDate, setPickedDate] = useState<string | null>(null)
  const [pickOpen, setPickOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const todayKey = dayKey(today)
  const yesterdayKey = dayKey(today, 1)

  // Words that hold an amount ("450 lunch at Cafe") fill in what the pad has not; words without one are just what it was.
  const said = useMemo(() => {
    const words = text.trim()
    if (words === '') return null
    const parsed = parseExpense(words, today)
    return parsed && parsed.kind === 'expense' ? parsed : null
  }, [text, today])
  const merchant = said ? said.merchant : text.trim()

  const padMinor = digits === '' || digits === '.' ? 0 : toMinor(Number(digits))
  const amountMinor = padMinor > 0 ? padMinor : (said?.amountMinor ?? 0)

  const date = pickedDate ?? said?.date ?? todayKey
  const onToday = date === todayKey
  const onYesterday = date === yesterdayKey

  // The category: yours if you chose one, else what you chose for this name before, else what the words suggest, else the first.
  const byName = (name: string) => categories.find((c) => c.name.toLowerCase() === name.toLowerCase())
  const guessId = useMemo(() => {
    if (merchant === '') return null
    return learned?.(merchant) ?? byName(said?.categoryName ?? guessCategoryName(merchant))?.id ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchant, said, learned, categories])
  const categoryId = chosen ?? guessId ?? byName('Other')?.id ?? categories[0]?.id ?? null
  const category = categories.find((c) => c.id === categoryId)

  // The amount as it is being typed: grouped as the app groups money, with the point and places typed so far after it.
  const [whole, decimals] = digits.split('.')
  const shown = padMinor > 0 || digits !== '' ? formatMoney(toMinor(Number(whole || '0')), currency) + (decimals !== undefined ? `.${decimals}` : '') : formatMoney(amountMinor, currency)

  const canAdd = amountMinor > 0 && categoryId !== null && !busy

  async function add() {
    if (!canAdd || categoryId === null) return
    setBusy(true)
    setFailed(false)
    try {
      await onSave({ amountMinor, merchant, categoryId, date })
      onClose()
    } catch {
      // The app says what went wrong; the sheet stays as it was, to try again.
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const pad = 'flex h-14 items-center justify-center rounded-2xl bg-surface text-2xl font-semibold tabular-nums shadow-[0_0_0_1px_var(--ring)] active:bg-surface-2 motion-reduce:transition-none'

  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} variant="page">
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-3.5 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between">
          <h2 id={titleId} className="type-title">
            New expense
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 items-center justify-center rounded-full bg-surface-2">
            <Icon name="close" />
          </button>
        </header>

        <section aria-label="What you are adding" className="rounded-[1.75rem] bg-surface p-5 shadow-[0_0_0_1px_var(--ring)]">
          <p className="text-sm font-semibold text-ink-2">Type it as you would say it</p>
          <p data-testid="quick-amount" aria-live="polite" className={`type-display mt-1 whitespace-nowrap text-[clamp(2.25rem,1.5rem+4vw,2.75rem)] ${amountMinor === 0 && digits === '' ? 'text-muted' : ''}`}>
            {shown}
            <span aria-hidden="true" className="ml-1 inline-block h-[0.85em] w-[3px] translate-y-[0.1em] rounded-sm bg-accent" />
          </p>
          <label htmlFor="quick-say" className="sr-only">
            What was it, or all of it in one line
          </label>
          <input
            id="quick-say"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            enterKeyHint="done"
            autoComplete="off"
            placeholder="lunch at Cafe, or 450 lunch at Cafe"
            className="mt-3 min-h-12 w-full rounded-2xl bg-surface-2 px-4 text-base placeholder:text-muted focus:outline-none focus-visible:shadow-[0_0_0_2px_var(--ink)]"
          />
          <ul aria-label="What was understood" className="mt-3 flex flex-wrap gap-1.5 text-sm font-medium">
            {merchant !== '' && <li className="rounded-full bg-surface-2 px-3 py-1">{merchant}</li>}
            {category && <li data-chip="category" className="rounded-full bg-surface-2 px-3 py-1">{category.name}</li>}
            <li data-chip="day" className="rounded-full bg-surface-2 px-3 py-1">
              {onToday ? 'Today' : onYesterday ? 'Yesterday' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(`${date}T00:00:00`))}
            </li>
          </ul>
        </section>

        {/* Edge to edge inside the 20px gutter; the scroll padding keeps the first chip clear of the screen edge when the row settles. */}
        <div role="group" aria-label="Category" className="-mx-5 flex snap-x scroll-px-5 gap-2 overflow-x-auto overscroll-x-contain px-5 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categories.map((c) => {
            const on = c.id === categoryId
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => setChosen(c.id)}
                className={`flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full px-4 text-[0.9375rem] ${on ? 'bg-btn font-semibold text-btn-ink' : 'bg-surface font-medium shadow-[0_0_0_1px_var(--ring)]'}`}
              >
                <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: c.color }} />
                {c.name}
              </button>
            )
          })}
        </div>

        <div role="group" aria-label="Day" className="flex gap-1 rounded-full bg-surface-2 p-1">
          {(
            [
              ['Today', onToday && !pickOpen, () => (setPickedDate(todayKey), setPickOpen(false))],
              ['Yesterday', onYesterday && !pickOpen, () => (setPickedDate(yesterdayKey), setPickOpen(false))],
              ['Pick a day', pickOpen || (!onToday && !onYesterday), () => setPickOpen(true)],
            ] as const
          ).map(([label, on, pick]) => (
            <button key={label} type="button" aria-pressed={on} onClick={pick} className={`min-h-11 flex-1 rounded-full text-[0.9375rem] ${on ? 'bg-surface font-semibold shadow-[0_1px_3px_rgb(0_0_0/0.15)]' : 'font-medium text-ink-2'}`}>
              {label}
            </button>
          ))}
        </div>
        {(pickOpen || (!onToday && !onYesterday)) && (
          <input
            type="date"
            aria-label="Day of the expense"
            value={date}
            max={todayKey}
            onChange={(e) => e.target.value && setPickedDate(e.target.value)}
            className="min-h-12 w-full rounded-2xl bg-surface px-4 text-base shadow-[0_0_0_1px_var(--ring)]"
          />
        )}

        <div className="flex-1" />

        <div role="group" aria-label="Number pad" className="grid grid-cols-3 gap-2">
          {KEYS.map((k) =>
            k === 'del' ? (
              <button key={k} type="button" aria-label="Delete" onClick={() => setDigits((d) => pressKey(d, k))} className={`${pad} bg-surface-2`}>
                <Icon name="backspace" size={26} />
              </button>
            ) : (
              <button key={k} type="button" onClick={() => setDigits((d) => pressKey(d, k))} className={pad}>
                {k}
              </button>
            ),
          )}
        </div>

        {failed && (
          <p role="alert" className="text-center text-sm font-medium text-critical">
            It could not be added. Try again.
          </p>
        )}
        <button
          type="button"
          onClick={() => void add()}
          aria-disabled={!canAdd}
          className={`min-h-14 w-full rounded-full text-lg font-semibold ${canAdd ? 'bg-btn text-btn-ink active:opacity-80' : 'bg-surface-2 text-muted'}`}
        >
          {amountMinor > 0 ? `Add ${formatMoney(amountMinor, currency)}` : 'Add'}
        </button>
        <p className="text-center text-sm font-medium text-ink-2">You can undo it right after.</p>
        <button type="button" onClick={onMore} className="mx-auto min-h-11 rounded-full px-4 text-[0.9375rem] font-semibold underline underline-offset-2">
          More options
        </button>
      </div>
    </Dialog>
  )
}
