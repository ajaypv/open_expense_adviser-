import { formatMoney } from '../db/money'
import { Icon } from '../ui/Icon'

interface Props {
  spentMinor: number
  limitMinor: number
  currency: string
}

/** Budget progress. The state is always stated in words and an icon, never by color alone. */
export function Meter({ spentMinor, limitMinor, currency }: Props) {
  const ratio = spentMinor / limitMinor
  const over = ratio >= 1
  const close = ratio >= 0.8 && !over
  const fill = over ? 'var(--critical)' : close ? 'var(--warn)' : 'var(--s1)'

  const status = over
    ? `Over budget by ${formatMoney(spentMinor - limitMinor, currency)}`
    : close
      ? `Close to the limit, ${formatMoney(limitMinor - spentMinor, currency)} left`
      : `${formatMoney(limitMinor - spentMinor, currency)} left`

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p>
          <span className="font-semibold tabular-nums">{formatMoney(spentMinor, currency)}</span>
          <span className="text-ink-2"> of {formatMoney(limitMinor, currency)}</span>
        </p>
        <p className="text-ink-2 tabular-nums">{Math.round(ratio * 100)}%</p>
      </div>
      <div
        role="meter"
        aria-label="Monthly budget used"
        aria-valuemin={0}
        aria-valuemax={limitMinor / 100}
        aria-valuenow={Math.min(spentMinor, limitMinor) / 100}
        aria-valuetext={status}
        className="mt-2 h-2.5 overflow-hidden rounded-full"
        style={{ background: 'color-mix(in oklab, var(--s1) 16%, var(--surface))' }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${Math.min(ratio, 1) * 100}%`, background: fill }}
        />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[0.9375rem] text-ink-2">
        {(over || close) && (
          <span style={{ color: over ? 'var(--critical)' : 'var(--warn)' }}>
            <Icon name="warn" size={18} />
          </span>
        )}
        {status}
      </p>
    </div>
  )
}
