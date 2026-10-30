import { useState, type FormEvent } from 'react'
import { formatMoney, localDateString, toMinor } from '../db/money'
import { addGoal, addToGoal, deleteGoal, restoreGoal, updateGoal } from '../db/repo'
import type { Goal } from '../db/schema'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { useToast } from './toast'

const IDEAS = ['New phone', 'Trip', 'Emergency fund', 'Gift']

const field = 'mt-1 min-h-12 w-full rounded-xl bg-surface-2 px-3.5'
const chip =
  'flex min-h-11 cursor-pointer items-center rounded-full bg-surface px-3.5 text-[0.9375rem] shadow-[inset_0_0_0_1px_var(--ring)] ' +
  'has-[:checked]:bg-btn has-[:checked]:text-btn-ink has-[:checked]:shadow-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2'

/** "1,200" or "1200.50" to a number; NaN when it isn't one. */
const parseAmount = (text: string) => Number(text.replace(/,/g, '').trim())

function Header({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 id={id} className="min-w-0 text-xl font-semibold">
        {title}
      </h2>
      <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-surface-2">
        <Icon name="close" />
      </button>
    </div>
  )
}

interface GoalSheetProps {
  open: boolean
  /** The goal to change, or null to make a new one. */
  goal: Goal | null
  today: Date
  onClose: () => void
}

/**
 * Make or change a goal. The fields start from the goal when it opens, so the parent gives this a new
 * `key` each time (the form starts fresh) and the content stays put while the sheet slides away.
 */
export function GoalSheet({ open, goal, today, onClose }: GoalSheetProps) {
  const toast = useToast()
  const [name, setName] = useState(goal?.name ?? '')
  const [target, setTarget] = useState(goal ? String(goal.targetMinor / 100) : '')
  const [saved, setSaved] = useState(goal ? String(goal.savedMinor / 100) : '')
  const [due, setDue] = useState(goal?.dueDate ?? '')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const cost = parseAmount(target)
    const already = saved.trim() === '' ? 0 : parseAmount(saved)
    if (!name.trim()) return setError('Give the goal a name.')
    if (!Number.isFinite(cost) || cost <= 0) return setError('Enter what it costs.')
    if (!Number.isFinite(already) || already < 0) return setError('Saved so far can’t be below 0.')
    try {
      const fields = { name, targetMinor: toMinor(cost), savedMinor: toMinor(already), dueDate: due || undefined }
      if (goal) await updateGoal(goal.id, fields)
      else await addGoal(fields)
      toast({ message: goal ? 'Goal updated' : `Goal added: ${name.trim()}` })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.')
    }
  }

  async function onDelete() {
    if (!goal) return
    const removed = await deleteGoal(goal.id)
    onClose()
    toast({ message: 'Goal deleted', actionLabel: 'Undo', onAction: () => removed && void restoreGoal(removed) })
  }

  return (
    <Dialog open={open} onClose={onClose} labelledBy="goal-title">
      <Header id="goal-title" title={goal ? 'Edit goal' : 'New goal'} onClose={onClose} />
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
        <div>
          <label htmlFor="goal-name" className="text-sm text-ink-2">
            What are you saving for?
          </label>
          <input
            id="goal-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            autoComplete="off"
            placeholder="New phone, Goa trip, a gift"
            className={field}
          />
          {!goal && (
            <div className="mt-2 flex flex-wrap gap-2">
              {IDEAS.map((idea) => (
                <button key={idea} type="button" onClick={() => setName(idea)} className={chip}>
                  {idea}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label htmlFor="goal-target" className="text-sm text-ink-2">
            How much does it cost?
          </label>
          <input
            id="goal-target"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value)
              setError(null)
            }}
            className={field}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 min-[26rem]:grid-cols-2">
          <div>
            <label htmlFor="goal-saved" className="text-sm text-ink-2">
              Saved so far
            </label>
            <input
              id="goal-saved"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={saved}
              onChange={(e) => setSaved(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="goal-date" className="text-sm text-ink-2">
              Date (optional)
            </label>
            <input
              id="goal-date"
              type="date"
              min={goal ? undefined : localDateString(today)}
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className={field}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-critical">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          {goal && (
            <button type="button" onClick={() => void onDelete()} className="min-h-12 rounded-full px-3 font-medium text-critical">
              Delete goal
            </button>
          )}
          <button type="submit" className="min-h-12 flex-1 rounded-full bg-btn font-semibold text-btn-ink">
            Save goal
          </button>
        </div>
      </form>
    </Dialog>
  )
}

interface GoalMoneySheetProps {
  open: boolean
  goal: Goal | null
  currency: string
  onClose: () => void
}

/** Set money aside for a goal, or take some back out. Parent gives this a new `key` for each goal. */
export function GoalMoneySheet({ open, goal, currency, onClose }: GoalMoneySheetProps) {
  const toast = useToast()
  const [mode, setMode] = useState<'add' | 'take'>('add')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const remaining = goal ? Math.max(0, goal.targetMinor - goal.savedMinor) : 0

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!goal) return
    const value = parseAmount(amount)
    if (!Number.isFinite(value) || value <= 0) return setError('Enter an amount above 0.')
    try {
      const minor = toMinor(value)
      const result = await addToGoal(goal.id, mode === 'add' ? minor : -minor)
      onClose()
      if (!result) return
      const moved = formatMoney(Math.abs(result.after - result.before), currency)
      const reached = result.before < goal.targetMinor && result.after >= goal.targetMinor
      toast({
        message: reached ? `Goal reached: ${goal.name}` : mode === 'add' ? `Added ${moved} to ${goal.name}` : `Took ${moved} out of ${goal.name}`,
        actionLabel: 'Undo',
        onAction: () => void updateGoal(goal.id, { savedMinor: result.before }),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} labelledBy="goal-money-title">
      <Header id="goal-money-title" title={goal ? `Add money to ${goal.name}` : 'Add money'} onClose={onClose} />
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="Add money or take it out" className="grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1">
          {(['add', 'take'] as const).map((m) => (
            <label
              key={m}
              className="flex min-h-11 cursor-pointer items-center justify-center rounded-full font-medium has-[:checked]:bg-btn has-[:checked]:text-btn-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
            >
              <input type="radio" name="goal-mode" className="sr-only" checked={mode === m} onChange={() => setMode(m)} />
              {m === 'add' ? 'Add' : 'Take out'}
            </label>
          ))}
        </div>

        <div>
          <label htmlFor="goal-money" className="text-sm text-ink-2">
            Amount
          </label>
          <input
            id="goal-money"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              setError(null)
            }}
            // Important: the global "inputs are at least 1rem" rule would otherwise win over the size.
            className={`${field} text-3xl! font-semibold tabular-nums`}
          />
          {mode === 'add' && remaining > 0 && (
            <button
              type="button"
              onClick={() => setAmount(String(remaining / 100))}
              className={`${chip} mt-2`}
            >
              Fill the rest ({formatMoney(remaining, currency)})
            </button>
          )}
        </div>

        <p className="text-sm text-ink-2">Money you set aside here is only tracked on this goal. It doesn’t change your balance.</p>

        {error && (
          <p role="alert" className="text-sm text-critical">
            {error}
          </p>
        )}

        <button type="submit" className="min-h-12 rounded-full bg-btn font-semibold text-btn-ink">
          {mode === 'add' ? 'Add to goal' : 'Take out'}
        </button>
      </form>
    </Dialog>
  )
}
