import { localDateString } from '../db/money'
import type { Category, Recurring, RecurringTag, Transaction } from '../db/schema'
import { planAhead } from './ahead'
import { byCategory, categoryChanges, compareToPrevious, cumulative, daysInMonth, inMonth, monthLabel, monthOf, shiftMonth, sum, type MonthKey } from './aggregates'
import { dayInsights, dayView } from './days'
import { regularPayments } from './regular'
import { repeatingSpend } from './repeats'
import { categoryTrends, monthlyTotals, savingsFor } from './trends'
import { restOfMonth, tagOf, upcomingPayments } from './upcoming'

export interface AiInput {
  /** Money sent, every month. */
  expenses: Transaction[]
  /** Money received, every month. */
  income: Transaction[]
  categoryById: Map<number, Category>
  /** The month to summarise: the one in progress, or one that is over. */
  month: MonthKey
  today: Date
  budgetMinor: number | null
  /** The payments set up to repeat: loans and EMIs, subscriptions, bills, salary. */
  recurring: Recurring[]
  currency: string
  rates: Record<string, number>
  /** The balance, if the person has set one, to check what is coming against. */
  balance: { set: boolean; minor: number }
  /** How an amount and a day are written, so the sentences read as the rest of the app does. */
  money: (minor: number) => string
  dayLabel: (date: string) => string
}

export interface AiTip {
  key: string
  title: string
  detail: string
  /** About how much a month it would keep, to a whole currency unit; null when there is no honest estimate. */
  savingMinor: number | null
  /** Worth acting on before anything else: a budget already passed, or a balance that will not cover what is due. */
  urgent?: boolean
}

export interface AiCategory {
  categoryId: number
  minor: number
  sharePct: number
  /** The same days of the month before. */
  prevMinor: number
  /** Against that, as a whole percent; null when there was nothing to compare with. */
  deltaPct: number | null
}

/** What is already committed: the regular payments and EMIs, against what comes in. */
export interface AiCommitments {
  /** What regular payments going out come to in an average month. */
  monthlyMinor: number
  /** Of that, loan EMIs. */
  emiMonthlyMinor: number
  /** What is still to leave this month (late ones included), and how many payments. Nothing for a month that is over. */
  leftThisMonthMinor: number
  leftCount: number
  /** What comes in each month: the regular income if there is any set up, else what came in this month; null if neither. */
  incomeMinor: number | null
  sharePct: number | null
  emiSharePct: number | null
  /** Income less the regular payments: what is left for everything else in a month. */
  keepsMinor: number | null
  nextEmi: { name: string; date: string; amountMinor: number; daysLeft: number } | null
}

/** One payment that comes out of the account on its own: an EMI, an autopay, a subscription, a bill. */
export interface AiDeduction {
  key: string
  name: string
  tag: RecurringTag
  amountMinor: number
  date: string
  /** Day of the month it is drawn on, for the timeline. */
  day: number
  /** done: it has left this month; due: it is yet to leave; late: it should have, and has not been added. */
  state: 'done' | 'due' | 'late'
}

/** What leaves on its own this month, what has and what has not yet, and when money comes in on its own. */
export interface AiDeductions {
  items: AiDeduction[]
  /** Regular money in, for the timeline: received, or still to arrive. */
  income: { name: string; date: string; day: number; amountMinor: number; done: boolean }[]
  doneMinor: number
  dueMinor: number
  totalMinor: number
  /** What regular payments going out come to in an average month, by kind. */
  monthlyMinor: number
  kinds: { tag: RecurringTag; label: string; monthlyMinor: number; count: number }[]
}

/** The month as one bar: what is spent, what left on its own, what is still to leave, and what is likely to be spent. */
export interface AiMonthBar {
  everydayMinor: number
  autoDoneMinor: number
  autoDueMinor: number
  expectedEverydayMinor: number
  totalMinor: number
  /** What the full width stands for: the month's total, or the budget if that is more. */
  scaleMinor: number
  budgetMinor: number | null
}

/** Somewhere money is going that could stay: what it is, the evidence, and what cutting it would keep. */
export interface AiLeak {
  key: string
  title: string
  evidence: string
  monthlyMinor: number
  yearlyMinor: number
}

