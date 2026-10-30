import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { LedgerTx } from '../data/buildLedger'
import { useDisplay } from '../data/display'
import type { useLedger } from '../data/useLedger'
import { formatMoney, localDateString, parseLocalDate, toMinor } from '../db/money'
import {
  deleteTransaction,
  deleteTransactions,
  duplicateTransaction,
  recategorizeTransactions,
  restoreTransaction,
  restoreTransactions,
} from '../db/repo'
import { db, type Transaction } from '../db/schema'
import { applyFilters, countActive, NO_FILTERS, type ActivityFilters, type KindFilter } from '../insights/filters'
import { newestFirst } from '../insights/order'
import { Icon } from '../ui/Icon'
import { TxList } from '../ui/TxList'
import { useToast } from '../ui/toast'

type Ledger = ReturnType<typeof useLedger>

interface Props {
  ledger: Ledger
  today: Date
  categoryFilter: number | null
  onCategoryFilter: (id: number | null) => void
  onEdit: (tx: LedgerTx) => void
}

const PAGE = 80

const chip =
  'flex min-h-11 shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-full bg-surface px-4 font-medium shadow-[0_0_0_1px_var(--ring)] ' +
  'aria-pressed:bg-btn aria-pressed:text-btn-ink aria-pressed:shadow-none'

const KINDS: { id: KindFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'expense', label: 'Sent' },
  { id: 'income', label: 'Received' },
  { id: 'transfer', label: 'Transfers' },
]

const field = 'mt-1 min-h-11 w-full rounded-xl bg-surface-2 px-3 focus-visible:outline-offset-0'

const sum = (rows: Transaction[]) => rows.reduce((acc, t) => acc + t.amountMinor, 0)
// Transfers move money between your own accounts, so they are neither sent nor received.
const sentOf = (rows: Transaction[]) => sum(rows.filter((t) => t.kind === 'expense'))
const receivedOf = (rows: Transaction[]) => sum(rows.filter((t) => t.kind === 'income'))

// Intl formatters are slow to build; make each once and reuse it for every day heading.
let longDay: Intl.DateTimeFormat | undefined
let shortDay: Intl.DateTimeFormat | undefined

/** "Today" and "Yesterday" get the full date beside them; any other day is its own date. */
function dayHeading(date: string, today: Date): { label: string; detail: string | null } {
  const day = parseLocalDate(date)
  const full = (longDay ??= new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })).format(day)
  const todayKey = localDateString(today)
  const yesterdayKey = localDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1))
  if (date === todayKey) return { label: 'Today', detail: full }
  if (date === yesterdayKey) return { label: 'Yesterday', detail: full }
  // Older days: weekday and date in the heading itself, plus the year once it isn't this year.
  const sameYear = day.getFullYear() === today.getFullYear()
  return {
    label: sameYear
      ? full
      : (shortDay ??= new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })).format(day),
    detail: null,
  }
}

const parseAmount = (text: string): number | null => {
  const n = Number(text.replace(/,/g, ''))
  return text.trim() !== '' && Number.isFinite(n) && n >= 0 ? toMinor(n) : null
}

