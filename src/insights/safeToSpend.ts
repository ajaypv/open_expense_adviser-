import { daysInMonth } from './aggregates'

/** How much of the month's budget can still be spent today, and where the month stands against an even pace. */
export interface SafeToSpend {
  budgetMinor: number
  /** Spent this month so far, today included. */
  spentMinor: number
  /** Of that, what today has already taken. */
  todayMinor: number
  /** Days from today to the end of the month, today included. */
  daysLeft: number
  /** What each of those days can take: what was left before today, spread over them, to a whole currency unit. */
  perDayMinor: number
  /** What is left of today's share, never below zero. */
  leftTodayMinor: number
  /** Where an even month would be by the end of today. */
  evenPaceMinor: number
  /** Spent minus the even pace: above zero is more than an even month would have spent by now. */
  paceDiffMinor: number
  /** Spent and the even pace as shares of the budget, 0 to 1. */
  spentShare: number
  paceShare: number
  /** The whole budget is already used, so there is no share of today to speak of. */
  over: boolean
}

/**
 * "Can I spend today?": the budget that was left when the day began, spread over the days from today to the end of the month, less
 * what today has already taken. With no budget, nothing is said. Once the budget is used up, `over` is true and the day's share is zero.
 */
export function safeToSpend({ budgetMinor, spentMinor, todayMinor, today }: { budgetMinor: number; spentMinor: number; todayMinor: number; today: Date }): SafeToSpend | null {
  if (!(budgetMinor > 0)) return null
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const days = daysInMonth(key)
  const dayOfMonth = Math.min(today.getDate(), days)
  const daysLeft = days - dayOfMonth + 1
  const roomBeforeToday = budgetMinor - (spentMinor - todayMinor)
  const perDayMinor = Math.max(0, Math.floor(roomBeforeToday / daysLeft / 100) * 100)
  const over = spentMinor >= budgetMinor
  const evenPaceMinor = Math.round((budgetMinor * dayOfMonth) / days)
  return {
    budgetMinor,
    spentMinor,
    todayMinor,
    daysLeft,
    perDayMinor,
    leftTodayMinor: over ? 0 : Math.max(0, perDayMinor - todayMinor),
    evenPaceMinor,
    paceDiffMinor: spentMinor - evenPaceMinor,
    spentShare: Math.min(1, spentMinor / budgetMinor),
    paceShare: Math.min(1, evenPaceMinor / budgetMinor),
    over,
  }
}
