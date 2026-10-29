import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type FormEvent, type ReactNode, memo } from 'react'
import { backupToJson, downloadFile, transactionsToCsv } from '../data/exporters'
import { clearAllLocations, getPlace, permissionState, setRecordLocation } from '../data/location'
import type { useLedger } from '../data/useLedger'
import { localDateString, toMinor } from '../db/money'
import { setCurrency, setOpeningBalance, setOverallBudget } from '../db/repo'
import { db } from '../db/schema'
import type { ThemePref } from '../theme/useTheme'
import { Icon, type IconName } from '../ui/Icon'
import { useToast } from '../ui/toast'

type Ledger = ReturnType<typeof useLedger>

interface Props {
  ledger: Ledger
  theme: ThemePref
  onTheme: (theme: ThemePref) => void
}

// Currencies with two decimal places only; amounts are stored as hundredths.
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'CAD', 'AUD', 'SGD']

const THEMES: { id: ThemePref; label: string; icon: IconName }[] = [
  { id: 'system', label: 'System', icon: 'monitor' },
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
]

const card = 'rounded-3xl bg-surface shadow-[0_0_0_1px_var(--ring)]'
const field =
  'min-h-12 w-full rounded-xl bg-surface-2 px-3.5 focus-visible:outline-offset-0'
const saveButton = 'min-h-12 shrink-0 rounded-full bg-btn px-5 font-semibold text-btn-ink'
const dangerLink = 'mt-1 min-h-11 rounded-full font-medium text-critical'

/** A titled group: heading outside the card, content inside. */
function Group({ id, title, hint, status, children }: { id: string; title: string; hint?: string; status?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {status}
      </div>
      {hint && <p className="-mt-1 mb-3 px-1 text-ink-2">{hint}</p>}
      {children}
    </section>
  )
}

/** State is always words plus an icon, never color alone. */
function Status({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-2 pr-2.5 text-sm font-medium text-ink-2">
      {on && <Icon name="check" size={14} />}
      {children}
    </span>
  )
}

const LOCATION_PROBLEMS = {
  denied: 'Location is blocked for this app. Allow it in your browser or phone settings, then try again.',
  unavailable: 'Your device could not find its location. Check that location is turned on, then try again.',
  timeout: 'Finding your location took too long. Try again in a moment.',
  unsupported: 'This browser can’t share its location.',
} as const

