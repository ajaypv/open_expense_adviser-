import { formatMoney } from '../db/money'
import { AnimatedMoney } from './AnimatedMoney'
import { Icon } from './Icon'

interface Props {
  monthName: string
  receivedMinor: number
  currency: string
  balanceMinor: number
  /** Whether the user has told the app their balance (otherwise it starts from zero). */
  balanceSet: boolean
  /** Each account's estimated balance, revealed with the total when there is more than one. */
  accountLines?: { id: number; name: string; estimatedMinor: number }[]
  shown: boolean
  onToggle: () => void
  onSetBalance: () => void
}

const card = 'rounded-3xl bg-surface shadow-[0_0_0_1px_var(--ring)]'

/**
 * Money received this month, and an estimated balance that stays hidden until the
 * user asks to see it. The mask has a fixed length so it doesn't hint at the amount.
 */
export function WalletPanel({
  monthName,
  receivedMinor,
  currency,
  balanceMinor,
  balanceSet,
  accountLines,
  shown,
  onToggle,
  onSetBalance,
}: Props) {
  return (
    <section aria-label="Money received and your balance" className="mt-3 space-y-3">
      <dl className={`${card} flex items-center justify-between gap-3 p-4`}>
        <dt className="flex items-center gap-2 text-sm font-medium text-ink-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink">
            <Icon name="arrowDown" size={14} />
          </span>
          Received in {monthName}
        </dt>
        <dd className="text-[clamp(1.25rem,6vw,1.625rem)] font-bold leading-tight tracking-tight tabular-nums">
          <AnimatedMoney minor={receivedMinor} currency={currency} id="received" />
        </dd>
      </dl>

      <div className={`${card} p-4`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-ink-2">Estimated balance</p>
            <p
              id="balance-value"
              className="text-[clamp(1.375rem,6.4vw,1.75rem)] font-bold leading-tight tracking-tight tabular-nums"
            >
              {shown ? (
                formatMoney(balanceMinor, currency)
              ) : (
                <>
                  <span aria-hidden="true">••••••</span>
                  <span className="sr-only">Hidden</span>
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onToggle}
            aria-controls="balance-value"
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-surface-2 px-4 font-medium"
          >
            <Icon name={shown ? 'eyeOff' : 'eye'} size={20} />
            {shown ? 'Hide balance' : 'Show balance'}
          </button>
        </div>

        {shown && accountLines && accountLines.length > 1 && (
          <ul aria-label="Balance by account" className="mt-3 space-y-1.5 border-t border-line pt-3">
            {accountLines.map((a) => (
              <li key={a.id} className="flex items-baseline justify-between gap-3">
                <span className="truncate text-ink-2">{a.name}</span>
                <span className="font-medium tabular-nums">{formatMoney(a.estimatedMinor, currency)}</span>
              </li>
            ))}
          </ul>
        )}

        {shown && (
          <p className="mt-3 border-t border-line pt-3 text-sm text-ink-2">
            {balanceSet ? (
              'Starts from the balance you set, then adds what you receive and subtracts what you spend.'
            ) : (
              <>
                Based only on what you&rsquo;ve logged.{' '}
                <button type="button" onClick={onSetBalance} className="font-medium text-ink underline underline-offset-2">
                  Set your balance
                </button>{' '}
                for a closer estimate.
              </>
            )}
          </p>
        )}
      </div>
    </section>
  )
}
