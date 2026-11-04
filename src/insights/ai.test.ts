import { describe, expect, it } from 'vitest'
import type { Category, Recurring, Transaction } from '../db/schema'
import { buildAiSummary, type AiInput } from './ai'

const categories = new Map<number, Category>([
  [1, { id: 1, name: 'Food', color: 'var(--s1)' }],
  [2, { id: 2, name: 'Travel', color: 'var(--s2)' }],
  [3, { id: 3, name: 'Shopping', color: 'var(--s3)' }],
])

let id = 0
const tx = (date: string, rupees: number, categoryId: number, merchant: string, kind: Transaction['kind'] = 'expense'): Transaction => ({
  id: ++id, kind, amountMinor: rupees * 100, currency: 'INR', categoryId, merchant, note: '', date, paymentMethod: '', source: 'manual', createdAt: id,
})

// Today is Tuesday 20 Oct 2026. Food and travel have risen month on month: 7,000, 8,000, 9,000, and ₹9,000 so far in October.
const expenses = [
  tx('2026-07-10', 5000, 1, 'Groceries'), tx('2026-07-12', 2000, 2, 'Cab'),
  tx('2026-08-10', 6000, 1, 'Groceries'), tx('2026-08-12', 2000, 2, 'Cab'),
  tx('2026-09-03', 3000, 1, 'Groceries'), tx('2026-09-10', 2000, 1, 'Groceries'), tx('2026-09-15', 1000, 2, 'Cab'),
  tx('2026-09-25', 2000, 1, 'Groceries'), tx('2026-09-27', 1000, 2, 'Cab'),
  ...['2026-10-02', '2026-10-04', '2026-10-08', '2026-10-12', '2026-10-17'].map((d) => tx(d, 400, 1, 'Swiggy')),
  tx('2026-10-05', 3000, 1, 'Groceries'),
  tx('2026-10-06', 1500, 2, 'Cab'),
  tx('2026-10-15', 2500, 3, 'Shoes'),
]
const income = [tx('2026-10-01', 20000, 1, 'Employer', 'income')]

const base: AiInput = {
  expenses, income, categoryById: categories, month: '2026-10', today: new Date(2026, 9, 20), budgetMinor: null, recurring: [],
  balance: { set: false, minor: 0 }, currency: 'INR', rates: {}, money: (m) => `₹${m / 100}`, dayLabel: (d) => d,
}
const run = (over: Partial<AiInput> = {}) => buildAiSummary({ ...base, ...over })

describe('buildAiSummary: what has happened', () => {
  it('says what was spent, how much a day, and over how many days', () => {
    expect(run().headline[0]).toBe('You have spent ₹9000 in October so far, about ₹450 a day over 20 days.')
  })

  it('compares with the same days of the month before', () => {
    // ₹9,000 against ₹6,000 by the 20th of September.
    expect(run().headline[1]).toBe('That is 50% more than the same days in September.')
    expect(run().previous).toMatchObject({ minor: 600_000, deltaPct: 50, partial: true })
  })

  it('names the biggest parts of the spending', () => {
    expect(run().headline[2]).toBe('Food is the biggest part at 56%, then Shopping at 28%.')
  })

  it('says what was received and kept', () => {
    const s = run()
    expect(s.headline[3]).toBe('You received ₹20000, so you have kept ₹11000, 55% of it.')
    expect(s).toMatchObject({ receivedMinor: 2_000_000, savedMinor: 1_100_000, savingsRatePct: 55 })
  })

  it('says when more went out than came in', () => {
    const s = run({ income: [tx('2026-10-01', 5000, 1, 'Employer', 'income')] })
    expect(s.headline[3]).toBe('You received ₹5000 and spent ₹4000 more than that.')
  })

  it('says nothing about income when none came in', () => {
    expect(run({ income: [] }).headline).toHaveLength(3)
  })

  it('speaks in the past tense about a month that is over', () => {
    const s = run({ month: '2026-09' })
    expect(s.isCurrent).toBe(false)
    expect(s.headline[0]).toBe('You spent ₹9000 in September, about ₹300 a day.')
    expect(s.headline[1]).toBe('That is 13% more than August.')
  })

  it('says so when nothing has been spent', () => {
    const s = run({ expenses: [], income: [] })
    expect(s.hasData).toBe(false)
    expect(s.headline).toEqual(['Nothing has been spent in October yet.'])
    expect(s.verdict).toEqual({ tone: 'quiet', label: 'Nothing spent yet' })
  })
})

