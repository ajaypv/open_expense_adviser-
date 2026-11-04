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

// ---- What leaves on its own, the month as one bar, the leaks and the outlook ----

const loggedByRule = (date: string, rupees: number, merchant: string): Transaction => ({ ...tx(date, rupees, 1, merchant), source: 'recurring' })

describe('buildAiSummary: what leaves on its own', () => {
  // The EMI has left (added by the recurring feature on the 5th); the rent is still due on the 25th.
  const withBoth = () =>
    run({ expenses: [...expenses, loggedByRule('2026-10-05', 12500, 'Home loan')], recurring: [{ ...emiRule, nextDue: '2026-11-05' }, rentRule] }).deductions!

  it('lists what has left and what is still to leave, in the order of the month', () => {
    const items = withBoth().items
    expect(items.map((i) => [i.name, i.state, i.day])).toEqual([
      ['Home loan', 'done', 5],
      ['Rent', 'due', 25],
    ])
  })

  it('gives each its kind and amount', () => {
    const [emi, rent] = withBoth().items
    expect(emi).toMatchObject({ tag: 'loan', amountMinor: 1_250_000, date: '2026-10-05' })
    expect(rent).toMatchObject({ tag: 'bill', amountMinor: 600_000, date: '2026-10-25' })
  })

  it('adds up what has left, what is to leave, and both', () => {
    expect(withBoth()).toMatchObject({ doneMinor: 1_250_000, dueMinor: 600_000, totalMinor: 1_850_000 })
  })

  it('counts something typed by hand under the name of a regular payment as having left', () => {
    const d = run({ expenses: [...expenses, tx('2026-10-05', 12500, 1, 'Home loan')], recurring: [{ ...emiRule, nextDue: '2026-11-05' }] }).deductions!
    expect(d.items[0]).toMatchObject({ name: 'Home loan', state: 'done', tag: 'loan' })
  })

  it('marks a payment that should have left and has not as late, on the day it was due', () => {
    const late = rule({ merchant: 'Electricity', amountMinor: 300_000, tag: 'bill', nextDue: '2026-10-18' })
    expect(run({ recurring: [late] }).deductions!.items[0]).toMatchObject({ state: 'late', day: 18 })
  })

  it('puts a payment that was due last month at the first of this one', () => {
    const old = rule({ merchant: 'Insurance', amountMinor: 300_000, nextDue: '2026-09-28' })
    expect(run({ recurring: [old] }).deductions!.items[0]).toMatchObject({ state: 'late', day: 1 })
  })

  it('knows when regular money comes in, as well as when it has', () => {
    const received = { ...tx('2026-10-01', 80000, 1, 'Salary', 'income'), source: 'recurring' as const }
    const paycheque = rule({ merchant: 'Bonus', kind: 'income', amountMinor: 500_000, tag: 'income', nextDue: '2026-10-28' })
    const d = run({ income: [received], recurring: [rentRule, paycheque] }).deductions!
    expect(d.income).toEqual([
      { name: 'Salary', date: '2026-10-01', day: 1, amountMinor: 8_000_000, done: true },
      { name: 'Bonus', date: '2026-10-28', day: 28, amountMinor: 500_000, done: false },
    ])
  })

  it('does not count money coming in, or a switched-off payment, as leaving', () => {
    const d = run({ recurring: [{ ...rentRule, active: false }, salaryRule] })
    expect(d.deductions).toBeNull()
  })

  it('says what regular payments cost in a month, by kind, biggest first', () => {
    const d = run({ recurring: [emiRule, rentRule] }).deductions!
    expect(d.monthlyMinor).toBe(1_850_000)
    expect(d.kinds.map((k) => [k.label, k.monthlyMinor])).toEqual([['Loan EMI', 1_250_000], ['Bill', 600_000]])
  })

  it('has nothing for a month with none set up and none left', () => {
    expect(run().deductions).toBeNull()
  })

  it('shows only what left, for a month that is over', () => {
    const d = run({ month: '2026-09', expenses: [...expenses, loggedByRule('2026-09-05', 12500, 'Home loan')], recurring: [rentRule] }).deductions!
    expect(d.items.map((i) => i.state)).toEqual(['done'])
    expect(d.dueMinor).toBe(0)
  })
})

