import { useRef, useState, type FormEvent } from 'react'
import { INCOME_CATEGORY } from '../db/defaultCategories'
import { isRealDate, localDateString, parseLocalDate, toMinor } from '../db/money'
import { addRecurring, deleteRecurring, updateRecurring } from '../db/repo'
import type { Account, Category, Recurring, RecurringTag } from '../db/schema'
import { defaultAccountId } from '../insights/accounts'
import { TAG_LABELS } from '../insights/upcoming'
import { Switch } from '../screens/settings/parts'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { PickerField } from './PickerField'
import { useToast } from './toast'

const field = 'mt-1 min-h-12 w-full rounded-xl bg-surface-2 shadow-[inset_0_0_0_1px_var(--edge)] px-3.5'
const chip =
  'flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-surface px-3.5 text-[0.9375rem] font-medium shadow-[inset_0_0_0_1px_var(--ring)] ' +
  'has-[:checked]:bg-btn has-[:checked]:text-btn-ink has-[:checked]:shadow-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2'

const OUT_TAGS: RecurringTag[] = ['loan', 'autopay', 'subscription', 'bill', 'other']
const IN_TAGS: RecurringTag[] = ['income', 'other']

const TAG_DETAIL: Record<RecurringTag, string> = {
  loan: 'Home, car or personal loan',
  autopay: 'A mandate you set up in a UPI app',
  subscription: 'Streaming, apps and memberships',
  bill: 'Electricity, internet, rent',
  income: 'Salary, rent received, pension',
  other: 'Anything else that repeats',
}

/** The category an expense is filed under when none is chosen, by what kind of payment it is. */
const DEFAULT_CATEGORY: Record<RecurringTag, string> = {
  loan: 'Bills & Utilities',
  autopay: 'Other',
  subscription: 'Entertainment & Travel',
  bill: 'Bills & Utilities',
  income: INCOME_CATEGORY,
  other: 'Other',
}

/** "12,500" or "12500.50" to a number; NaN when it isn't one. */
const parseAmount = (text: string) => Number(text.replace(/,/g, '').trim())

interface Props {
  open: boolean
  /** The payment to change, or null to add a new one. */
  rule: Recurring | null
  categories: Category[]
  accounts: Account[]
  currency: string
  today: Date
  onClose: () => void
}

/**
 * Add or change a regular payment: a loan EMI, a UPI AutoPay, a subscription, a bill, or money that comes in
 * like a salary. The fields start from the payment when the sheet opens, so the parent gives this a new `key`
 * each time and the form starts fresh.
 */