describe('buildAiSummary: where the month is heading', () => {
  it('carries the pace to the end of the month', () => {
    // ₹9,000 in 20 days, with the last week a little slower: about ₹13,750 by the 31st.
    const t = run().trajectory
    expect(t.projectedMinor).toBeGreaterThan(1_370_000)
    expect(t.projectedMinor).toBeLessThan(1_380_000)
    expect(t.projectedMinor! % 100).toBe(0)
  })

  it('has the running total up to today and the projection from today on, joined at today', () => {
    const t = run().trajectory
    expect(t.actual).toHaveLength(31)
    expect(t.actual[19]).toBe(900_000)
    expect(t.actual[20]).toBeNull()
    expect(t.projected[18]).toBeNull()
    expect(t.projected[19]).toBe(900_000)
    expect(t.projected[30]).toBeCloseTo(t.projectedMinor!, -3)
    expect(t.projected.slice(19).every((v, i, a) => i === 0 || v! > a[i - 1]!)).toBe(true)
  })

  it('has last month as a line to compare with', () => {
    const t = run().trajectory
    expect(t.previous).toHaveLength(30)
    expect(t.previous[29]).toBe(900_000)
  })

  it('does not project a month that is over, or the first days of one', () => {
    expect(run({ month: '2026-09' }).trajectory.projectedMinor).toBeNull()
    expect(run({ today: new Date(2026, 9, 2) }).trajectory.projectedMinor).toBeNull()
    expect(run({ month: '2026-09' }).trajectory.projected).toEqual([])
  })
})

describe('buildAiSummary: the budget', () => {
  it('is on track when the projection fits inside it, with what can be spent a day', () => {
    const s = run({ budgetMinor: 2_000_000 })
    expect(s.verdict).toEqual({ tone: 'good', label: 'On track for your budget' })
    expect(s.trajectory.overBudget).toBeNull()
    // ₹11,000 left over 11 days: ₹1,000 a day.
    expect(s.trajectory.perDayAllowedMinor).toBe(100_000)
  })

  it('warns, with the day it would be passed, when the pace is too high', () => {
    // A ₹12,000 budget at ₹432 a day is passed on the 27th, ending about ₹1,750 over.
    const s = run({ budgetMinor: 1_200_000 })
    expect(s.verdict).toEqual({ tone: 'watch', label: 'Heading over budget' })
    expect(s.trajectory.overBudget).toMatchObject({ onDay: 27, already: false })
    expect(s.trajectory.overBudget!.byMinor).toBeGreaterThan(170_000)
    expect(s.trajectory.perDayAllowedMinor).toBe(27_200)
  })

  it('says when it has already been passed, and on which day', () => {
    const s = run({ budgetMinor: 800_000 })
    expect(s.verdict).toEqual({ tone: 'bad', label: 'Over budget' })
    expect(s.trajectory.overBudget).toEqual({ byMinor: 100_000, onDay: 15, already: true })
    expect(s.trajectory.perDayAllowedMinor).toBeNull()
  })

  it('treats a budget of zero as none', () => {
    expect(run({ budgetMinor: 0 }).trajectory.budgetMinor).toBeNull()
  })

  it('without a budget, judges the month against the one before', () => {
    expect(run().verdict).toEqual({ tone: 'watch', label: 'Spending more than September' })
    // Same days a month earlier were ₹9,000 too.
    const calm = run({ expenses: [...expenses.filter((t) => !t.date.startsWith('2026-10')), tx('2026-10-05', 6100, 1, 'Groceries')] })
    expect(calm.verdict.tone).toBe('good')
  })
})

