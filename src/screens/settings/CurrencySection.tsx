import { useState } from 'react'
import { currencyOptions } from '../../db/currencies'
import { setCurrency, setRate } from '../../db/repo'
import { PickerField } from '../../ui/PickerField'
import { useToast } from '../../ui/toast'
import { card, CURRENCIES, field, Group, Status, type Ledger } from './parts'

/** "1 USD = [83.2] INR". Saves when the field loses focus or Enter is pressed. */
function RateRow({ code, base, rate }: { code: string; base: string; rate: number | undefined }) {
  const toast = useToast()
  const [value, setValue] = useState(rate === undefined ? '' : String(rate))
  const [error, setError] = useState(false)

  async function save() {
    const text = value.trim()
    if (text === '') {
      if (rate !== undefined) await setRate(code, null)
      setError(false)
      return
    }
    const n = Number(text.replace(/,/g, ''))
    if (!Number.isFinite(n) || n <= 0) {
      setError(true)
      return
    }
    setError(false)
    if (n !== rate) {
      await setRate(code, n)
      toast({ message: `${code} rate saved` })
    }
  }

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <label htmlFor={`rate-${code}`} className="flex-1 whitespace-nowrap">
        1 {code} =
      </label>
      <input
        id={`rate-${code}`}
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        placeholder="Not set"
        aria-label={`Value of 1 ${code} in ${base}`}
        aria-invalid={error || undefined}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="min-h-11 w-28 rounded-xl bg-surface-2 shadow-[inset_0_0_0_1px_var(--edge)] px-3 text-right focus-visible:outline-offset-0"
      />
      <span className="w-10 shrink-0 text-ink-2">{base}</span>
    </li>
  )
}

/** The base currency every total is shown in, and the rates used for anything recorded in another. */
export function CurrencySection({ ledger }: { ledger: Ledger }) {
  const { currency, rates, missingRates, txs } = ledger
  const [extra, setExtra] = useState<string[]>([])

  // Foreign currencies that are in use, already have a rate, or that the user just added.
  const used = new Set<string>([...Object.keys(rates), ...missingRates, ...extra])
  for (const t of txs) if (t.originalCurrency) used.add(t.originalCurrency)
  used.delete(currency)
  const rows = [...used].sort()
  const addable = CURRENCIES.filter((c) => c !== currency && !used.has(c))

  return (
    <Group
      id="currency-h"
      title="Currency"
      status={missingRates.length > 0 ? <Status on={false}>Set a rate</Status> : undefined}
    >
      <div className={`${card} p-4`}>
        <label htmlFor="currency" className="text-sm text-ink-2">
          Main currency
        </label>
        <div className="mt-1.5">
          <PickerField
            id="currency"
            title="Main currency"
            value={currency}
            options={currencyOptions([...new Set([currency, ...CURRENCIES])])}
            onChange={(c) => {
              // Totals are shown in the main currency, so once there is something to re-base it is worth a question.
              if (c !== currency && ledger.txs.length > 0 && !window.confirm(`Change your main currency to ${c}? Amounts you have already entered stay as they are, and every total is shown in ${c} from now on. Set a rate for ${currency} afterwards so older amounts convert.`)) return
              void setCurrency(c)
            }}
            className={field}
            showDetail
          />
        </div>
        <p className="mt-2 text-sm text-ink-2">
          All totals and charts are shown in {currency}. Amounts recorded in another currency are converted using the
          rates below. If you change this, set a rate for your older amounts too.
        </p>
      </div>

      {(rows.length > 0 || addable.length > 0) && (
        <div className={`${card} mt-3`}>
          <p className="px-4 pt-4 font-medium">Exchange rates</p>
          <p className="px-4 pb-2 text-sm text-ink-2">
            What one unit of each currency is worth in {currency}. Update them whenever you like; totals recalculate.
          </p>
          {missingRates.length > 0 && (
            <p role="alert" className="mx-4 mb-2 rounded-xl bg-surface-2 px-3 py-2 text-sm text-critical">
              Set a rate for {missingRates.join(', ')}. Until then those amounts are counted at face value.
            </p>
          )}
          {rows.length > 0 && (
            <ul className="divide-y divide-line border-t border-line">
              {rows.map((code) => (
                <RateRow key={code} code={code} base={currency} rate={rates[code]} />
              ))}
            </ul>
          )}
          {addable.length > 0 && (
            <div className="flex items-center gap-3 border-t border-line px-4 py-3">
              <label htmlFor="add-rate" className="text-sm text-ink-2">
                Add a currency
              </label>
              <PickerField
                id="add-rate"
                title="Add a currency"
                value={null}
                placeholder="Choose…"
                options={currencyOptions(addable)}
                onChange={(c) => setExtra((x) => [...x, c])}
                className="min-h-11 flex-1 rounded-xl bg-surface-2 shadow-[inset_0_0_0_1px_var(--edge)] px-3"
              />
            </div>
          )}
        </div>
      )}
    </Group>
  )
}
