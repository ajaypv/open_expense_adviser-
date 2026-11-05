import type { CSSProperties } from 'react'
import { formatMoney } from '../db/money'
import { BILL_LABELS, type BillKind, type BillSplit as Split } from '../insights/billSplit'
import { Icon, type IconName } from '../ui/Icon'
import { useSeen } from '../ui/motion'
import { formatShare } from './share'

const ICON: Record<BillKind, IconName> = { emi: 'emi', recharge: 'recharge', utilities: 'bolt', insurance: 'heart', bills: 'receipt' }
/** One colour for each part, the same whatever the month, so it is always the same one. The words and the percentages say which is which. */
const COLOR: Record<BillKind, string> = { emi: 'var(--s1)', recharge: 'var(--s2)', utilities: 'var(--s3)', insurance: 'var(--s7)', bills: 'var(--s5)' }

/**
 * How what went on bills, recharges and EMIs divides: one bar cut into its parts, and under it each part with its icon,
 * its share of the bills and its amount. The sentence above says what the whole came to and how much of the month it was.
 */
export function BillSplit({ split, currency, monthName }: { split: Split; currency: string; monthName: string }) {
  const [watch, seen] = useSeen()
  const money = (minor: number) => formatMoney(minor, currency)
  const [first] = split.parts
  return (
    <div ref={watch} data-seen={seen} className="when-seen mt-3 rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--ring)]">
      <p data-testid="bill-total" className="text-lg leading-snug">
        <b className="font-semibold">{money(split.totalMinor)}</b>
        {` went on bills, recharges and EMIs in ${monthName}, ${formatShare(split.shareOfMonth)} of everything you spent.`}
      </p>

      <div role="img" aria-label={split.parts.map((p) => `${BILL_LABELS[p.kind]} ${formatShare(p.shareOfBills)}`).join(', ')} className="mt-3 flex h-3.5 gap-0.5 overflow-hidden rounded-full">
        {split.parts.map((p, i) => (
          <span
            key={p.kind}
            data-part={p.kind}
            className="ai-bar-right h-full min-w-1 rounded-full"
            style={{ flexGrow: p.shareOfBills * 100, flexBasis: 0, background: COLOR[p.kind], '--d': `${i * 90}ms` } as CSSProperties}
          />
        ))}
      </div>

      <ul aria-label="Bills, recharges and EMIs, by part" className="mt-2 divide-y divide-line">
        {split.parts.map((p) => (
          <li key={p.kind} data-kind={p.kind} aria-label={`${BILL_LABELS[p.kind]}, ${formatShare(p.shareOfBills)} of your bills, ${money(p.totalMinor)}, ${p.count} ${p.count === 1 ? 'payment' : 'payments'}`} className="flex min-h-14 items-center gap-3 py-2.5">
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in oklab, ${COLOR[p.kind]} 22%, var(--surface))` }}>
              <Icon name={ICON[p.kind]} size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium leading-tight">{BILL_LABELS[p.kind]}</span>
              <span className="block text-sm text-ink-2">{`${p.count} ${p.count === 1 ? 'payment' : 'payments'}, ${formatShare(p.shareOfMonth)} of the month`}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-semibold tabular-nums">{money(p.totalMinor)}</span>
              <span className="block text-sm tabular-nums text-ink-2">{formatShare(p.shareOfBills)}</span>
            </span>
          </li>
        ))}
      </ul>

      {split.parts.length > 1 && (
        <p className="mt-2 rounded-2xl bg-surface-2 p-3 text-[0.9375rem] leading-snug text-ink-2">
          {`${BILL_LABELS[first.kind]} was the biggest part: ${formatShare(first.shareOfBills)} of it.`}
        </p>
      )}
    </div>
  )
}
