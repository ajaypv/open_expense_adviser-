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
    <section aria-label="Money sent and received" className="mt-8 rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--ring)]">
      <dl className="grid grid-cols-2 divide-x divide-line">
        <div className="flex flex-col-reverse pr-4">
          <dt className="text-sm text-ink-2">Sent in {monthName}</dt>
          <dd className="text-[clamp(1.125rem,5.6vw,1.5rem)] font-semibold tracking-tight">
            {formatMoney(sentMinor, currency)}
          </dd>
        </div>
        <div className="flex flex-col-reverse pl-4">
          <dt className="text-sm text-ink-2">Received in {monthName}</dt>
          <dd className="text-[clamp(1.125rem,5.6vw,1.5rem)] font-semibold tracking-tight">
            {formatMoney(receivedMinor, currency)}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
        <div className="min-w-0">
          <p className="text-sm text-ink-2">Estimated balance</p>
          <p id="balance-value" className="text-[clamp(1.375rem,6.4vw,1.75rem)] font-semibold tracking-tight">
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
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-surface px-4 font-medium shadow-[0_0_0_1px_var(--ring)]"
        >
          <Icon name={shown ? 'eyeOff' : 'eye'} size={20} />
          {shown ? 'Hide balance' : 'Show balance'}
        </button>
      </div>

      {shown && (
        <p className="mt-2 text-sm text-ink-2">
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
    </section>
  )
}