describe('buildAiSummary: where the money goes', () => {
  it('ranks the categories with their share and how they changed on the same days of last month', () => {
    const [food, shopping, travel] = run().topCategories
    expect(food).toMatchObject({ categoryId: 1, minor: 500_000, sharePct: 56, prevMinor: 500_000, deltaPct: 0 })
    expect(shopping).toMatchObject({ categoryId: 3, minor: 250_000, sharePct: 28, prevMinor: 0, deltaPct: null })
    expect(travel).toMatchObject({ categoryId: 2, minor: 150_000, sharePct: 17, prevMinor: 100_000, deltaPct: 50 })
  })

  it('finds what grew the most', () => {
    expect(run().biggestMover).toEqual({ categoryId: 3, deltaMinor: 250_000 })
  })
})

describe('buildAiSummary: the months and where they are going', () => {
  it('lists the last five months with the one in view last, as its projection while it is going', () => {
    const m = run().months
    expect(m.map((x) => x.label)).toEqual(['Jun', 'Jul', 'Aug', 'Sep', 'Oct'])
    expect(m.map((x) => x.totalMinor).slice(0, 4)).toEqual([0, 700_000, 800_000, 900_000])
    expect(m[4].projected).toBe(true)
    expect(m[4].totalMinor).toBe(run().trajectory.projectedMinor)
  })

  it('shows a finished month as it was', () => {
    const m = run({ month: '2026-09' }).months
    expect(m.at(-1)).toMatchObject({ label: 'Sep', totalMinor: 900_000, projected: false })
  })

  it('sees the trend and guesses the next month from the recent ones', () => {
    // 7,000, 8,000, 9,000: up about 13% a month; the next near 8,833 (the recent months weighted, nudged along the trend).
    expect(run().trend).toEqual({ direction: 'up', monthlyChangePct: 13, nextMonthMinor: 883_300 })
  })

  it('does not guess with less than two months to go on', () => {
    const one = run({ expenses: expenses.filter((t) => t.date >= '2026-09' && t.date < '2026-10') , month: '2026-10' })
    expect(one.trend).toEqual({ direction: null, monthlyChangePct: null, nextMonthMinor: null })
  })

  it('calls a flat run flat', () => {
    const flat = [7, 8, 9].map((m) => tx(`2026-0${m}-10`, 5000, 1, 'Groceries'))
    expect(run({ expenses: flat, month: '2026-10' }).trend.direction).toBe('flat')
  })
})

describe('buildAiSummary: what could be saved', () => {
  const keys = (s = run()) => s.tips.map((t) => t.key)

  it('points out a category running above its usual, with the difference as the saving', () => {
    // Food is on course for ₹7,750 against a usual ₹6,000.
    const tip = run().tips.find((t) => t.key === 'usual-1')!
    expect(tip.title).toBe('Food is running above your usual')
    expect(tip.savingMinor).toBe(175_000)
    expect(tip.detail).toContain('₹7750')
    expect(tip.detail).toContain('₹6000')
  })

  it('does not say it of a category with no history to compare with', () => {
    expect(keys()).not.toContain('usual-3')
  })

  it('points out something bought again and again, and what skipping one in four would keep', () => {
    const tip = run().tips.find((t) => t.key === 'repeat-swiggy')!
    expect(tip.title).toBe('Swiggy adds up')
    expect(tip.detail).toContain('5 times')
    expect(tip.savingMinor).toBe(50_000)
  })

  it('puts the biggest savings first', () => {
    const savings = run().tips.map((t) => t.savingMinor ?? -1)
    expect(savings).toEqual([...savings].sort((a, b) => b - a))
  })

  it('says how to stay inside the budget when heading over it, with the amount to cut', () => {
    const tip = run({ budgetMinor: 1_200_000 }).tips.find((t) => t.key === 'pace')!
    expect(tip.title).toBe('Keep to ₹272 a day')
    expect(tip.detail).toContain('around the 27th')
    expect(tip.savingMinor).toBeGreaterThan(170_000)
  })

  it('says it plainly when the budget is already passed', () => {
    const tip = run({ budgetMinor: 800_000 }).tips.find((t) => t.key === 'over')!
    expect(tip.title).toBe('You are over budget')
    expect(tip.savingMinor).toBeNull()
  })

  it('suggests keeping a fifth of what comes in when spending is heading above that', () => {
    // ₹14,000 in: keep ₹2,800, spend ₹11,200; heading for about ₹13,750.
    const tip = run({ income: [tx('2026-10-01', 14000, 1, 'Employer', 'income')] }).tips.find((t) => t.key === 'rate')!
    expect(tip.title).toBe('Aim to keep 20% of what comes in')
    expect(tip.savingMinor).toBeGreaterThan(250_000)
    expect(keys()).not.toContain('rate') // with ₹20,000 in, there is plenty kept
  })

  it('counts what subscriptions cost in a month and a year, with no invented saving', () => {
    const sub: Recurring = { id: 1, kind: 'expense', amountMinor: 49_900, currency: 'INR', categoryId: 1, merchant: 'Netflix', note: '', paymentMethod: '', frequency: 'monthly', nextDue: '2026-10-25', active: true, tag: 'subscription' }
    // A quiet month, so nothing else crowds it out of the three tips.
    const tip = run({ recurring: [sub], expenses: [tx('2026-10-05', 500, 1, 'Cafe')] }).tips.find((t) => t.key === 'subscriptions')!
    expect(tip.detail).toContain('₹499 a month')
    expect(tip.detail).toContain('₹5988 a year')
    expect(tip.savingMinor).toBeNull()
  })

  it('gives at most three tips, and a total no bigger than what is spent', () => {
    const s = run({ budgetMinor: 1_200_000 })
    expect(s.tips.length).toBeLessThanOrEqual(3)
    expect(s.potentialSavingMinor).toBeLessThanOrEqual(s.trajectory.projectedMinor ?? s.spentMinor)
    expect(s.potentialSavingMinor).toBeGreaterThan(0)
  })

  it('has no tips when nothing was spent', () => {
    const s = run({ expenses: [], income: [] })
    expect(s.tips).toEqual([])
    expect(s.potentialSavingMinor).toBe(0)
  })
})