export function RuleSheet({ open, rule, categories, accounts, currency, today, onClose }: Props) {
  const toast = useToast()
  const [kind, setKind] = useState<'expense' | 'income'>(rule?.kind ?? 'expense')
  const [name, setName] = useState(rule?.merchant ?? '')
  const [amount, setAmount] = useState(rule ? String(rule.amountMinor / 100) : '')
  const [tag, setTag] = useState<RecurringTag>(rule?.tag ?? (rule?.kind === 'income' ? 'income' : 'other'))
  const [frequency, setFrequency] = useState<Recurring['frequency']>(rule?.frequency ?? 'monthly')
  const [date, setDate] = useState(rule?.nextDue ?? localDateString(today))
  const [accountId, setAccountId] = useState<number | undefined>(rule?.accountId ?? defaultAccountId(accounts))
  // null means "follow the type": a loan goes under Bills, a subscription under Entertainment.
  const [categoryId, setCategoryId] = useState<number | null>(rule?.categoryId ?? null)
  const [paused, setPaused] = useState(rule ? !rule.active : false)
  const [error, setError] = useState<string | null>(null)
  const saving = useRef(false)

  const income = kind === 'income'
  const tags = income ? IN_TAGS : OUT_TAGS
  const categoryNamed = (n: string) => categories.find((c) => c.name === n)?.id ?? categories[0]?.id ?? 0
  const expenseCategories = categories.filter((c) => c.name !== INCOME_CATEGORY)

  function chooseKind(next: 'expense' | 'income') {
    setKind(next)
    const allowed = next === 'income' ? IN_TAGS : OUT_TAGS
    // A specific type that still fits stays; otherwise the direction picks its usual one.
    if (!allowed.includes(tag) || tag === 'other') setTag(next === 'income' ? 'income' : 'other')
    setError(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (saving.current) return
    const value = parseAmount(amount)
    if (!name.trim()) return setError('Give it a name, like “Home loan”.')
    if (!Number.isFinite(value) || value <= 0) return setError('Enter an amount, like 12500.')
    if (!isRealDate(date)) return setError('Choose the date of the next payment.')
    saving.current = true
    try {
      const fields = {
        kind,
        amountMinor: toMinor(value),
        currency: rule?.currency || currency,
        categoryId: income ? categoryNamed(INCOME_CATEGORY) : (categoryId ?? categoryNamed(DEFAULT_CATEGORY[tag])),
        merchant: name.trim(),
        note: rule?.note ?? '',
        paymentMethod: rule?.paymentMethod ?? '',
        accountId,
        frequency,
        nextDue: date,
        // The day of the month it keeps to, so a payment for the 31st returns to the 31st after a short month.
        anchorDay: parseLocalDate(date).getDate(),
        tag,
        active: !paused,
      }
      if (rule) await updateRecurring(rule.id, fields)
      else await addRecurring(fields)
      toast({ message: rule ? 'Changes saved' : `Added ${name.trim()}` })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save. Try again.')
    } finally {
      saving.current = false
    }
  }

  async function onDelete() {
    if (!rule) return
    if (!window.confirm(`Stop tracking “${rule.merchant || 'this payment'}”? Payments already added stay.`)) return
    await deleteRecurring(rule.id)
    toast({ message: `Removed ${rule.merchant || 'the payment'}` })
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} labelledBy="rule-title">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="rule-title" className="min-w-0 text-xl font-semibold">
          {rule ? 'Edit regular payment' : 'New regular payment'}
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-surface-2">
          <Icon name="close" />
        </button>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="Direction" className="grid grid-cols-2 gap-2">
          {(
            [
              ['expense', 'Going out'],
              ['income', 'Coming in'],
            ] as const
          ).map(([id, label]) => (
            <label key={id} className={chip}>
              <input type="radio" name="rule-kind" className="sr-only" checked={kind === id} onChange={() => chooseKind(id)} />
              {label}
            </label>
          ))}
        </div>

        <div>
          <label htmlFor="rule-tag" className="text-sm text-ink-2">
            Type
          </label>
          <PickerField
            id="rule-tag"
            title="Type"
            value={tag}
            options={tags.map((t) => ({ value: t, label: TAG_LABELS[t], detail: TAG_DETAIL[t] }))}
            onChange={setTag}
            className={field}
          />
        </div>

        <div>
          <label htmlFor="rule-name" className="text-sm text-ink-2">
            Name
          </label>
          <input
            id="rule-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            autoComplete="off"
            placeholder={income ? 'Salary' : 'Home loan, Netflix, Electricity'}
            className={field}
          />
        </div>

        <div>
          <label htmlFor="rule-amount" className="text-sm text-ink-2">
            Amount
          </label>
          <input
            id="rule-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              setError(null)
            }}
            className={field}
          />
        </div>

        <div role="radiogroup" aria-label="How often" className="grid grid-cols-2 gap-2">
          {(
            [
              ['monthly', 'Every month'],
              ['weekly', 'Every week'],
            ] as const
          ).map(([id, label]) => (
            <label key={id} className={chip}>
              <input type="radio" name="rule-frequency" className="sr-only" checked={frequency === id} onChange={() => setFrequency(id)} />
              {label}
            </label>
          ))}
        </div>

        <div>
          <label htmlFor="rule-date" className="text-sm text-ink-2">
            Next payment date
          </label>
          <input
            id="rule-date"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value)
              setError(null)
            }}
            className={field}
          />
        </div>

        {accounts.length > 1 && (
          <div>
            <label htmlFor="rule-account" className="text-sm text-ink-2">
              Account
            </label>
            <PickerField
              id="rule-account"
              title="Account"
              value={accountId ?? null}
              options={accounts.filter((a) => !a.archived || a.id === accountId).map((a) => ({ value: a.id, label: a.name }))}
              onChange={setAccountId}
              className={field}
            />
          </div>
        )}

        {!income && (
          <div>
            <label htmlFor="rule-category" className="text-sm text-ink-2">
              Category
            </label>
            <PickerField
              id="rule-category"
              title="Category"
              value={categoryId ?? categoryNamed(DEFAULT_CATEGORY[tag])}
              options={expenseCategories.map((c) => ({ value: c.id, label: c.name }))}
              onChange={setCategoryId}
              className={field}
            />
          </div>
        )}

        {rule && <Switch label="Pause this payment" detail="It is left out of what is coming up, and Home stops offering it, until you turn it back on." checked={paused} onChange={setPaused} />}

        {error && (
          <p role="alert" className="flex items-center gap-2 text-critical">
            <Icon name="warn" size={18} />
            {error}
          </p>
        )}

        <button type="submit" className="min-h-12 w-full rounded-full bg-btn font-semibold text-btn-ink">
          {rule ? 'Save changes' : 'Add payment'}
        </button>
        {rule && (
          <button type="button" onClick={() => void onDelete()} className="min-h-11 rounded-full font-medium text-critical">
            Delete this payment
          </button>
        )}
      </form>
    </Dialog>
  )
}
