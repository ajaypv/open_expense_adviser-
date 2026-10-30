import { localDateString, parseLocalDate } from '../db/money'
import type { Goal } from '../db/schema'

export interface GoalProgress {
  /** 0 to 1; a goal that is saved past its target still shows as full. */
  fraction: number
  remainingMinor: number
  reached: boolean
  /** Whole days from today to the date; negative once it has passed. null without a date. */
  daysLeft: number | null
  /** What to set aside each week or month to make it, when there is a future date to aim for. */
  pace: { amountMinor: number; per: 'week' | 'month' } | null
}

const DAY_MS = 86_400_000
const DAYS_PER_MONTH = 30.4375
/** Past this many days a monthly amount reads better than a weekly one. */
const WEEKLY_UNTIL_DAYS = 60

/** Round up to a whole unit of the currency, so the suggestion is never a few minor units short. */
const wholeUnitUp = (minor: number) => Math.ceil(minor / 100) * 100

export function goalProgress(goal: Goal, today: Date): GoalProgress {
  const remainingMinor = Math.max(0, goal.targetMinor - goal.savedMinor)
  const reached = remainingMinor === 0
  const daysLeft = goal.dueDate
    ? Math.round((parseLocalDate(goal.dueDate).getTime() - parseLocalDate(localDateString(today)).getTime()) / DAY_MS)
    : null

  let pace: GoalProgress['pace'] = null
  if (!reached && daysLeft !== null && daysLeft > 0) {
    if (daysLeft <= WEEKLY_UNTIL_DAYS) {
      pace = { amountMinor: wholeUnitUp(remainingMinor / Math.ceil(daysLeft / 7)), per: 'week' }
    } else {
      pace = { amountMinor: wholeUnitUp(remainingMinor / Math.max(1, Math.ceil(daysLeft / DAYS_PER_MONTH))), per: 'month' }
    }
  }

  return { fraction: Math.min(1, Math.max(0, goal.savedMinor / goal.targetMinor)), remainingMinor, reached, daysLeft, pace }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** "9 days left", "3 weeks left", "Overdue by 2 days". Empty when the goal has no date. */
export function describeTimeLeft(daysLeft: number | null): string {
  if (daysLeft === null) return ''
  if (daysLeft < 0) return `Overdue by ${plural(-daysLeft, 'day')}`
  if (daysLeft === 0) return 'Due today'
  if (daysLeft < 14) return `${plural(daysLeft, 'day')} left`
  if (daysLeft < WEEKLY_UNTIL_DAYS) return `${plural(Math.round(daysLeft / 7), 'week')} left`
  return `${plural(Math.round(daysLeft / DAYS_PER_MONTH), 'month')} left`
}

/** "Due 15 Dec, 9 days left", "Due today", "Overdue by 2 days, was due 28 Oct". Empty when the goal has no date. */
export function describeDue(goal: Goal, today: Date): string {
  if (!goal.dueDate) return ''
  const { daysLeft } = goalProgress(goal, today)
  if (daysLeft === 0) return 'Due today'
  const due = parseLocalDate(goal.dueDate)
  const date = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    ...(due.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  }).format(due)
  const left = describeTimeLeft(daysLeft)
  return daysLeft !== null && daysLeft < 0 ? `${left}, was due ${date}` : `Due ${date}, ${left}`
}

/** What is due soonest first; goals without a date after those with one; reached goals last. */
export function sortGoals(goals: Goal[]): Goal[] {
  const reached = (g: Goal) => g.savedMinor >= g.targetMinor
  return [...goals].sort(
    (a, b) =>
      Number(reached(a)) - Number(reached(b)) ||
      (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99') ||
      a.createdAt - b.createdAt ||
      a.id - b.id,
  )
}

export interface GoalsTotals {
  count: number
  reachedCount: number
  /** What is set aside across all goals, counting no goal for more than it costs. */
  savedMinor: number
  targetMinor: number
}

export function goalsTotals(goals: Goal[]): GoalsTotals {
  let reachedCount = 0
  let savedMinor = 0
  let targetMinor = 0
  for (const g of goals) {
    if (g.savedMinor >= g.targetMinor) reachedCount++
    savedMinor += Math.min(g.savedMinor, g.targetMinor)
    targetMinor += g.targetMinor
  }
  return { count: goals.length, reachedCount, savedMinor, targetMinor }
}