describe('buildAiSummary: the month as one bar', () => {
  it('splits the month into what is spent, what is to be spent, and what is to leave on its own', () => {
    const b = run({ recurring: [rentRule] }).monthBar!
    expect(b).toMatchObject({ everydayMinor: 900_000, autoDoneMinor: 0, autoDueMinor: 600_000 })
    expect(b.expectedEverydayMinor).toBeGreaterThan(450_000)
    expect(b.expectedEverydayMinor).toBeLessThan(500_000)
  })

  it('adds up to where the month is heading', () => {
    for (const recurring of [[], [rentRule], [emiRule, rentRule]]) {
      const s = run({ recurring })
      expect(Math.abs(s.monthBar!.totalMinor - s.trajectory.projectedMinor!)).toBeLessThanOrEqual(100)
    }
  })

  it('takes what left on its own out of the everyday part', () => {
    const b = run({ expenses: [...expenses, loggedByRule('2026-10-05', 10000, 'Home loan')] }).monthBar!
    expect(b.autoDoneMinor).toBe(1_000_000)
    expect(b.everydayMinor).toBe(900_000)
  })

  it('is as wide as the month, or the budget when that is more', () => {
    expect(run().monthBar!.scaleMinor).toBe(run().monthBar!.totalMinor)
    expect(run({ budgetMinor: 5_000_000 }).monthBar!).toMatchObject({ scaleMinor: 5_000_000, budgetMinor: 5_000_000 })
    // A budget under where the month ends leaves the month as the width.
    const tight = run({ budgetMinor: 1_000_000 }).monthBar!
    expect(tight.scaleMinor).toBe(tight.totalMinor)
  })

  it('has no budget marker without a budget', () => {
    expect(run().monthBar!.budgetMinor).toBeNull()
  })

  it('has nothing still to come for a month that is over', () => {
    expect(run({ month: '2026-09' }).monthBar).toMatchObject({ expectedEverydayMinor: 0, autoDueMinor: 0, everydayMinor: 900_000 })
  })

  it('is nothing when nothing has been spent', () => {
    expect(run({ expenses: [], income: [] }).monthBar).toBeNull()
  })
})

describe('buildAiSummary: where it is leaking', () => {
  it('lists what would keep money, biggest first, each with a month and a year', () => {
    const { leaks } = run()
    expect(leaks.map((l) => l.key)).toEqual(['usual-1', 'repeat-swiggy', 'usual-2'])
    expect(leaks.map((l) => l.monthlyMinor)).toEqual([175_000, 50_000, 32_500])
    for (const l of leaks) expect(l.yearlyMinor).toBe(l.monthlyMinor * 12)
  })

  it('says what each is, with the evidence', () => {
    const food = run().leaks.find((l) => l.key === 'usual-1')!
    expect(food.title).toBe('Food is running above your usual')
    expect(food.evidence).toContain('₹7750')
  })

  it('leaves out what is urgent, and the aim to keep a share of income', () => {
    const s = run({ budgetMinor: 800_000, income: [tx('2026-10-01', 14000, 1, 'Employer', 'income')] })
    expect(s.leaks.some((l) => l.key === 'over' || l.key === 'rate')).toBe(false)
  })

  it('finds weekends that cost clearly more than weekdays, and what closing half the gap would keep', () => {
    // 300 rupees on each weekend day, 100 on each weekday, up to the 20th.
    const weekend = [3, 4, 10, 11, 17, 18]
    const days = Array.from({ length: 20 }, (_, i) => i + 1)
    const spendDays = days.map((d) => tx(`2026-10-${String(d).padStart(2, '0')}`, weekend.includes(d) ? 300 : 100, 2, `Shop ${d}`))
    const leak = run({ expenses: spendDays, income: [] }).leaks.find((l) => l.key === 'weekend')!
    // A gap of 200 rupees a day, half of it, over about 8.7 weekend days.
    expect(leak.monthlyMinor).toBe(87_000)
    expect(leak.evidence).toContain('200% above weekdays')
  })

  it('does not blame weekends for a payment that leaves on one', () => {
    const weekday = Array.from({ length: 20 }, (_, i) => tx(`2026-10-${String(i + 1).padStart(2, '0')}`, 100, 2, `Shop ${i + 1}`))
    const withEmi = [...weekday, loggedByRule('2026-10-03', 12500, 'Home loan')]
    expect(run({ expenses: withEmi, income: [] }).leaks.some((l) => l.key === 'weekend')).toBe(false)
  })

  it('finds many small purchases that together are a real share', () => {
    // Twelve of 50 rupees and four of 800: the small ones are 16% of the everyday.
    const small = Array.from({ length: 12 }, (_, i) => tx(`2026-10-${String(i + 1).padStart(2, '0')}`, 50, 1, `Kiosk ${i}`))
    const big = [13, 14, 15, 16].map((d) => tx(`2026-10-${d}`, 800, 2, `Store ${d}`))
    const leak = run({ expenses: [...small, ...big], income: [] }).leaks.find((l) => l.key === 'small')!
    expect(leak.title).toBe('12 small purchases add up')
    expect(leak.evidence).toContain('16%')
    expect(leak.monthlyMinor).toBe(23_300)
  })

  it('has no small-purchases finding when there are only a few', () => {
    const few = Array.from({ length: 5 }, (_, i) => tx(`2026-10-0${i + 1}`, 50, 1, `Kiosk ${i}`))
    expect(run({ expenses: few, income: [] }).leaks.some((l) => l.key === 'small')).toBe(false)
  })

  it('gives at most six', () => {
    expect(run().leaks.length).toBeLessThanOrEqual(6)
  })

  it('has none when nothing was spent', () => {
    expect(run({ expenses: [], income: [] }).leaks).toEqual([])
  })
})

