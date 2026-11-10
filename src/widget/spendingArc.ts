import { budgetTone } from '../charts/budgetTone'
import { dayRatio } from '../charts/dayBars'
import { byDay, daysInMonth, inMonth, sum } from '../insights/aggregates'
import type { Transaction } from '../db/schema'
import type { WidgetData } from './data'

/**
 * The month as the half circle of day bars the Overview draws, for the Android Spending widget's second page: one number for each
 * day of the month saying how big the day was (1 is its share of the budget; with no budget, an average day is half of 1), the day it
 * is now, and the words for the middle. The widget only draws them.
 */
export interface SpendingArc {
  /** One for each day of the month, in order. */
  ratios: number[]
  /** The day of the month it is, for the month in progress; null for a month that is over. */
  todayDay: number | null
  /** The figure in the middle: the share of the budget used, or what an average day comes to. */
  big: string
  /** The line under it: what is left of the budget, or what the figure is. */
  small: string
  tone: WidgetData['tone']
}

/** What the Android Spending widget is handed: the words of the Windows widget, and the bars. */
export type AndroidSpendingData = WidgetData & { arc: SpendingArc }

export function buildSpendingArc(expenses: Transaction[], month: string, today: Date, budgetMinor: number | null, money: (minor: number) => string): SpendingArc {
  const monthTxs = inMonth(expenses.filter((t) => t.kind === 'expense' && t.deletedAt === undefined), month)
  const daily = byDay(monthTxs, month)
  const days = daily.length
  const spent = sum(monthTxs)
  const isCurrent = month === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const todayDay = isCurrent ? today.getDate() : null
  const elapsed = todayDay ?? daysInMonth(month)

  if (spent === 0) {
    return { ratios: daily.map(() => 0), todayDay, big: money(0), small: 'Nothing spent yet', tone: 'Default' }
  }

  if (budgetMinor !== null && budgetMinor > 0) {
    const ratio = spent / budgetMinor
    const { over, close } = budgetTone(ratio)
    return {
      ratios: daily.map((minor) => dayRatio(minor, budgetMinor, days)),
      todayDay,
      big: `${Math.round(ratio * 100)}%`,
      small: over ? `Over budget by ${money(spent - budgetMinor)}` : close ? `Close to the limit, ${money(budgetMinor - spent)} left` : `${money(budgetMinor - spent)} left`,
      tone: over ? 'Attention' : close ? 'Warning' : 'Good',
    }
  }

  // No budget: each day against an average day (an average day is half way along the scale), so the bars still say which days were heavy.
  const average = spent / Math.max(elapsed, 1)
  return {
    ratios: daily.map((minor) => (average > 0 ? minor / average / 2 : 0)),
    todayDay,
    big: money(Math.round(average / 100) * 100),
    small: 'a day on average',
    tone: 'Default',
  }
}