/** The next month in two parts, with the range it will probably land in. */
export interface AiOutlook {
  /** What leaves on its own. */
  fixedMinor: number
  /** Everything else, from the recent months. */
  everydayMinor: number
  totalMinor: number
  lowMinor: number
  highMinor: number
  yearMinor: number
}

export interface AiSummary {
  month: MonthKey
  monthName: string
  /** The month before, by name. */
  prevName: string
  isCurrent: boolean
  elapsed: number
  days: number
  hasData: boolean
  spentMinor: number
  receivedMinor: number
  savedMinor: number
  savingsRatePct: number | null
  dailyAverageMinor: number
  previous: { minor: number; deltaPct: number | null; partial: boolean }
  /** One word on how the month is going, and why. good: fine; watch: needs a look; bad: over; quiet: nothing yet. */
  verdict: { tone: 'good' | 'watch' | 'bad' | 'quiet'; label: string }
  /** What has happened, in a few sentences. */
  headline: string[]
  topCategories: AiCategory[]
  biggestMover: { categoryId: number; deltaMinor: number } | null
  trajectory: {
    /** Running total by day; null after today. */
    actual: (number | null)[]
    /** From today to the end of the month: everyday spending at the recent pace, and each regular payment on its due day. */
    projected: (number | null)[]
    /** The month before, running total by day; empty when it had nothing. */
    previous: number[]
    projectedMinor: number | null
    /** Regular payments still to leave this month, already counted in the projection. */
    committedLeftMinor: number
    budgetMinor: number | null
    overBudget: { byMinor: number; onDay: number | null; already: boolean } | null
    /** What can be spent each day for the rest of the month to stay inside the budget, after the regular payments still due. */
    perDayAllowedMinor: number | null
  }
  /** The last five months, the one in view last (its projected total while it is still going). */
  months: { month: MonthKey; label: string; totalMinor: number; projected: boolean }[]
  trend: { direction: 'up' | 'down' | 'flat' | null; monthlyChangePct: number | null; nextMonthMinor: number | null }
  commitments: AiCommitments | null
  /** The month as one bar, for the page's centrepiece; null when nothing has been spent. */
  monthBar: AiMonthBar | null
  /** What leaves on its own, done and to come; null when no regular payment is set up and none has left. */
  deductions: AiDeductions | null
  /** Where money is leaking, biggest first, each with what cutting it would keep. */
  leaks: AiLeak[]
  /** What needs doing first: a budget passed, a balance that will not cover what is due, payments that take too much. */
  alerts: AiTip[]
  /** The aim to keep a share of what comes in, with what that means in spending; null if already met or no income. */
  goal: AiTip | null
  outlook: AiOutlook | null
  tips: AiTip[]
  /** Up to what the tips would keep a month, together. */
  potentialSavingMinor: number
  habits: string[]
}

const whole = (minor: number) => Math.round(minor / 100) * 100
const dayOf = (t: Pick<Transaction, 'date'>) => Number(t.date.slice(8, 10))
const shortMonth = (key: MonthKey) => monthLabel(key).split(' ')[0].slice(0, 3)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const nameKey = (s: string) => s.trim().toLowerCase()
/** A tip smaller than this is noise. ₹200. */
const MIN_SAVING_MINOR = 20_000
/** A category is "above its usual" at this many times the usual month. */
const ABOVE_USUAL = 1.15
/** What a person is encouraged to keep of what comes in. */
const SAVE_SHARE = 0.2
/** The usual guide: loan EMIs should stay under this share of income, and all regular payments under the second. */
const EMI_LIMIT_PCT = 40
const REGULAR_LIMIT_PCT = 60
const MAX_TIPS = 3

/**
 * Reads the whole ledger the way a careful friend would, for one month: what has happened, where this month is heading,
 * what is already committed to regular payments and EMIs, where the money goes, what could be saved and about how much,
 * how the months have moved and what the next may be. Everything is worked out here from the person's own entries and
 * the payments they have set up, on this device. The month's end is everyday spending at the recent pace plus each regular
 * payment still to leave on its due day, so a loan EMI on the 5th is not spread across the month as though it were a habit.
 * Nothing in it is advice beyond the arithmetic.
 */