describe('buildAiSummary: alerts and the aim', () => {
  it('keeps what is urgent apart: a budget passed, a balance that will not cover, payments that take too much', () => {
    const s = run({ budgetMinor: 800_000, recurring: [emiRule], balance: { set: true, minor: 500_000 } })
    expect(s.alerts.map((a) => a.key).sort()).toEqual(['emi', 'over', 'shortfall'])
    expect(s.alerts.every((a) => a.urgent)).toBe(true)
  })

  it('has no alerts when nothing is wrong', () => {
    expect(run().alerts).toEqual([])
  })

  it('keeps the aim to keep a fifth of what comes in, when spending is heading above it', () => {
    expect(run({ income: [tx('2026-10-01', 14000, 1, 'Employer', 'income')] }).goal?.key).toBe('rate')
    expect(run().goal).toBeNull()
  })
})

describe('buildAiSummary: the next month', () => {
  it('splits it into what leaves on its own and everything else, from the recent months', () => {
    // 7,000, 8,000 and 9,000 of everyday, none of it regular: next near 8,833.
    expect(run().outlook).toMatchObject({ fixedMinor: 0, everydayMinor: 883_300, totalMinor: 883_300 })
  })

  it('says the range it will probably land in', () => {
    const o = run().outlook!
    expect(o.lowMinor).toBeLessThan(o.totalMinor)
    expect(o.highMinor).toBeGreaterThan(o.totalMinor)
    // A spread of about 817 rupees either side, from the months own ups and downs.
    expect(o.totalMinor - o.lowMinor).toBeGreaterThan(70_000)
    expect(o.totalMinor - o.lowMinor).toBeLessThan(95_000)
  })

  it('adds what is set up to leave each month on top of the everyday', () => {
    const o = run({ recurring: [emiRule] }).outlook!
    expect(o.fixedMinor).toBe(1_250_000)
    expect(o.totalMinor).toBe(2_133_300)
  })

  it('takes what left on its own out of the months before working out the everyday', () => {
    // 6,000 rupees of rent added by the recurring feature in each of July, August and September.
    const rent = ['2026-07-01', '2026-08-01', '2026-09-01'].map((d) => loggedByRule(d, 6000, 'Rent'))
    const o = run({ expenses: [...expenses, ...rent] }).outlook!
    // The everyday part is as before; the regular part is what has left in the last months.
    expect(o.everydayMinor).toBe(883_300)
    expect(o.fixedMinor).toBe(600_000)
  })

  it('says a year of it', () => {
    expect(run().outlook!.yearMinor).toBe(10_600_000)
  })

  it('is nothing with fewer than two months to go on', () => {
    expect(run({ expenses: expenses.filter((t) => t.date >= '2026-09') }).outlook).toBeNull()
  })
})
