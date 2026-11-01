import { useMemo } from 'react'
import { useDisplay } from '../../data/display'
import { useToday } from '../../data/useToday'
import { formatMoney } from '../../db/money'
import { balanceTrail, SOURCE_LABELS } from '../../insights/balanceTrail'
import { card, type Ledger } from './parts'

let enteredFormat: Intl.DateTimeFormat | undefined
const enteredAt = (ms: number) =>
  (enteredFormat ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })).format(ms)

const plural = (n: number, word: string, many: string) => `${n} ${n === 1 ? word : many}`

/**
 * Where the balance has been moving: what each source did to it over the last week, and the latest entries that
 * moved it, each with where it came from and when it was entered. The balance is only ever the starting figure plus
 * the entries, so this is the whole story of any change. It never shows the balance itself, which Home keeps hidden
 * until it is asked for.
 */
export function BalanceTrail({ ledger, now }: { ledger: Ledger; now?: number }) {
  useDisplay() // amounts are masked or regrouped by display settings, so redraw when they change
  const today = useToday()
  const at = now ?? today.getTime()
  const { currency, categoryById } = ledger
  const trail = useMemo(() => balanceTrail(ledger.txs, at), [ledger.txs, at])
  const signed = (minor: number) => `${minor < 0 ? '−' : '+'}${formatMoney(Math.abs(minor), currency)}`

  return (
    <section aria-label="What changed your balance" className={`${card} mt-3 p-4`}>
      <h4 className="font-semibold">What changed your balance</h4>
      <p className="mt-1 text-sm text-ink-2">
        Your balance only moves when an entry is added, edited, deleted or restored, when you import a file, or when you change an exchange rate.
        Regular payments never post by themselves: you add them from the Due now card.
      </p>

      {trail.items.length === 0 ? (
        <p className="mt-3 text-ink-2">Nothing has been entered yet.</p>
      ) : (
        <>
          {trail.recent.length > 0 ? (
            <ul aria-label="Last 7 days, by where they came from" className="mt-3 divide-y divide-line">
              {trail.recent.map((r) => (
                <li key={r.source} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block font-medium">{SOURCE_LABELS[r.source]}</span>
                    <span className="block text-sm text-ink-2">{plural(r.count, 'entry', 'entries')}</span>
                  </span>
                  <span className={`shrink-0 font-semibold tabular-nums ${r.effectMinor > 0 ? 'text-good' : ''}`}>{signed(r.effectMinor)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-ink-2">Nothing has been entered in the last 7 days.</p>
          )}

          <p className="mt-4 text-sm font-medium text-ink-2">Latest changes</p>
          <ul aria-label="Latest changes" className="mt-1 divide-y divide-line">
            {trail.items.map(({ tx, effectMinor }) => (
              <li key={tx.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{tx.merchant || categoryById.get(tx.categoryId)?.name || (effectMinor > 0 ? 'Income' : 'Expense')}</span>
                  <span className="block text-sm text-ink-2">{`${SOURCE_LABELS[tx.source]}. Entered ${enteredAt(tx.createdAt)}.`}</span>
                </span>
                <span className={`shrink-0 font-semibold tabular-nums ${effectMinor > 0 ? 'text-good' : ''}`}>{signed(effectMinor)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