export function buildAiSummary(input: AiInput): AiSummary {
  const { expenses, income, categoryById, month, today, budgetMinor, money, dayLabel } = input
  const todayKey = localDateString(today)
  const isCurrent = month === todayKey.slice(0, 7)
  const days = daysInMonth(month)
  const elapsed = isCurrent ? Math.min(today.getDate(), days) : days
  const monthName = monthLabel(month).split(' ')[0]
  const prevMonth = shiftMonth(month, -1)
  const prevName = monthLabel(prevMonth).split(' ')[0]
  const nameOf = (id: number) => categoryById.get(id)?.name ?? 'No category'
  const moneyIn = { currency: input.currency, rates: input.rates }

  const monthTxs = inMonth(expenses, month)
  const spentMinor = sum(monthTxs)
  const savings = savingsFor(expenses, income, month)
  const dailyAverageMinor = Math.round(spentMinor / Math.max(elapsed, 1))
  const cmp = compareToPrevious(expenses, month, today)
  const hasBudget = budgetMinor !== null && budgetMinor > 0

  // ---- Regular payments: what is set up, and what is still to leave this month. ----
  const regular = regularPayments(input.recurring, todayKey, moneyIn)
  const dueItems = isCurrent ? upcomingPayments(input.recurring, todayKey, 62, moneyIn) : []
  const committed = restOfMonth(dueItems, todayKey).filter((p) => p.kind === 'expense')
  const committedLeftMinor = committed.reduce((a, p) => a + p.amountMinor, 0)
  // A payment that is late, or due today, shows up the next day; one later this month, on its day.
  const placeDay = (p: (typeof committed)[number]) => Math.min(days, Math.max(elapsed + 1, p.overdue ? 0 : dayOf(p)))
  // Everything set up to repeat, and what the person has logged by hand under the same name, is not "everyday" spending.
  const fixedNames = new Set(input.recurring.filter((r) => r.active).map((r) => nameKey(r.merchant)).filter(Boolean))
  const isFixed = (t: Transaction) => t.source === 'recurring' || fixedNames.has(nameKey(t.merchant))

  // ---- Where the month is heading: everyday spending at the recent pace, plus each payment on its day. ----
  const actual = cumulative(monthTxs, month, isCurrent ? elapsed : null)
  const previousMonthTxs = inMonth(expenses, prevMonth)
  const previous = sum(previousMonthTxs) > 0 ? (cumulative(previousMonthTxs, prevMonth, null) as number[]) : []
  let projectedMinor: number | null = null
  let pace = 0
  if (isCurrent && elapsed >= 3 && spentMinor > 0) {
    const everyday = monthTxs.filter((t) => !isFixed(t))
    const recentDays = Math.min(7, elapsed)
    const recent = sum(everyday.filter((t) => dayOf(t) > elapsed - recentDays)) / recentDays
    pace = (recent + sum(everyday) / elapsed) / 2
    projectedMinor = whole(spentMinor + pace * (days - elapsed) + committedLeftMinor)
  }
  const dueBy = (day: number) => committed.filter((p) => placeDay(p) <= day).reduce((a, p) => a + p.amountMinor, 0)
  const projected: (number | null)[] =
    projectedMinor === null ? [] : Array.from({ length: days }, (_, i) => (i < elapsed - 1 ? null : spentMinor + pace * (i - (elapsed - 1)) + dueBy(i + 1)))

  let overBudget: AiSummary['trajectory']['overBudget'] = null
  let perDayAllowedMinor: number | null = null
  if (hasBudget) {
    const budget = budgetMinor
    if (spentMinor > budget) {
      const idx = actual.findIndex((v) => v !== null && v > budget)
      overBudget = { byMinor: spentMinor - budget, onDay: idx === -1 ? null : idx + 1, already: true }
    } else if (projectedMinor !== null && projectedMinor > budget) {
      const idx = projected.findIndex((v, i) => i >= elapsed && v !== null && v > budget)
      overBudget = { byMinor: projectedMinor - budget, onDay: idx === -1 ? null : idx + 1, already: false }
    }
    const room = budget - spentMinor - committedLeftMinor
    if (isCurrent && elapsed < days && room > 0) perDayAllowedMinor = Math.floor(room / (days - elapsed) / 100) * 100
  }

  // ---- How it is going. ----
  const verdict: AiSummary['verdict'] =
    spentMinor === 0
      ? { tone: 'quiet', label: isCurrent ? 'Nothing spent yet' : 'Nothing spent' }
      : overBudget?.already
        ? { tone: 'bad', label: 'Over budget' }
        : overBudget
          ? { tone: 'watch', label: 'Heading over budget' }
          : hasBudget
            ? { tone: 'good', label: 'On track for your budget' }
            : cmp.deltaPct !== null && cmp.deltaPct >= 20
              ? { tone: 'watch', label: `Spending more than ${prevName}` }
              : cmp.deltaPct !== null && cmp.deltaPct <= -10
                ? { tone: 'good', label: `Spending less than ${prevName}` }
                : { tone: 'good', label: cmp.deltaPct === null ? 'Looking steady' : `About the same as ${prevName}` }

  // ---- Where the money goes. ----
  const changes = new Map(categoryChanges(expenses, month, today).map((c) => [c.categoryId, c]))
  const topCategories: AiCategory[] = byCategory(monthTxs)
    .slice(0, 5)
    .map((t) => {
      const prevMinor = changes.get(t.categoryId)?.previousMinor ?? t.totalMinor
      return {
        categoryId: t.categoryId,
        minor: t.totalMinor,
        sharePct: spentMinor > 0 ? Math.round((t.totalMinor / spentMinor) * 100) : 0,
        prevMinor,
        deltaPct: prevMinor > 0 ? Math.round(((t.totalMinor - prevMinor) / prevMinor) * 100) : null,
      }
    })
  const mover = [...changes.values()].find((c) => c.deltaMinor > 0)
  const biggestMover = mover ? { categoryId: mover.categoryId, deltaMinor: mover.deltaMinor } : null

  // ---- What has happened. ----
  const headline: string[] = []
  if (spentMinor > 0) {
    headline.push(
      isCurrent
        ? `You have spent ${money(spentMinor)} in ${monthName} so far, about ${money(dailyAverageMinor)} a day over ${plural(elapsed, 'day', 'days')}.`
        : `You spent ${money(spentMinor)} in ${monthName}, about ${money(dailyAverageMinor)} a day.`,
    )
    if (cmp.deltaPct !== null) {
      const against = `${cmp.partial ? 'the same days in ' : ''}${prevName}`
      headline.push(cmp.deltaPct === 0 ? `That is the same as ${against}.` : `That is ${Math.abs(cmp.deltaPct)}% ${cmp.deltaPct > 0 ? 'more' : 'less'} than ${against}.`)
    }
    const [first, second] = topCategories
    if (first) headline.push(`${nameOf(first.categoryId)} is the biggest part at ${first.sharePct}%${second ? `, then ${nameOf(second.categoryId)} at ${second.sharePct}%` : ''}.`)
    if (savings.receivedMinor > 0) {
      headline.push(
        savings.savedMinor >= 0
          ? `You received ${money(savings.receivedMinor)}, so you have kept ${money(savings.savedMinor)}${savings.ratePct !== null ? `, ${savings.ratePct}% of it` : ''}.`
          : `You received ${money(savings.receivedMinor)} and spent ${money(-savings.savedMinor)} more than that.`,
      )
    }
  } else {
    headline.push(isCurrent ? `Nothing has been spent in ${monthName} yet.` : `Nothing was spent in ${monthName}.`)
  }

  // ---- The months, and where they are going. ----
  const totals = monthlyTotals(expenses, month, 5)
  const months = totals.map((m, i) => {
    const projection = i === totals.length - 1 ? projectedMinor : null
    return { month: m.month, label: shortMonth(m.month), totalMinor: projection ?? m.totalMinor, projected: projection !== null }
  })
  const completed = monthlyTotals(expenses, isCurrent ? prevMonth : month, 4)
  const firstUsed = completed.findIndex((m) => m.totalMinor > 0)
  const used = firstUsed === -1 ? [] : completed.slice(firstUsed).map((m) => m.totalMinor)
  let trend: AiSummary['trend'] = { direction: null, monthlyChangePct: null, nextMonthMinor: null }
  if (used.length >= 2) {
    const k = used.length
    const mean = used.reduce((a, b) => a + b, 0) / k
    const xMean = (k - 1) / 2
    const slope = used.reduce((a, v, i) => a + (i - xMean) * (v - mean), 0) / used.reduce((a, _, i) => a + (i - xMean) ** 2, 0)
    const changePct = mean > 0 ? Math.round((slope / mean) * 100) : null
    // The next month: the last three, the newest counted most, nudged half a step along the trend.
    const recent = used.slice(-3)
    const weighted = recent.reduce((a, v, i) => a + v * (i + 1), 0) / recent.reduce((a, _, i) => a + (i + 1), 0)
    trend = {
      direction: changePct === null ? null : changePct > 5 ? 'up' : changePct < -5 ? 'down' : 'flat',
      monthlyChangePct: changePct,
      nextMonthMinor: whole(Math.max(0, weighted + slope / 2)),
    }
  }

  // ---- The next month, in two parts: what leaves on its own, and everything else, with the range it is likely to land in. ----
  const fixedIn = (key: MonthKey) => sum(inMonth(expenses, key).filter(isFixed))
  const monthsUsed = firstUsed === -1 ? [] : completed.slice(firstUsed)
  let outlook: AiOutlook | null = null
  if (monthsUsed.length >= 2) {
    const everydayUsed = monthsUsed.map((m) => Math.max(m.totalMinor - fixedIn(m.month), 0))
    const k = everydayUsed.length
    const mean = everydayUsed.reduce((a, b) => a + b, 0) / k
    const xMean = (k - 1) / 2
    const slope = everydayUsed.reduce((a, v, i) => a + (i - xMean) * (v - mean), 0) / everydayUsed.reduce((a, _, i) => a + (i - xMean) ** 2, 0)
    const last3 = everydayUsed.slice(-3)
    const weighted = last3.reduce((a, v, i) => a + v * (i + 1), 0) / last3.reduce((a, _, i) => a + (i + 1), 0)
    const everydayNext = Math.max(0, weighted + slope / 2)
    const fixedHistory = monthsUsed.slice(-3).map((m) => fixedIn(m.month))
    // What is set up is what will leave; with nothing set up, what has left in the last months.
    const fixedNext = regular ? regular.monthlyMinor : fixedHistory.reduce((a, b) => a + b, 0) / fixedHistory.length
    // The spread of the everyday part: how far the months have strayed from their mean, or a seventh if there are too few to say.
    const spread = k >= 3 ? Math.sqrt(everydayUsed.reduce((a, v) => a + (v - mean) ** 2, 0) / k) : everydayNext * 0.15
    outlook = {
      fixedMinor: whole(fixedNext),
      everydayMinor: whole(everydayNext),
      totalMinor: whole(fixedNext + everydayNext),
      lowMinor: whole(fixedNext + Math.max(0, everydayNext - spread)),
      highMinor: whole(fixedNext + everydayNext + spread),
      yearMinor: whole((fixedNext + everydayNext) * 12),
    }
  }

  // ---- What is already committed. ----
  const nextEmiPayment = upcomingPayments(input.recurring, todayKey, 62, moneyIn).find((p) => p.kind === 'expense' && tagOf(p.rule) === 'loan') ?? null
  let commitments: AiCommitments | null = null
  if (regular) {
    const emiMonthlyMinor = regular.byType.find((t) => t.tag === 'loan')?.monthlyMinor ?? 0
    const incomeMinor = regular.incomeMonthlyMinor > 0 ? regular.incomeMonthlyMinor : savings.receivedMinor > 0 ? savings.receivedMinor : null
    commitments = {
      monthlyMinor: regular.monthlyMinor,
      emiMonthlyMinor,
      leftThisMonthMinor: committedLeftMinor,
      leftCount: committed.length,
      incomeMinor,
      sharePct: incomeMinor ? Math.round((regular.monthlyMinor / incomeMinor) * 100) : null,
      emiSharePct: incomeMinor && emiMonthlyMinor > 0 ? Math.round((emiMonthlyMinor / incomeMinor) * 100) : null,
      keepsMinor: incomeMinor ? incomeMinor - regular.monthlyMinor : null,
      nextEmi: nextEmiPayment
        ? { name: nextEmiPayment.rule.merchant || 'Loan EMI', date: nextEmiPayment.date, amountMinor: nextEmiPayment.amountMinor, daysLeft: nextEmiPayment.daysLeft }
        : null,
    }
  }

  // ---- What leaves on its own: what has, and what is still to come, so the month's end counts it. ----
  const activeRules = new Map(input.recurring.filter((r) => r.active).map((r) => [nameKey(r.merchant), r]))
  const doneTxs = monthTxs.filter(isFixed).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id ?? 0) - (b.id ?? 0)))
  const autoDoneMinor = sum(doneTxs)
  const monthStart = `${month}-01`
  const deductionItems: AiDeduction[] = [
    ...doneTxs.map((t): AiDeduction => {
      const rule = activeRules.get(nameKey(t.merchant))
      return { key: `done-${t.id}`, name: t.merchant.trim() || nameOf(t.categoryId), tag: rule ? tagOf(rule) : 'other', amountMinor: t.amountMinor, date: t.date, day: dayOf(t), state: 'done' }
    }),
    ...committed.map((p): AiDeduction => ({
      key: `due-${p.key}`,
      name: p.rule.merchant || nameOf(p.rule.categoryId),
      tag: tagOf(p.rule),
      amountMinor: p.amountMinor,
      date: p.date,
      day: p.date < monthStart ? 1 : dayOf(p),
      state: p.overdue ? 'late' : 'due',
    })),
  ]
  const incomeItems: AiDeductions['income'] = [
    ...income
      .filter((t) => monthOf(t.date) === month && t.source === 'recurring')
      .map((t) => ({ name: t.merchant.trim() || 'Income', date: t.date, day: dayOf(t), amountMinor: t.amountMinor, done: true })),
    ...restOfMonth(dueItems, todayKey)
      .filter((p) => p.kind === 'income')
      .map((p) => ({ name: p.rule.merchant || 'Income', date: p.date, day: p.date < monthStart ? 1 : dayOf(p), amountMinor: p.amountMinor, done: false })),
  ]
  const deductions: AiDeductions | null =
    deductionItems.length === 0 && !regular
      ? null
      : {
          items: deductionItems,
          income: incomeItems,
          doneMinor: autoDoneMinor,
          dueMinor: committedLeftMinor,
          totalMinor: autoDoneMinor + committedLeftMinor,
          monthlyMinor: regular?.monthlyMinor ?? 0,
          kinds: regular ? regular.byType.map((t) => ({ tag: t.tag, label: t.label, monthlyMinor: t.monthlyMinor, count: t.count })) : [],
        }

  const expectedEverydayMinor = projectedMinor === null ? 0 : Math.round(pace * (days - elapsed))
  const everydayMinor = Math.max(spentMinor - autoDoneMinor, 0)
  const barTotal = everydayMinor + autoDoneMinor + committedLeftMinor + expectedEverydayMinor
  const monthBar: AiMonthBar | null =
    spentMinor > 0
      ? { everydayMinor, autoDoneMinor, autoDueMinor: committedLeftMinor, expectedEverydayMinor, totalMinor: barTotal, scaleMinor: Math.max(barTotal, hasBudget ? budgetMinor : 0), budgetMinor: hasBudget ? budgetMinor : null }
      : null

  // ---- What could be saved, and what to do about what is coming. ----
  const tips: AiTip[] = []
  const toMonthEnd = (minor: number) => (isCurrent && elapsed >= 5 ? (minor * days) / elapsed : minor)

  if (overBudget?.already) {
    tips.push({ key: 'over', title: 'You are over budget', detail: `${money(overBudget.byMinor)} over. Hold off on anything that can wait for the rest of ${monthName}.`, savingMinor: null, urgent: true })
  } else if (overBudget && perDayAllowedMinor === null && committedLeftMinor > 0 && isCurrent) {
    tips.push({
      key: 'committed-over',
      title: 'Regular payments will take you past your budget',
      detail: `${money(committedLeftMinor)} of regular payments is still to leave, and only ${money(Math.max(budgetMinor! - spentMinor, 0))} of the budget is left.`,
      savingMinor: null,
      urgent: true,
    })
  } else if (overBudget && perDayAllowedMinor !== null) {
    tips.push({
      key: 'pace',
      title: `Keep to ${money(perDayAllowedMinor)} a day`,
      detail: `That brings ${monthName} back inside your ${money(budgetMinor!)} budget${committedLeftMinor > 0 ? `, with ${money(committedLeftMinor)} of regular payments still due counted in` : ''}. At the current pace you would pass it${overBudget.onDay ? ` around the ${overBudget.onDay}${ordinalSuffix(overBudget.onDay)}` : ''}.`,
      savingMinor: whole(overBudget.byMinor),
      urgent: true,
    })
  }

  const ahead = isCurrent ? planAhead(upcomingPayments(input.recurring, todayKey, 30, moneyIn), input.balance, todayKey) : null
  if (ahead?.setAside?.tone === 'short' && ahead.setAside.byDate) {
    tips.push({
      key: 'shortfall',
      title: `Save ${money(ahead.setAside.amountMinor)} more by ${dayLabel(ahead.setAside.byDate)}`,
      detail: `Your balance will not cover the regular payments due. About ${money(ahead.setAside.perDayMinor)} a day gets you there.`,
      savingMinor: null,
      urgent: true,
    })
  }

  if (commitments && commitments.emiSharePct !== null && commitments.emiSharePct >= EMI_LIMIT_PCT) {
    tips.push({
      key: 'emi',
      title: `EMIs take ${commitments.emiSharePct}% of your income`,
      detail: `${money(commitments.emiMonthlyMinor)} a month on ${money(commitments.incomeMinor!)}. A common guide is to keep them under ${EMI_LIMIT_PCT}%.`,
      savingMinor: null,
      urgent: true,
    })
  } else if (commitments && commitments.sharePct !== null && commitments.sharePct >= REGULAR_LIMIT_PCT) {
    tips.push({
      key: 'regular',
      title: `Regular payments take ${commitments.sharePct}% of your income`,
      detail: `${money(commitments.monthlyMinor)} a month on ${money(commitments.incomeMinor!)}, which leaves ${money(Math.max(commitments.keepsMinor ?? 0, 0))} for everything else.`,
      savingMinor: null,
      urgent: true,
    })
  }

  const trends = new Map(categoryTrends(expenses, month, 6, 8, isCurrent).map((t) => [t.categoryId, t]))
  for (const c of topCategories.slice(0, 3)) {
    const usual = trends.get(c.categoryId)?.averageMinor ?? 0
    const expected = toMonthEnd(c.minor)
    if (usual > 0 && expected > usual * ABOVE_USUAL && expected - usual >= MIN_SAVING_MINOR) {
      tips.push({
        key: `usual-${c.categoryId}`,
        title: `${nameOf(c.categoryId)} is running above your usual`,
        detail: `About ${money(whole(expected))} this month against ${money(usual)} in a usual month. Bringing it back would keep the difference.`,
        savingMinor: whole(expected - usual),
      })
    }
  }

  for (const r of repeatingSpend(expenses, month, today, 5).filter((x) => x.pattern !== 'monthly' && x.count >= 4 && !fixedNames.has(nameKey(x.name))).slice(0, 2)) {
    const saving = whole(r.totalMinor * 0.25)
    if (saving >= MIN_SAVING_MINOR) {
      tips.push({
        key: `repeat-${r.name.toLowerCase()}`,
        title: `${r.name} adds up`,
        detail: `${plural(r.count, 'time', 'times')}, ${money(r.totalMinor)}${isCurrent ? ' so far' : ''} in ${monthName}. Skipping one in four would keep about ${money(saving)} a month.`,
        savingMinor: saving,
      })
    }
  }

  const subscriptions = regular?.byType.find((t) => t.tag === 'subscription')
  if (subscriptions && subscriptions.monthlyMinor > 0) {
    tips.push({
      key: 'subscriptions',
      title: 'Check your subscriptions',
      detail: `They cost ${money(subscriptions.monthlyMinor)} a month, ${money(subscriptions.monthlyMinor * 12)} a year. Cancel any you rarely use.`,
      savingMinor: null,
    })
  }

  if (savings.receivedMinor > 0) {
    const target = savings.receivedMinor * (1 - SAVE_SHARE)
    const heading = projectedMinor ?? spentMinor
    if (heading - target >= MIN_SAVING_MINOR) {
      tips.push({
        key: 'rate',
        title: `Aim to keep ${Math.round(SAVE_SHARE * 100)}% of what comes in`,
        detail: `That means spending about ${money(whole(target))} in ${monthName}. You are heading for ${money(whole(heading))}.`,
        savingMinor: whole(heading - target),
      })
    }
  }

  // What needs doing first, then what would keep the most.
  tips.sort((a, b) => Number(b.urgent ?? false) - Number(a.urgent ?? false) || (b.savingMinor ?? -1) - (a.savingMinor ?? -1))
  const shownTips = tips.slice(0, MAX_TIPS)

  // Leaks: what would keep money, found from the everyday spending (not what leaves on its own), each with a month and a year.
  const everydayTxs = monthTxs.filter((t) => !isFixed(t))
  const everydayTotal = sum(everydayTxs)
  const found: AiLeak[] = tips
    .filter((t) => !t.urgent && t.savingMinor !== null && t.key !== 'rate')
    .map((t) => ({ key: t.key, title: t.title, evidence: t.detail, monthlyMinor: t.savingMinor!, yearlyMinor: t.savingMinor! * 12 }))

  // Weekend days that cost clearly more than weekdays: close half the gap, over the weekend days of a month.
  const everydayView = dayView(everydayTxs, month, isCurrent ? elapsed : null, budgetMinor)
  if (everydayView.weekendRatio !== null && everydayView.weekendRatio >= 1.3) {
    const past = everydayView.days.filter((d) => !d.future)
    const we = past.filter((d) => d.weekend)
    const wd = past.filter((d) => !d.weekend)
    const gap = sum(we.map((d) => ({ amountMinor: d.minor }) as Transaction)) / we.length - sum(wd.map((d) => ({ amountMinor: d.minor }) as Transaction)) / wd.length
    const saving = whole(gap * 0.5 * 8.7)
    if (saving >= MIN_SAVING_MINOR) {
      found.push({
        key: 'weekend',
        title: 'Weekends cost you more',
        evidence: `Weekend days run ${Math.round((everydayView.weekendRatio - 1) * 100)}% above weekdays. Closing half that gap would keep about ${money(saving)} a month.`,
        monthlyMinor: saving,
        yearlyMinor: saving * 12,
      })
    }
  }

  // Many small purchases, each too small to notice: bought often enough to be a real share of what goes.
  if (everydayTxs.length >= 12 && everydayTotal > 0) {
    const limit = (everydayTotal / everydayTxs.length) * 0.4
    const small = everydayTxs.filter((t) => t.amountMinor <= limit)
    const smallTotal = sum(small)
    const share = Math.round((smallTotal / everydayTotal) * 100)
    const saving = whole(toMonthEnd(smallTotal) * 0.25)
    if (small.length >= 8 && share >= 8 && saving >= MIN_SAVING_MINOR) {
      found.push({
        key: 'small',
        title: `${small.length} small purchases add up`,
        evidence: `Each under ${money(whole(limit))}, together ${money(smallTotal)}: ${share}% of your everyday spending. Cutting a quarter would keep about ${money(saving)} a month.`,
        monthlyMinor: saving,
        yearlyMinor: saving * 12,
      })
    }
  }
  const leaks = found.sort((a, b) => b.monthlyMinor - a.monthlyMinor).slice(0, 6)
  const alerts = tips.filter((t) => t.urgent)
  const goal = tips.find((t) => t.key === 'rate') ?? null
  const potentialSavingMinor = Math.min(shownTips.reduce((a, t) => a + (t.savingMinor ?? 0), 0), projectedMinor ?? spentMinor)

  // ---- Habits. ----
  const habits = dayInsights(dayView(monthTxs, month, isCurrent ? elapsed : null, budgetMinor), money, dayLabel)
    .filter((i) => i.key !== 'budget')
    .map((i) => i.text)
    .slice(0, 3)

  return {
    month,
    monthName,
    prevName,
    isCurrent,
    elapsed,
    days,
    hasData: spentMinor > 0,
    spentMinor,
    receivedMinor: savings.receivedMinor,
    savedMinor: savings.savedMinor,
    savingsRatePct: savings.ratePct,
    dailyAverageMinor,
    previous: { minor: cmp.previousMinor, deltaPct: cmp.deltaPct, partial: cmp.partial },
    verdict,
    headline,
    topCategories,
    biggestMover,
    trajectory: { actual, projected, previous, projectedMinor, committedLeftMinor, budgetMinor: hasBudget ? budgetMinor : null, overBudget, perDayAllowedMinor },
    months,
    trend,
    commitments,
    monthBar,
    deductions,
    leaks,
    alerts,
    goal,
    outlook,
    tips: shownTips,
    potentialSavingMinor,
    habits,
  }
}

/** st, nd, rd, th. */
export function ordinalSuffix(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13
  return teen ? 'th' : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th')
}