describe('buildAiSummary: habits', () => {
  it('says the biggest day and how long nothing has been spent', () => {
    const habits = run().habits
    expect(habits[0]).toBe('Biggest day: 2026-10-05, ₹3000')
    expect(habits).toContain('Nothing spent for the last 3 days')
  })

  it('leaves the budget sentence to the trajectory', () => {
    expect(run({ budgetMinor: 1_200_000 }).habits.some((h) => h.includes('daily budget'))).toBe(false)
  })

  it('gives at most three', () => {
    expect(run().habits.length).toBeLessThanOrEqual(3)
  })
})

// ---- Regular payments and EMIs ----

const rule = (over: Partial<Recurring>): Recurring => ({
  id: ++id, kind: 'expense', amountMinor: 100_000, currency: 'INR', categoryId: 1, merchant: 'Thing', note: '', paymentMethod: '',
  frequency: 'monthly', nextDue: '2026-10-28', active: true, ...over,
})
const emiRule = rule({ merchant: 'Home loan', amountMinor: 1_250_000, tag: 'loan', nextDue: '2026-10-28' })
const rentRule = rule({ merchant: 'Rent', amountMinor: 600_000, tag: 'bill', nextDue: '2026-10-25' })
const salaryRule = rule({ merchant: 'Salary', kind: 'income', amountMinor: 8_000_000, tag: 'income', nextDue: '2026-11-01' })

