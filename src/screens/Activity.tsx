import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { useLedger } from '../data/useLedger'
import { formatMoney, localDateString, parseLocalDate } from '../db/money'
import type { Transaction } from '../db/schema'
import { sum } from '../insights/aggregates'
import { newestFirst } from '../insights/order'
import { Icon } from '../ui/Icon'
import { TxRow } from '../ui/TxRow'

type Ledger = ReturnType<typeof useLedger>

interface Props {
  ledger: Ledger
  today: Date
  categoryFilter: number | null
  onCategoryFilter: (id: number | null) => void
  onEdit: (tx: Transaction) => void
}

const PAGE = 80

const chip =
  'flex min-h-11 shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-full bg-surface px-4 font-medium shadow-[0_0_0_1px_var(--ring)] ' +
  'aria-pressed:bg-btn aria-pressed:text-btn-ink aria-pressed:shadow-none'

const sentOf = (rows: Transaction[]) => sum(rows.filter((t) => t.kind !== 'income'))
const receivedOf = (rows: Transaction[]) => sum(rows.filter((t) => t.kind === 'income'))

function dayHeading(date: string, today: Date): string {
  const todayKey = localDateString(today)
  const yesterdayKey = localDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1))
  if (date === todayKey) return 'Today'
  if (date === yesterdayKey) return 'Yesterday'
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(
    parseLocalDate(date),
  )
}

export const Activity = memo(function Activity({ ledger, today, categoryFilter, onCategoryFilter, onEdit }: Props) {
  const { txs, categories, categoryById, currency } = ledger
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
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
    return sorted.filter(
      (t) => (categoryFilter === null || t.categoryId === categoryFilter) && (!q || searchText.get(t.id)!.includes(q)),
    )
  }, [sorted, searchText, deferredQuery, categoryFilter])

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const t of filtered.slice(0, limit)) {
      const day = map.get(t.date)
      if (day) day.push(t)
      else map.set(t.date, [t])
    }
    return [...map]
  }, [filtered, limit])

  const filtering = query.trim() !== '' || categoryFilter !== null

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
          <button
            type="button"
            className="font-medium text-ink underline underline-offset-2"
            onClick={() => {
              setQuery('')
              onCategoryFilter(null)
            }}
          >
            Clear filters
          </button>
        </p>
      ) : (
        <div>
          {groups.map(([date, rows]) => (
            <section
              key={date}
              aria-label={dayHeading(date, today)}
              className="mt-6 [contain-intrinsic-size:auto_9rem] [content-visibility:auto]"
            >
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="font-semibold">{dayHeading(date, today)}</h2>
                <p className="text-[0.9375rem] text-ink-2 tabular-nums">
                  {sentOf(rows) > 0 && formatMoney(sentOf(rows), currency)}
                  {receivedOf(rows) > 0 && (
                    <span className={`text-good ${sentOf(rows) > 0 ? 'ml-2' : ''}`}>
                      +{formatMoney(receivedOf(rows), currency)}
                    </span>
                  )}
                </p>
              </div>
              <ul className="divide-y divide-line rounded-2xl bg-surface px-4 shadow-[0_0_0_1px_var(--ring)]">
                {rows.map((t) => (
                  <li key={t.id}>
                    <TxRow tx={t} category={categoryById.get(t.categoryId)} currency={currency} onClick={onEdit} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
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
    </div>
  )
})
