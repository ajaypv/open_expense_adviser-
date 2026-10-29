import { useEffect, useState, type FormEvent } from 'react'
import { backupToJson, downloadFile, transactionsToCsv } from '../data/exporters'
import type { useLedger } from '../data/useLedger'
import { localDateString, toMinor } from '../db/money'
import { setCurrency, setOpeningBalance, setOverallBudget } from '../db/repo'
import { db } from '../db/schema'
import type { ThemePref } from '../theme/useTheme'
import { Icon } from '../ui/Icon'
import { useToast } from '../ui/toast'

type Ledger = ReturnType<typeof useLedger>

interface Props {
  ledger: Ledger
  theme: ThemePref
  onTheme: (theme: ThemePref) => void
}

// Currencies with two decimal places only; amounts are stored as hundredths.
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'CAD', 'AUD', 'SGD']

const THEMES: { id: ThemePref; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

const field = 'min-h-12 w-full rounded-xl bg-surface-2 px-3.5'
const secondaryButton = 'flex min-h-12 items-center gap-2 rounded-full px-4 font-medium shadow-[0_0_0_1px_var(--ring)]'

export function Settings({ ledger, theme, onTheme }: Props) {
  const { txs, categories, categoryById, currency, budgetMinor, balanceSet, netMinor } = ledger
  const toast = useToast()
  const [budget, setBudget] = useState('')
  const [budgetError, setBudgetError] = useState<string | null>(null)
  const [balance, setBalance] = useState('')
  const [balanceError, setBalanceError] = useState<string | null>(null)

  useEffect(() => {
    setBudget(budgetMinor === null ? '' : String(budgetMinor / 100))
  }, [budgetMinor])

  // The field is deliberately never prefilled: showing the current estimate here would reveal a
  // balance the user has chosen to keep hidden on Home.
  /** The user tells us their balance today; we store the opening balance that makes the estimate match. */
  async function saveBalance(e: FormEvent) {
    e.preventDefault()
    const value = Number(balance.replace(/,/g, ''))
    if (balance.trim() === '' || !Number.isFinite(value)) {
      setBalanceError('Enter your balance as a number. A negative number is fine.')
      return
    }
    setBalanceError(null)
    await setOpeningBalance(toMinor(value) - netMinor)
    toast({ message: 'Balance saved' })
  }

  async function saveBudget(e: FormEvent) {
    e.preventDefault()
    const value = Number(budget.replace(/,/g, ''))
    if (!Number.isFinite(value) || value <= 0) {
      setBudgetError('Enter a budget above 0, or use Remove budget.')
      return
    }
    setBudgetError(null)
    await setOverallBudget(toMinor(value))
    toast({ message: 'Budget saved' })
  }

  async function exportJson() {
    const budgets = await db.budgets.toArray()
    downloadFile(
      `expenses-backup-${localDateString()}.json`,
      'application/json',
      backupToJson({
        currency,
        categories,
        transactions: txs,
        budgets,
        openingBalanceMinor: balanceSet ? ledger.estimatedBalanceMinor - netMinor : null,
      }),
    )
  }

  function exportCsv() {
    downloadFile(`expenses-${localDateString()}.csv`, 'text/csv', transactionsToCsv(txs, categoryById))
  }

  return (
    <div className="pb-8">
      <h1 className="pt-4 text-3xl font-semibold tracking-tight">Settings</h1>

      <section aria-labelledby="look-h" className="mt-6">
        <h2 id="look-h" className="mb-3 text-lg font-semibold">
          Appearance
        </h2>
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-full bg-surface-2 p-1">
          {THEMES.map((t) => (
            <label
              key={t.id}
              className="flex min-h-11 cursor-pointer items-center justify-center rounded-full font-medium has-[:checked]:bg-btn has-[:checked]:text-btn-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
            >
              <input
                type="radio"
                name="theme"
                className="sr-only"
                checked={theme === t.id}
                onChange={() => onTheme(t.id)}
              />
              {t.label}
            </label>
          ))}
        </div>
      </section>

      <section aria-labelledby="money-h" className="mt-10">
        <h2 id="money-h" className="mb-3 text-lg font-semibold">
          Money
        </h2>
        <label htmlFor="currency" className="text-sm text-ink-2">
          Currency
        </label>
        <select
          id="currency"
          value={currency}
          onChange={(e) => void setCurrency(e.target.value)}
          className={`${field} mt-1`}
        >
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <p className="mt-2 text-sm text-ink-2">
          Changing currency only changes how amounts are shown. Existing amounts are not converted.
        </p>

        <form onSubmit={(e) => void saveBudget(e)} className="mt-6">
          <label htmlFor="budget" className="text-sm text-ink-2">
            Monthly budget ({currency})
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="budget"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              placeholder="No budget set"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              aria-invalid={budgetError ? true : undefined}
              aria-describedby={budgetError ? 'budget-error' : undefined}
              className={field}
            />
            <button type="submit" className="min-h-12 shrink-0 rounded-full bg-btn px-5 font-semibold text-btn-ink">
              Save
            </button>
          </div>
          {budgetError && (
            <p id="budget-error" role="alert" className="mt-1.5 text-sm text-critical">
              {budgetError}
            </p>
          )}
          {budgetMinor !== null && (
            <button
              type="button"
              onClick={() => {
                void setOverallBudget(null)
                toast({ message: 'Budget removed' })
              }}
              className="mt-2 min-h-11 rounded-full px-1 font-medium text-critical"
            >
              Remove budget
            </button>
          )}
        </form>
      </section>

      <section aria-labelledby="balance-h" className="mt-10">
        <h2 id="balance-h" className="mb-1 text-lg font-semibold">
          Balance
        </h2>
        <p className="mb-3 text-ink-2">
          Tell the app what you have today. From then on it adds money you receive and subtracts money you send to
          estimate your balance. It stays hidden on Home until you tap Show balance.
          {balanceSet && ' Your balance is set; for privacy it isn’t shown here.'}
        </p>
        <form onSubmit={(e) => void saveBalance(e)}>
          <label htmlFor="balance" className="text-sm text-ink-2">
            Balance today ({currency})
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="balance"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              placeholder={balanceSet ? 'Enter a new balance to update it' : 'Not set'}
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              aria-invalid={balanceError ? true : undefined}
              aria-describedby={balanceError ? 'balance-error' : undefined}
              className={field}
            />
            <button type="submit" className="min-h-12 shrink-0 rounded-full bg-btn px-5 font-semibold text-btn-ink">
              Save
            </button>
          </div>
          {balanceError && (
            <p id="balance-error" role="alert" className="mt-1.5 text-sm text-critical">
              {balanceError}
            </p>
          )}
          {balanceSet && (
            <button
              type="button"
              onClick={() => {
                void setOpeningBalance(null)
                setBalance('')
                toast({ message: 'Balance cleared' })
              }}
              className="mt-2 min-h-11 rounded-full px-1 font-medium text-critical"
            >
              Clear balance
            </button>
          )}
        </form>
      </section>

      <section aria-labelledby="data-h" className="mt-10">
        <h2 id="data-h" className="mb-1 text-lg font-semibold">
          Your data
        </h2>
        <p className="mb-3 text-ink-2">
          Everything is stored only on this device, so export a copy now and then. Clearing browser data erases it.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void exportJson()} className={secondaryButton} disabled={txs.length === 0}>
            <Icon name="download" size={20} />
            Back up (JSON)
          </button>
          <button type="button" onClick={exportCsv} className={secondaryButton} disabled={txs.length === 0}>
            <Icon name="download" size={20} />
            Export (CSV)
          </button>
        </div>
      </section>

      <section aria-labelledby="ai-h" className="mt-10">
        <h2 id="ai-h" className="mb-1 text-lg font-semibold">
          AI assistant
        </h2>
        <p className="text-ink-2">
          Not set up yet. In the next update you&rsquo;ll add your own API key here, and it will stay encrypted on this
          device.
        </p>
      </section>
    </div>
  )
}