describe('buildAiSummary: regular payments in where the month is heading', () => {
  it('adds a payment still to leave this month to the projection, in full', () => {
    const without = run().trajectory.projectedMinor!
    const withEmi = run({ recurring: [emiRule] }).trajectory
    // The EMI is not in the pace at all, so the month ends exactly one EMI higher.
    expect(withEmi.projectedMinor).toBe(without + 1_250_000)
    expect(withEmi.committedLeftMinor).toBe(1_250_000)
  })

  it('puts each payment on its due day, so the line steps up there and not before', () => {
    const t = run({ recurring: [rentRule] }).trajectory
    const step = (i: number) => t.projected[i]! - t.projected[i - 1]!
    expect(step(23)).toBeLessThan(100_000) // the 24th: only the everyday pace
    expect(step(24)).toBeGreaterThan(600_000) // the 25th: rent leaves
    expect(step(25)).toBeLessThan(100_000)
  })

  it('does not spread a payment added by the recurring feature over the month as though it were a habit', () => {
    // The same ₹10,000 EMI on the 5th, once added by hand and once by the recurring feature.
    const byHand = [...expenses, tx('2026-10-05', 10000, 1, 'Home loan')]
    const byRule = [...expenses, { ...tx('2026-10-05', 10000, 1, 'Home loan'), source: 'recurring' as const }]
    const naive = buildAiSummary({ ...base, expenses: byHand }).trajectory.projectedMinor!
    const aware = buildAiSummary({ ...base, expenses: byRule }).trajectory.projectedMinor!
    // Spread as a habit, the EMI would add ₹10,000 / 20 days, half-weighted, over the 11 days left: about ₹2,750 too much.
    expect(naive - aware).toBeGreaterThan(250_000)
  })

  it('also leaves out what was logged by hand under the name of a regular payment', () => {
    const logged = [...expenses, tx('2026-10-05', 10000, 1, 'Home loan')]
    const naive = buildAiSummary({ ...base, expenses: logged }).trajectory.projectedMinor!
    const aware = buildAiSummary({ ...base, expenses: logged, recurring: [{ ...emiRule, nextDue: '2026-11-05' }] }).trajectory.projectedMinor!
    expect(naive).toBeGreaterThan(aware)
  })

  it('counts a late payment as leaving the next day', () => {
    const late = rule({ merchant: 'Electricity', amountMinor: 600_000, tag: 'bill', nextDue: '2026-10-18' })
    const t = run({ recurring: [late] }).trajectory
    expect(t.committedLeftMinor).toBe(600_000)
    expect(t.projected[20]! - t.projected[19]!).toBeGreaterThan(600_000)
  })

  it('leaves out payments that are switched off, and money coming in', () => {
    const t = run({ recurring: [{ ...emiRule, active: false }, salaryRule] }).trajectory
    expect(t.committedLeftMinor).toBe(0)
  })

  it('takes what is still due out of what can be spent a day to stay inside the budget', () => {
    // ₹20,000 budget, ₹9,000 spent, ₹6,000 rent still to leave: ₹5,000 over 11 days.
    expect(run({ budgetMinor: 2_000_000, recurring: [rentRule] }).trajectory.perDayAllowedMinor).toBe(45_400)
  })

  it('has no daily allowance when what is due already takes the rest of the budget', () => {
    expect(run({ budgetMinor: 2_000_000, recurring: [emiRule, rentRule] }).trajectory.perDayAllowedMinor).toBeNull()
  })

  it('says the day the budget will be passed from where the payments fall', () => {
    // The EMI on the 28th is what tips a ₹17,000 budget over.
    const o = run({ budgetMinor: 1_700_000, recurring: [emiRule] }).trajectory.overBudget!
    expect(o.already).toBe(false)
    expect(o.onDay).toBeGreaterThanOrEqual(28)
  })

  it('mentions the payments still due in the advice to keep to a daily amount', () => {
    // ₹18,000 budget, ₹9,000 spent, ₹6,000 still due: ₹3,000 left for the everyday.
    const tip = run({ budgetMinor: 1_800_000, recurring: [rentRule] }).tips.find((t) => t.key === 'pace')!
    expect(tip.detail).toContain('₹6000 of regular payments still due counted in')
  })

  it('warns plainly when a payment still to leave is more than what is left of the budget', () => {
    // ₹15,000 budget, ₹9,000 spent: ₹6,000 left, and ₹6,000 rent still to go, with the rest of the month to live on.
    const tip = run({ budgetMinor: 1_500_000, recurring: [rentRule] }).tips.find((t) => t.key === 'committed-over')!
    expect(tip.title).toBe('Regular payments will take you past your budget')
    expect(tip.detail).toBe('₹6000 of regular payments is still to leave, and only ₹6000 of the budget is left.')
    expect(tip.urgent).toBe(true)
  })
})

