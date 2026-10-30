import { useEffect, useState, type FormEvent } from 'react'
import { toMinor } from '../../db/money'
import { setCategoryBudget, setOverallBudget } from '../../db/repo'
import type { Category } from '../../db/schema'
import { useToast } from '../../ui/toast'
import { card, dangerLink, field, Group, saveButton, Status, type Ledger } from './parts'

/** One category's monthly limit. Saves when the field loses focus or Enter is pressed. */
function CategoryBudgetRow({ category, limitMinor, currency }: { category: Category; limitMinor: number | undefined; currency: string }) {
  const toast = useToast()
  const [value, setValue] = useState(limitMinor === undefined ? '' : String(limitMinor / 100))
  const [error, setError] = useState(false)

  useEffect(() => {
    setValue(limitMinor === undefined ? '' : String(limitMinor / 100))
  }, [limitMinor])

  async function save() {
    const text = value.trim()
    if (text === '') {
      if (limitMinor !== undefined) {
        await setCategoryBudget(category.id, null)
        toast({ message: `${category.name} limit removed` })
      }
      setError(false)
      return
    }
    const n = Number(text.replace(/,/g, ''))
    if (!Number.isFinite(n) || n <= 0) {
      setError(true)
      return
    }
    setError(false)
    if (toMinor(n) !== limitMinor) {
      await setCategoryBudget(category.id, toMinor(n))
      toast({ message: `${category.name} limit saved` })
    }
  }

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: category.color }} />
      <label htmlFor={`cb-${category.id}`} className="min-w-0 flex-1 truncate">
        {category.name}
      </label>
      <input
        id={`cb-${category.id}`}
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        placeholder="No limit"
        aria-label={`${category.name} monthly limit (${currency})`}
        aria-invalid={error || undefined}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="min-h-11 w-28 rounded-xl bg-surface-2 shadow-[inset_0_0_0_1px_var(--edge)] px-3 text-right focus-visible:outline-offset-0"
      />
    </li>
  )
}

export function BudgetSection({ ledger }: { ledger: Ledger }) {
  const { currency, budgetMinor, expenseCategories, categoryBudgets } = ledger
  const toast = useToast()
  const [budget, setBudget] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setBudget(budgetMinor === null ? '' : String(budgetMinor / 100))
  }, [budgetMinor])

  async function save(e: FormEvent) {
    e.preventDefault()
    const value = Number(budget.replace(/,/g, ''))
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a budget above 0, or use Remove budget.')
      return
    }
    setError(null)
    await setOverallBudget(toMinor(value))
    toast({ message: 'Budget saved' })
  }

  return (
    <Group
      id="budget-h"
      title="Monthly budget"
      status={<Status on={budgetMinor !== null}>{budgetMinor === null ? 'Not set' : 'On'}</Status>}
    >
      <form onSubmit={(e) => void save(e)} className={`${card} p-4`}>
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
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'budget-error' : undefined}
            className={field}
          />
          <button type="submit" className={saveButton}>
            Save
          </button>
        </div>
        {error && (
          <p id="budget-error" role="alert" className="mt-1.5 text-sm text-critical">
            {error}
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

      <details className={`${card} group mt-3`}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block font-medium">Limits by category</span>
            <span className="block text-sm text-ink-2">
              {categoryBudgets.size === 0 ? 'None set' : `${categoryBudgets.size} set`}. They appear in Insights.
            </span>
          </span>
          <span className="text-sm font-medium underline underline-offset-2 group-open:hidden">Edit</span>
          <span className="hidden text-sm font-medium underline underline-offset-2 group-open:inline">Close</span>
        </summary>
        <ul className="divide-y divide-line border-t border-line">
          {expenseCategories.map((c) => (
            <CategoryBudgetRow key={c.id} category={c} limitMinor={categoryBudgets.get(c.id)} currency={currency} />
          ))}
        </ul>
      </details>
    </Group>
  )
}