export const Activity = memo(function Activity({ ledger, today, categoryFilter, onCategoryFilter, onEdit }: Props) {
  const { txs, categories, categoryById, accountById, expenseCategories, currency } = ledger
  useDisplay() // amounts are masked or regrouped by display settings, so redraw when they change
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [filters, setFilters] = useState<ActivityFilters>(NO_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [minText, setMinText] = useState('')
  const [maxText, setMaxText] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const chipRow = useRef<HTMLDivElement>(null)

  // Only offer categories that have expenses (most used first), plus the active one.
  const usedCategories = useMemo(() => {
    const counts = new Map<number, number>()
    for (const t of txs) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1)
    return categories
      .filter((c) => counts.has(c.id) || c.id === categoryFilter)
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
  }, [txs, categories, categoryFilter])

  // A filter chosen elsewhere (e.g. from Home) may sit off-screen; bring its chip into view.
  useEffect(() => {
    const row = chipRow.current
    const active = row?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!row || !active) return
    const left = active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    row.scrollTo({ left: Math.max(0, left), behavior: reduce ? 'auto' : 'smooth' })
  }, [categoryFilter])

  // Sorted once per data change, and the lowercase search text built once per data change, so a
  // keystroke only filters; it never re-sorts or re-lowercases thousands of rows.
  const sorted = useMemo(() => [...txs].sort(newestFirst), [txs])
  const searchText = useMemo(
    () =>
      new Map(
        txs.map((t) => [t.id, `${t.merchant} ${t.note} ${categoryById.get(t.categoryId)?.name ?? ''}`.toLowerCase()]),
      ),
    [txs, categoryById],
  )

  // The box updates immediately; the list catches up when the device has a moment to spare.
  const deferredQuery = useDeferredValue(query)
  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    return applyFilters(sorted, filters).filter(
      (t) => (categoryFilter === null || t.categoryId === categoryFilter) && (!q || searchText.get(t.id)!.includes(q)),
    )
  }, [sorted, searchText, deferredQuery, categoryFilter, filters])

  const groups = useMemo(() => {
    const map = new Map<string, LedgerTx[]>()
    for (const t of filtered.slice(0, limit)) {
      const day = map.get(t.date)
      if (day) day.push(t)
      else map.set(t.date, [t])
    }
    return [...map]
  }, [filtered, limit])

  const activeFilters = countActive(filters)
  const filtering = query.trim() !== '' || categoryFilter !== null || activeFilters > 0

  function patch(next: Partial<ActivityFilters>) {
    setFilters((f) => ({ ...f, ...next }))
    setLimit(PAGE)
  }

  function clearAll() {
    setQuery('')
    setFilters(NO_FILTERS)
    setMinText('')
    setMaxText('')
    onCategoryFilter(null)
  }

  /* ----- swipe actions ----- */
  const onCopy = useCallback(
    async (tx: LedgerTx) => {
      // Copy the stored row, not the converted one the screens see, so the currency and amount stay as paid.
      const raw = await db.transactions.get(tx.id)
      if (!raw) return
      const id = await duplicateTransaction(raw)
      toast({ message: 'Copied to today', actionLabel: 'Undo', onAction: () => void deleteTransaction(id) })
    },
    [toast],
  )
  const onDelete = useCallback(
    async (tx: LedgerTx) => {
      const removed = await deleteTransaction(tx.id)
      toast({ message: 'Transaction deleted', actionLabel: 'Undo', onAction: () => removed && void restoreTransaction(removed) })
    },
    [toast],
  )
  const swipe = useMemo(() => ({ onCopy: (t: LedgerTx) => void onCopy(t), onDelete: (t: LedgerTx) => void onDelete(t) }), [onCopy, onDelete])

  /* ----- select mode ----- */
  const toggle = useCallback((id: number) => {
    setPicked((p) => {
      const next = new Set(p)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }, [])
  const selection = useMemo(() => (selecting ? { ids: picked, onToggle: toggle } : null), [selecting, picked, toggle])

  function endSelecting() {
    setSelecting(false)
    setPicked(new Set())
  }

  async function deleteSelected() {
    const ids = [...picked]
    if (ids.length === 0) return
    const rows = await deleteTransactions(ids)
    endSelecting()
    toast({
      message: `Deleted ${rows.length} transaction${rows.length === 1 ? '' : 's'}`,
      actionLabel: 'Undo',
      onAction: () => void restoreTransactions(rows),
    })
  }

  async function moveSelected(categoryId: number) {
    // Only money sent has a category you can change; received money and transfers stay as they are.
    const ids = txs.filter((t) => picked.has(t.id) && t.kind === 'expense').map((t) => t.id)
    if (ids.length === 0) {
      toast({ message: 'Only money sent can be moved to a category.' })
      return
    }
    await recategorizeTransactions(ids, categoryId)
    endSelecting()
    toast({ message: `Moved ${ids.length} to ${categoryById.get(categoryId)?.name ?? 'the category'}` })
  }

  return (
    <div className="pb-6">
      <h1 className="sr-only">Activity</h1>

      {/* Search and filters scroll with the list so they never cover it. */}
      <div className="relative mt-5">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
          <Icon name="search" size={20} />
        </span>
        <label htmlFor="search" className="sr-only">
          Search expenses
        </label>
        <input
          id="search"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setLimit(PAGE)
          }}
          placeholder="Search merchant, note or category"
          className="min-h-12 w-full rounded-2xl bg-surface pl-11 pr-11 shadow-[0_0_0_1px_var(--ring)] [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-1 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-ink-2"
          >
            <Icon name="close" size={18} />
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="filters-panel"
          onClick={() => setFiltersOpen((o) => !o)}
          className="flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 font-medium shadow-[0_0_0_1px_var(--ring)]"
        >
          <Icon name="filter" size={18} />
          Filters
          {activeFilters > 0 && (
            <span className="flex size-6 items-center justify-center rounded-full bg-btn text-sm text-btn-ink">
              <span className="sr-only">{activeFilters} on, </span>
              {activeFilters}
            </span>
          )}
        </button>
        <button
          type="button"
          aria-pressed={selecting}
          onClick={() => (selecting ? endSelecting() : setSelecting(true))}
          disabled={txs.length === 0}
          className="min-h-11 rounded-full bg-surface px-4 font-medium shadow-[0_0_0_1px_var(--ring)] aria-pressed:bg-btn aria-pressed:text-btn-ink aria-pressed:shadow-none disabled:opacity-40"
        >
          {selecting ? 'Cancel' : 'Select'}
        </button>
      </div>

      {filtersOpen && (
        <section id="filters-panel" aria-label="Filters" className="mt-3 space-y-4 rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--ring)]">
          <div role="radiogroup" aria-label="Type" className="grid grid-cols-4 gap-1 rounded-full bg-surface-2 p-1">
            {KINDS.map((k) => (
              <label
                key={k.id}
                className="flex min-h-11 cursor-pointer items-center justify-center rounded-full px-1 text-sm font-medium has-[:checked]:bg-btn has-[:checked]:text-btn-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
              >
                <input type="radio" name="kind-filter" className="sr-only" checked={filters.kind === k.id} onChange={() => patch({ kind: k.id })} />
                {k.label}
              </label>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="f-from" className="text-sm text-ink-2">
                From date
              </label>
              <input id="f-from" type="date" max={filters.to || undefined} value={filters.from} onChange={(e) => patch({ from: e.target.value })} className={field} />
            </div>
            <div>
              <label htmlFor="f-to" className="text-sm text-ink-2">
                To date
              </label>
              <input id="f-to" type="date" min={filters.from || undefined} value={filters.to} onChange={(e) => patch({ to: e.target.value })} className={field} />
            </div>
            <div>
              <label htmlFor="f-min" className="text-sm text-ink-2">
                Smallest ({currency})
              </label>
              <input
                id="f-min"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Any"
                value={minText}
                onChange={(e) => {
                  setMinText(e.target.value)
                  patch({ minMinor: parseAmount(e.target.value) })
                }}
                className={field}
              />
            </div>
            <div>
              <label htmlFor="f-max" className="text-sm text-ink-2">
                Largest ({currency})
              </label>
              <input
                id="f-max"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Any"
                value={maxText}
                onChange={(e) => {
                  setMaxText(e.target.value)
                  patch({ maxMinor: parseAmount(e.target.value) })
                }}
                className={field}
              />
            </div>
          </div>

          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => {
                setFilters(NO_FILTERS)
                setMinText('')
                setMaxText('')
              }}
              className="min-h-11 rounded-full font-medium underline underline-offset-2"
            >
              Clear filters
            </button>
          )}
        </section>
      )}

      {/* py-0.5 stops the scroller clipping each chip's 1px border; the right edge fades to hint
          that the row scrolls, and the fade ends where the side padding does. */}
      <div
        ref={chipRow}
        role="group"
        aria-label="Filter by category"
        className="relative -mx-5 mt-3 flex snap-x snap-proximity scroll-px-5 gap-2 overflow-x-auto px-5 py-0.5 [mask-image:linear-gradient(to_right,black_calc(100%-1.25rem),transparent)]"
      >
        <button type="button" aria-pressed={categoryFilter === null} onClick={() => onCategoryFilter(null)} className={chip}>
          All
        </button>
        {usedCategories.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={categoryFilter === c.id}
            onClick={() => onCategoryFilter(categoryFilter === c.id ? null : c.id)}
            className={chip}
          >
            <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: c.color }} />
            {c.name}
          </button>
        ))}
      </div>

      {filtering && (
        <p className="mt-4 text-ink-2" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? 'transaction' : 'transactions'}:{' '}
          <span className="font-semibold text-ink">{formatMoney(sentOf(filtered), currency)}</span> sent
          {receivedOf(filtered) > 0 && (
            <>
              , <span className="font-semibold text-ink">{formatMoney(receivedOf(filtered), currency)}</span> received
            </>
          )}
        </p>
      )}

      {txs.length === 0 ? (
        <p className="mt-8 text-lg text-ink-2">Your transactions will show up here once you log them.</p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-lg text-ink-2">
          Nothing matches.{' '}
          <button type="button" className="font-medium text-ink underline underline-offset-2" onClick={clearAll}>
            Clear filters
          </button>
        </p>
      ) : (
        <div>
          {groups.map(([date, rows]) => {
            const heading = dayHeading(date, today)
            const sent = sentOf(rows)
            const received = receivedOf(rows)
            return (
              <section
                key={date}
                aria-label={heading.label}
                className="mt-6 [contain-intrinsic-size:auto_9rem] [content-visibility:auto]"
              >
                <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
                  <h2 className="min-w-0 font-semibold">
                    {heading.label}
                    {heading.detail && <span className="ml-2 text-sm font-normal text-ink-2">{heading.detail}</span>}
                  </h2>
                  <p className="shrink-0 text-[0.9375rem] text-ink-2 tabular-nums">
                    {sent > 0 && formatMoney(sent, currency)}
                    {received > 0 && (
                      <span className={`text-good ${sent > 0 ? 'ml-2' : ''}`}>+{formatMoney(received, currency)}</span>
                    )}
                  </p>
                </div>
                <TxList
                  rows={rows}
                  categoryById={categoryById}
                  accountById={accountById}
                  currency={currency}
                  showTime
                  onEdit={onEdit}
                  selection={selection}
                  swipe={swipe}
                />
              </section>
            )
          })}
          {filtered.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + PAGE)}
              className="mt-6 min-h-12 w-full rounded-full bg-surface font-medium shadow-[0_0_0_1px_var(--ring)]"
            >
              Show more
            </button>
          )}
        </div>
      )}

      {selecting && (
        <div className="sticky bottom-3 z-10 mt-6 flex flex-wrap items-center gap-2 rounded-3xl bg-btn p-2 pl-4 text-btn-ink shadow-lg">
          <span aria-live="polite" className="mr-auto text-sm font-medium">
            {picked.size === 0 ? 'Tap rows to select' : `${picked.size} selected`}
          </span>
          <label htmlFor="bulk-category" className="sr-only">
            Move selected to a category
          </label>
          <select
            id="bulk-category"
            value=""
            disabled={picked.size === 0}
            onChange={(e) => e.target.value && void moveSelected(Number(e.target.value))}
            className="min-h-11 rounded-full bg-btn-ink/15 px-3 text-sm font-medium text-btn-ink disabled:opacity-40"
          >
            <option value="">Move to…</option>
            {expenseCategories.map((c) => (
              <option key={c.id} value={c.id} className="text-ink">
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={picked.size === 0}
            onClick={() => void deleteSelected()}
            className="min-h-11 rounded-full bg-btn-ink/15 px-4 text-sm font-semibold disabled:opacity-40"
          >
            Delete
          </button>
          <button type="button" onClick={endSelecting} className="min-h-11 rounded-full px-3 text-sm font-semibold underline underline-offset-2">
            Done
          </button>
        </div>
      )}
    </div>
  )
})
