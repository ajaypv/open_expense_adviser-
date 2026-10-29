import { formatMoney } from '../db/money'
import { Icon } from './Icon'

interface Props {
  monthName: string
  sentMinor: number
  receivedMinor: number
  currency: string
  balanceMinor: number
  /** Whether the user has told the app their balance (otherwise it starts from zero). */
  balanceSet: boolean
  shown: boolean
  onToggle: () => void
  onSetBalance: () => void
}

const card = 'rounded-3xl bg-surface shadow-[0_0_0_1px_var(--ring)]'

/**
 * Money sent and received this month, and an estimated balance that stays hidden until the
 * user asks to see it. The mask has a fixed length so it doesn't hint at the amount.
 */
export function WalletPanel({
  monthName,
  sentMinor,
  receivedMinor,
  currency,
  balanceMinor,
  balanceSet,
  shown,
  onToggle,
  onSetBalance,
}: Props) {
  return (
    <section aria-label="Money sent and received" className="mt-3 space-y-3">
      <dl className="grid grid-cols-2 gap-3">
        <div className={`${card} flex flex-col-reverse gap-1 p-4`}>
          <dt className="flex items-center gap-1.5 text-sm text-ink-2">
            <Icon name="arrowUp" size={16} />
            Sent in {monthName}
          </dt>
          <dd className="text-[clamp(1.25rem,6vw,1.625rem)] font-semibold leading-tight tracking-tight tabular-nums">
            {formatMoney(sentMinor, currency)}
          </dd>
        </div>
        <div className={`${card} flex flex-col-reverse gap-1 p-4`}>
          <dt className="flex items-center gap-1.5 text-sm text-ink-2">
            <Icon name="arrowDown" size={16} />
            Received in {monthName}
          </dt>
          <dd className="text-[clamp(1.25rem,6vw,1.625rem)] font-semibold leading-tight tracking-tight tabular-nums">
            {formatMoney(receivedMinor, currency)}
          </dd>
        </div>
      </dl>

      <div className={`${card} p-4`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-ink-2">Estimated balance</p>
            <p
              id="balance-value"
              className="text-[clamp(1.375rem,6.4vw,1.75rem)] font-semibold leading-tight tracking-tight tabular-nums"
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

        {shown && (
          <p className="mt-3 border-t border-line pt-3 text-sm text-ink-2">
            {balanceSet ? (
              'Your balance when you set it, plus money received, minus money sent since.'
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