export const Settings = memo(function Settings({ ledger, theme, onTheme }: Props) {
  const { txs, categories, categoryById, currency, budgetMinor, balanceSet, netMinor } = ledger
  const toast = useToast()
  const locationOn = useLiveQuery(async () => (await db.settings.get('recordLocation'))?.value === true, []) ?? false
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)
  const withLocation = txs.filter((t) => t.location).length

  // The user can switch location off in the browser later; say so instead of silently saving nothing.
  useEffect(() => {
    if (!locationOn) return
    void permissionState().then((s) => setBlocked(s === 'denied'))
  }, [locationOn])

  async function toggleLocation(on: boolean) {
    setLocationError(null)
    if (!on) {
      await setRecordLocation(false)
      return
    }
    // Asking from this tap is what makes the browser show its permission prompt.
    setLocating(true)
    const result = await getPlace(10_000)
    setLocating(false)
    if (!result.ok) {
      setLocationError(LOCATION_PROBLEMS[result.reason])
      return
    }
    setBlocked(false)
    await setRecordLocation(true)
    toast({ message: 'Location will be saved with new transactions' })
  }

  async function removeLocations() {
    if (!window.confirm(`Remove the saved location from ${withLocation} transaction${withLocation === 1 ? '' : 's'}?`)) return
    const n = await clearAllLocations()
    toast({ message: `Removed location from ${n} transaction${n === 1 ? '' : 's'}` })
  }
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
    setBalance('')
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

  const exportRows = [
    { label: 'Back up everything', detail: 'JSON file you can keep safe', run: () => void exportJson() },
    { label: 'Export transactions', detail: 'CSV file for a spreadsheet', run: exportCsv },
  ]

  return (
    <div className="pb-8">
      <h1 className="pt-4 text-3xl font-semibold tracking-tight">Settings</h1>

      <Group id="look-h" title="Appearance">
        <div role="radiogroup" aria-label="Theme" className={`${card} grid grid-cols-3 gap-1 p-1.5`}>
          {THEMES.map((t) => (
            <label
              key={t.id}
              className="flex min-h-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[1.25rem] text-sm font-medium text-ink-2 has-[:checked]:bg-btn has-[:checked]:text-btn-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
            >
              <input
                type="radio"
                name="theme"
                className="sr-only"
                checked={theme === t.id}
                onChange={() => onTheme(t.id)}
              />
              <Icon name={t.icon} size={20} />
              {t.label}
            </label>
          ))}
        </div>
      </Group>

      <Group
        id="budget-h"
        title="Monthly budget"
        status={<Status on={budgetMinor !== null}>{budgetMinor === null ? 'Not set' : 'On'}</Status>}
      >
        <form onSubmit={(e) => void saveBudget(e)} className={`${card} p-4`}>
          <label htmlFor="budget" className="text-sm text-ink-2">
            Limit per month ({currency})
          </label>
          <div className="mt-1.5 flex gap-2">
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
            <button type="submit" className={saveButton}>
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
              className={dangerLink}
            >
              Remove budget
            </button>
          )}
        </form>
      </Group>

      <Group
        id="balance-h"
        title="Balance"
        hint="Tell the app what you have today. It then adds money you receive and subtracts money you send to estimate your balance. It stays hidden on Home until you tap Show balance."
        status={<Status on={balanceSet}>{balanceSet ? 'Set' : 'Not set'}</Status>}
      >
        <form onSubmit={(e) => void saveBalance(e)} className={`${card} p-4`}>
          <label htmlFor="balance" className="text-sm text-ink-2">
            Balance today ({currency})
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="balance"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              placeholder={balanceSet ? 'Enter a new balance to update it' : 'Not set'}
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              aria-invalid={balanceError ? true : undefined}
              aria-describedby={balanceError ? 'balance-error' : 'balance-note'}
              className={field}
            />
            <button type="submit" className={saveButton}>
              Save
            </button>
          </div>
          {balanceError ? (
            <p id="balance-error" role="alert" className="mt-1.5 text-sm text-critical">
              {balanceError}
            </p>
          ) : (
            balanceSet && (
              <p id="balance-note" className="mt-1.5 text-sm text-ink-2">
                Your balance is saved. For privacy it isn&rsquo;t shown here.
              </p>
            )
          )}
          {balanceSet && (
            <button
              type="button"
              onClick={() => {
                void setOpeningBalance(null)
                setBalance('')
                toast({ message: 'Balance cleared' })
              }}
              className={dangerLink}
            >
              Clear balance
            </button>
          )}
        </form>
      </Group>

      <Group
        id="location-h"
        title="Location"
        status={<Status on={locationOn}>{locationOn ? 'On' : 'Off'}</Status>}
      >
        <div className={`${card} p-4`}>
          <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4">
            <span className="font-medium">Save where I add transactions</span>
            <input
              type="checkbox"
              role="switch"
              checked={locationOn}
              disabled={locating}
              onChange={(e) => void toggleLocation(e.target.checked)}
              aria-describedby="location-note"
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="relative h-7 w-12 shrink-0 rounded-full bg-surface-2 shadow-[inset_0_0_0_1px_var(--axis)] transition-colors after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-ink-2 after:transition-transform peer-checked:bg-btn peer-checked:after:translate-x-5 peer-checked:after:bg-btn-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink peer-disabled:opacity-50 motion-reduce:transition-none motion-reduce:after:transition-none"
            />
          </label>
          <p id="location-note" className="mt-2 text-sm text-ink-2">
            {locating
              ? 'Asking for your location…'
              : 'Off by default. When on, new transactions get your approximate position, rounded to about 10 metres. It stays on this device and is never sent anywhere.'}
          </p>
          {locationError && (
            <p role="alert" className="mt-2 text-sm text-critical">
              {locationError}
            </p>
          )}
          {locationOn && blocked && (
            <p role="alert" className="mt-2 text-sm text-critical">
              {LOCATION_PROBLEMS.denied} Nothing is being saved until then.
            </p>
          )}
          {withLocation > 0 && (
            <button type="button" onClick={() => void removeLocations()} className={dangerLink}>
              Remove location from {withLocation} transaction{withLocation === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </Group>

      <Group id="currency-h" title="Currency">
        <div className={`${card} p-4`}>
          <label htmlFor="currency" className="sr-only">
            Currency
          </label>
          <div className="relative">
            <select
              id="currency"
              value={currency}
              onChange={(e) => void setCurrency(e.target.value)}
              className={`${field} appearance-none pr-10`}
            >
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-2">
              <Icon name="chevDown" size={20} />
            </span>
          </div>
          <p className="mt-2 text-sm text-ink-2">
            Changing currency only changes how amounts are shown. Existing amounts are not converted.
          </p>
        </div>
      </Group>

      <Group
        id="data-h"
        title="Your data"
        hint={`${txs.length === 1 ? '1 transaction is' : `${txs.length} transactions are`} stored only on this device. Export a copy now and then, because clearing browser data erases it.`}
      >
        <ul className={`${card} divide-y divide-line px-4`}>
          {exportRows.map((r) => (
            <li key={r.label}>
              <button
                type="button"
                onClick={r.run}
                disabled={txs.length === 0}
                className="flex min-h-16 w-full items-center gap-3 py-2 text-left disabled:opacity-40"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2">
                  <Icon name="download" size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{r.label}</span>
                  <span className="block text-sm text-ink-2">{r.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Group>

      <Group id="ai-h" title="AI assistant" status={<Status on={false}>Coming soon</Status>}>
        <p className={`${card} p-4 text-ink-2`}>
          In the next update you&rsquo;ll add your own API key here. It will stay encrypted on this device.
        </p>
      </Group>
    </div>
  )
})