describe('buildAiSummary: what is committed', () => {
  const full = () => run({ recurring: [emiRule, rentRule, salaryRule] }).commitments!

  it('adds up regular payments and EMIs by the month, and what is still to leave this month', () => {
    expect(full()).toMatchObject({ monthlyMinor: 1_850_000, emiMonthlyMinor: 1_250_000, leftThisMonthMinor: 1_850_000, leftCount: 2 })
  })

  it('sets them against the regular income, and says what is left for everything else', () => {
    // ₹18,500 of ₹80,000: 23%, EMIs 16%.
    expect(full()).toMatchObject({ incomeMinor: 8_000_000, sharePct: 23, emiSharePct: 16, keepsMinor: 6_150_000 })
  })

  it('uses what came in this month when no regular income is set up', () => {
    expect(run({ recurring: [emiRule, rentRule] }).commitments).toMatchObject({ incomeMinor: 2_000_000, sharePct: 93, emiSharePct: 63 })
  })

  it('knows nothing of income when none is set up and none came in', () => {
    expect(run({ recurring: [emiRule], income: [] }).commitments).toMatchObject({ incomeMinor: null, sharePct: null, emiSharePct: null, keepsMinor: null })
  })

  it('names the next EMI, when, and how long', () => {
    expect(full().nextEmi).toEqual({ name: 'Home loan', date: '2026-10-28', amountMinor: 1_250_000, daysLeft: 8 })
  })

  it('has no next EMI when none is a loan', () => {
    expect(run({ recurring: [rentRule] }).commitments!.nextEmi).toBeNull()
  })

  it('is nothing at all when no regular payment is going out', () => {
    expect(run().commitments).toBeNull()
    expect(run({ recurring: [salaryRule] }).commitments).toBeNull()
  })

  it('has nothing left to leave for a month that is over', () => {
    expect(run({ month: '2026-09', recurring: [emiRule] }).commitments).toMatchObject({ leftThisMonthMinor: 0, leftCount: 0 })
  })
})

describe('buildAiSummary: warnings about what is committed', () => {
  it('says when EMIs take too much of the income', () => {
    // ₹12,500 of ₹20,000: 63%, over the 40% guide.
    const tip = run({ recurring: [emiRule] }).tips.find((t) => t.key === 'emi')!
    expect(tip.title).toBe('EMIs take 63% of your income')
    expect(tip.detail).toContain('under 40%')
    expect(tip.savingMinor).toBeNull()
  })

  it('says nothing about EMIs at a healthy share', () => {
    const small = rule({ merchant: 'Home loan', amountMinor: 300_000, tag: 'loan', nextDue: '2026-11-05' })
    expect(run({ recurring: [small] }).tips.some((t) => t.key === 'emi')).toBe(false)
  })

  it('says when all the regular payments take most of the income, if it is not the EMIs', () => {
    const rent = rule({ merchant: 'Rent', amountMinor: 1_400_000, tag: 'bill', nextDue: '2026-11-05' })
    const tip = run({ recurring: [rent] }).tips.find((t) => t.key === 'regular')!
    expect(tip.title).toBe('Regular payments take 70% of your income')
    expect(tip.detail).toContain('leaves ₹6000 for everything else')
  })

  it('says how much to save, and by when, when the balance will not cover what is due', () => {
    // ₹5,000 against a ₹12,500 EMI on the 28th: ₹7,500 short, 8 days away.
    const s = run({ recurring: [emiRule], balance: { set: true, minor: 500_000 } })
    const tip = s.tips.find((t) => t.key === 'shortfall')!
    expect(tip.title).toBe('Save ₹7500 more by 2026-10-28')
    expect(tip.detail).toContain('About ₹938 a day')
    expect(tip.urgent).toBe(true)
  })

  it('has no such warning when the balance is not set, or covers it', () => {
    expect(run({ recurring: [emiRule] }).tips.some((t) => t.key === 'shortfall')).toBe(false)
    expect(run({ recurring: [emiRule], balance: { set: true, minor: 5_000_000 } }).tips.some((t) => t.key === 'shortfall')).toBe(false)
  })

  it('puts what is urgent first, whatever else would save more', () => {
    const s = run({ recurring: [emiRule], balance: { set: true, minor: 500_000 }, budgetMinor: 800_000 })
    expect(s.tips[0].urgent).toBe(true)
    expect(s.tips.slice(0, 2).every((t) => t.urgent)).toBe(true)
  })

  it('does not suggest cutting something that is a regular payment', () => {
    const swiggy = rule({ merchant: 'Swiggy', amountMinor: 40_000, nextDue: '2026-11-05' })
    expect(run({ recurring: [swiggy] }).tips.some((t) => t.key === 'repeat-swiggy')).toBe(false)
  })
})
