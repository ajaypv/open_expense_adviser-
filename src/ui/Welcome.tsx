import { useState, type FormEvent } from 'react'
import { markOnboarded, markVersionSeen } from '../data/appState'
import { toMinor } from '../db/money'
import { setAccountOpening, setCurrency, setOverallBudget } from '../db/repo'
import { defaultAccountId } from '../insights/accounts'
import type { Account } from '../db/schema'
import { APP_VERSION } from '../pwa/version'
import { currencyOptions } from '../db/currencies'
import { CURRENCIES } from '../screens/settings/parts'
import { Dialog } from './Dialog'
import { PickerField } from './PickerField'

const input = 'mt-1 min-h-12 w-full rounded-xl bg-surface-2 shadow-[inset_0_0_0_1px_var(--edge)] px-3.5'

const toNumber = (text: string) => Number(text.replace(/,/g, ''))

/** First launch: three optional questions, so the first screen already shows something useful. */
export function Welcome({ open, currency, accounts }: { open: boolean; currency: string; accounts: Account[] }) {
  const [chosen, setChosen] = useState(currency)
  const [balance, setBalance] = useState('')
  const [budget, setBudget] = useState('')
  const [error, setError] = useState<string | null>(null)

  /** However the dialog ends, the welcome is done and never comes back. */
  async function finish() {
    await markOnboarded()
    await markVersionSeen(APP_VERSION)
  }

  async function start(e: FormEvent) {
    e.preventDefault()
    const bal = balance.trim() === '' ? null : toNumber(balance)
    const bud = budget.trim() === '' ? null : toNumber(budget)
    if ((bal !== null && !Number.isFinite(bal)) || (bud !== null && (!Number.isFinite(bud) || bud <= 0))) {
      setError('Use numbers only. Leave a box empty to skip it.')
      return
    }
    await setCurrency(chosen)
    const account = defaultAccountId(accounts)
    // Nothing is logged yet, so what they hold today is also what they held to begin with.
    if (bal !== null && account !== undefined) await setAccountOpening(account, toMinor(bal))
    if (bud !== null) await setOverallBudget(toMinor(bud))
    await finish()
  }

  return (
    <Dialog open={open} onClose={() => void finish()} labelledBy="welcome-title">
      <h2 id="welcome-title" className="text-2xl font-semibold tracking-tight">
        Welcome
      </h2>
      <p className="mt-1 text-ink-2">Everything stays on this device. Three quick things, all optional.</p>
      <p className="mt-2 text-ink-2">After that, just type what you spend in the bar at the bottom, like “Uber 230 yesterday”. Back up from Settings now and then, since your data lives only here.</p>

      <form onSubmit={(e) => void start(e)} className="mt-4 space-y-4">
        <div>
          <label htmlFor="w-currency" className="text-sm text-ink-2">
            Currency
          </label>
          <PickerField
            id="w-currency"
            title="Currency"
            value={chosen}
            options={currencyOptions([...new Set([chosen, ...CURRENCIES])])}
            onChange={setChosen}
            className={input}
            showDetail
          />
        </div>
        <div>
          <label htmlFor="w-balance" className="text-sm text-ink-2">
            Money you have today ({chosen})
          </label>
          <input id="w-balance" inputMode="decimal" autoComplete="off" placeholder="Skip for now" value={balance} onChange={(e) => setBalance(e.target.value)} className={input} />
          <p className="mt-1 text-sm text-ink-2">Used for an estimated balance that stays hidden until you show it.</p>
        </div>
        <div>
          <label htmlFor="w-budget" className="text-sm text-ink-2">
            Monthly budget ({chosen})
          </label>
          <input id="w-budget" inputMode="decimal" autoComplete="off" placeholder="Skip for now" value={budget} onChange={(e) => setBudget(e.target.value)} className={input} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-critical">
            {error}
          </p>
        )}
        <button type="submit" className="min-h-12 w-full rounded-full bg-btn font-semibold text-btn-ink">
          Get started
        </button>
        <button
          type="button"
          onClick={() => void finish()}
          className="min-h-11 w-full rounded-full font-medium underline underline-offset-2"
        >
          Skip for now
        </button>
      </form>
    </Dialog>
  )
}
