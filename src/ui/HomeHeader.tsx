import type { Goal } from '../db/schema'
import { GoalsButton } from './GoalsButton'

let dateFormat: Intl.DateTimeFormat | undefined

interface Props {
  today: Date
  goals: Goal[]
  onOpenGoals: () => void
}

/**
 * The top of Home, laid out like an app bar: where we are (today's date) on the left, the one
 * action that belongs to the whole screen (goals) on the right. The month switcher sits below, since
 * it changes what the page shows rather than being part of the title.
 */
export function HomeHeader({ today, goals, onOpenGoals }: Props) {
  const date = (dateFormat ??= new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })).format(today)
  return (
    <header className="flex items-center justify-between gap-3 pt-3">
      <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight">
        <span className="sr-only">Home, </span>
        {date}
      </h1>
      <GoalsButton goals={goals} onClick={onOpenGoals} />
    </header>
  )
}
