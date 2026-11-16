import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { markOnboarded, markVersionSeen } from '../data/appState'
import { toMinor } from '../db/money'
import { setAccountOpening, setCurrency, setOverallBudget } from '../db/repo'
import { defaultAccountId } from '../insights/accounts'
import type { Account } from '../db/schema'
import { APP_VERSION } from '../pwa/version'
import { currencyOptions } from '../db/currencies'
import { CURRENCIES } from '../screens/settings/parts'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { PickerField } from './PickerField'

const toNumber = (text: string) => Number(text.replace(/,/g, ''))

/** The three questions, one to a screen. */
const STEPS = ['currency', 'balance', 'budget'] as const
type Step = (typeof STEPS)[number]

const field = 'mt-8 min-h-16 w-full rounded-2xl bg-surface px-5 text-2xl text-ink shadow-[inset_0_0_0_1px_var(--ring)] placeholder:text-muted focus:outline-none focus:shadow-[inset_0_0_0_2px_var(--ink)]'

/**
 * First launch, after the cards and the ask for notifications: three optional questions, one to a screen, in the same theme colours
 * (light unless the person has chosen otherwise) so it reads as one way in. A bar of dots says how far along it is, Skip leaves at any point, and nothing is saved until the
 * last screen (or the Skip, which saves nothing). Everything can be left empty.
 */
export function Welcome({ open, currency, accounts }: { open: boolean; currency: string; accounts: Account[] }) {
  const [step, setStep] = useState<Step>('currency')
  const [chosen, setChosen] = useState(currency)
  const [balance, setBalance] = useState('')
  const [budget, setBudget] = useState('')
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()
  const main = useRef<HTMLDivElement>(null)
  const index = STEPS.indexOf(step)

  // Each screen puts you at its question: the box for a number, the button otherwise.
  useEffect(() => {
    if (!open) return
    const target = main.current?.querySelector<HTMLElement>('input, [data-primary]')
    target?.focus()
  }, [open, step])

  /** However the dialog ends, the welcome is done and never comes back. */
  async function finish() {
    await markOnboarded()
    await markVersionSeen(APP_VERSION)
  }

  const bad = (text: string, positive = false) => {
    if (text.trim() === '') return false
    const n = toNumber(text)
    return !Number.isFinite(n) || (positive && n <= 0)
  }

  async function save() {
    const bal = balance.trim() === '' ? null : toNumber(balance)
    const bud = budget.trim() === '' ? null : toNumber(budget)
    await setCurrency(chosen)
    const account = defaultAccountId(accounts)
    // Nothing is logged yet, so what they hold today is also what they held to begin with.
    if (bal !== null && account !== undefined) await setAccountOpening(account, toMinor(bal))
    if (bud !== null) await setOverallBudget(toMinor(bud))
    await finish()
  }

  async function next(e: FormEvent) {
    e.preventDefault()
    if (step === 'balance' && bad(balance)) return setError('Use numbers only. Leave a box empty to skip it.')
    if (step === 'budget') {
      if (bad(budget, true) || bad(balance)) {
        // Say which screen the problem is on.
        if (bad(balance)) setStep('balance')
        return setError('Use numbers only. Leave a box empty to skip it.')
      }
      return void save()
    }
    setError(null)
    setStep(STEPS[index + 1])
  }

  function back() {
    setError(null)
    setStep(STEPS[Math.max(index - 1, 0)])
  }

  return (
    <Dialog open={open} onClose={() => void finish()} labelledBy={titleId} variant="page">
      <div className="min-h-dvh bg-bg text-ink">
        <form onSubmit={(e) => void next(e)} className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between">
            <button type="button" onClick={back} aria-label="Back" disabled={index === 0} className="flex size-11 items-center justify-center rounded-full text-ink disabled:opacity-0">
              <Icon name="chevLeft" size={24} />
            </button>
            <div role="img" aria-label={`Question ${index + 1} of ${STEPS.length}`} className="flex gap-1.5">
              {STEPS.map((s, i) => (
                <span key={s} className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? 'w-6 bg-ink' : 'w-1.5 bg-ink/25'}`} />
              ))}
            </div>
            <button type="button" onClick={() => void finish()} aria-label="Skip for now" className="min-h-11 rounded-full px-3 text-lg font-medium text-ink">
              Skip
            </button>
          </div>

          <div ref={main} key={step} className="intro-rise mt-10 flex-1">
            <p className="text-sm font-medium tracking-wide text-ink-2">{`${index + 1} of ${STEPS.length}`}</p>

            {step === 'currency' && (
              <>
                <h2 id={titleId} className="type-title mt-2 text-[clamp(1.875rem,1.6rem+1.3vw,2.25rem)] font-medium">
                  Welcome. Which currency do you use?
                </h2>
                <p className="mt-3 text-lg text-ink-2 text-pretty">Everything stays on this device. Three quick questions, all optional.</p>
                <label htmlFor="w-currency" className="sr-only">
                  Currency
                </label>
                <PickerField
                  id="w-currency"
                  title="Currency"
                  value={chosen}
                  options={currencyOptions([...new Set([chosen, ...CURRENCIES])])}
                  onChange={setChosen}
                  className={field}
                  showDetail
                />
              </>
            )}

            {step === 'balance' && (
              <>
                <h2 id={titleId} className="type-title mt-2 text-[clamp(1.875rem,1.6rem+1.3vw,2.25rem)] font-medium">
                  How much money do you have today?
                </h2>
                <p className="mt-3 text-lg text-ink-2 text-pretty">Used for an estimated balance that stays hidden until you show it.</p>
                <label htmlFor="w-balance" className="sr-only">
                  Money you have today ({chosen})
                </label>
                <div className="relative">
                  <input id="w-balance" inputMode="decimal" autoComplete="off" placeholder="Optional" value={balance} onChange={(e) => setBalance(e.target.value)} className={`${field} pr-20`} />
                  <span aria-hidden="true" className="absolute right-5 top-1/2 mt-4 -translate-y-1/2 text-lg text-ink-2">
                    {chosen}
                  </span>
                </div>
              </>
            )}

            {step === 'budget' && (
              <>
                <h2 id={titleId} className="type-title mt-2 text-[clamp(1.875rem,1.6rem+1.3vw,2.25rem)] font-medium">
                  Want to set a monthly budget?
                </h2>
                <p className="mt-3 text-lg text-ink-2 text-pretty">You will see how much is left as you spend.</p>
                <label htmlFor="w-budget" className="sr-only">
                  Monthly budget ({chosen})
                </label>
                <div className="relative">
                  <input id="w-budget" inputMode="decimal" autoComplete="off" placeholder="Optional" value={budget} onChange={(e) => setBudget(e.target.value)} className={`${field} pr-20`} />
                  <span aria-hidden="true" className="absolute right-5 top-1/2 mt-4 -translate-y-1/2 text-lg text-ink-2">
                    {chosen}
                  </span>
                </div>
                <p className="mt-8 rounded-2xl bg-surface-2 p-4 text-ink-2">
                  After this, just type what you spend in the bar at the bottom, like “Uber 230 yesterday”. Back up from Settings now and then, since your data lives only here.
                </p>
              </>
            )}

            {error && (
              <p role="alert" className="mt-4 text-critical">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            data-primary
            className="mt-6 min-h-14 w-full rounded-full bg-btn text-xl font-semibold text-btn-ink active:opacity-80"
          >
            {step === 'budget' ? 'Get started' : 'Continue'}
          </button>
        </form>
      </div>
    </Dialog>
  )
}
