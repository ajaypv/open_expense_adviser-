import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Category, Recurring, Transaction } from '../db/schema'
import { buildAiSummary, type AiInput } from '../insights/ai'
import { buildWidgetData } from './data'

const categories = new Map<number, Category>([
  [1, { id: 1, name: 'Food', color: 'var(--s1)' }],
  [2, { id: 2, name: 'Travel', color: 'var(--s2)' }],
  [3, { id: 3, name: 'Shopping', color: 'var(--s3)' }],
])

let id = 0
const tx = (date: string, rupees: number, categoryId: number, merchant: string, kind: Transaction['kind'] = 'expense'): Transaction => ({
  id: ++id, kind, amountMinor: rupees * 100, currency: 'INR', categoryId, merchant, note: '', date, paymentMethod: '', source: 'manual', createdAt: id,
})

// Today is Tuesday 20 October 2026; 9,000 spent so far, last month 9,000 in all.
const expenses = [
  tx('2026-08-10', 6000, 1, 'Groceries'), tx('2026-08-12', 2000, 2, 'Cab'),
  tx('2026-09-03', 3000, 1, 'Groceries'), tx('2026-09-10', 2000, 1, 'Groceries'), tx('2026-09-15', 1000, 2, 'Cab'),
  tx('2026-09-25', 2000, 1, 'Groceries'), tx('2026-09-27', 1000, 2, 'Cab'),
  ...['2026-10-02', '2026-10-04', '2026-10-08', '2026-10-12', '2026-10-17'].map((d) => tx(d, 400, 1, 'Swiggy')),
  tx('2026-10-05', 3000, 1, 'Groceries'), tx('2026-10-06', 1500, 2, 'Cab'), tx('2026-10-15', 2500, 3, 'Shoes'),
]
const emi = (nextDue: string): Recurring => ({
  id: ++id, kind: 'expense', amountMinor: 1_250_000, currency: 'INR', categoryId: 1, merchant: 'Home loan', note: '', paymentMethod: '',
  frequency: 'monthly', nextDue, active: true, tag: 'loan',
})

const money = (m: number) => `₹${m / 100}`
const NOW = new Date(2026, 9, 20, 18, 30)
const base: AiInput = {
  expenses, income: [], categoryById: categories, month: '2026-10', today: NOW, budgetMinor: null, recurring: [], currency: 'INR', rates: {},
  balance: { set: false, minor: 0 }, money, dayLabel: (d) => d,
}
const data = (over: Partial<AiInput> = {}, now = NOW) => buildWidgetData(buildAiSummary({ ...base, ...over, today: now }), money, now)

describe('buildWidgetData', () => {
  it('says which month it is, and how much has been spent in it', () => {
    expect(data()).toMatchObject({ title: 'October so far', spent: '₹9000', spentLabel: 'Spent so far' })
  })

  it('says where the month is heading, and how that compares with last month when there is no budget', () => {
    const d = data()
    expect(d.headline).toMatch(/^Heading for about ₹13\d{3}$/)
    expect(d.detail).toMatch(/^\d+% more than September$/)
    expect(d.perDay).toBe('')
  })

  it('says how far inside the budget the month will end, and what can be spent a day', () => {
    const d = data({ budgetMinor: 2_000_000 })
    expect(d.detail).toMatch(/^₹6\d{3} inside your budget$/)
    expect(d.perDay).toBe('About ₹1000 a day keeps you inside it')
    expect(d.tone).toBe('Good')
  })

  it('says how far over the budget it will end', () => {
    const d = data({ budgetMinor: 1_200_000 })
    expect(d.detail).toMatch(/^₹1\d{3} over your budget$/)
    expect(d.tone).toBe('Warning')
  })

  it('says it plainly when the budget has been passed', () => {
    const d = data({ budgetMinor: 800_000 })
    expect(d).toMatchObject({ headline: 'Over budget by ₹1000', detail: 'Passed your ₹8000 budget', tone: 'Attention' })
  })

  it('colours the headline by how the month is going', () => {
    expect(data({ budgetMinor: 2_000_000 }).tone).toBe('Good')
    expect(data().tone).toBe('Warning') // spending up 50% on last month
    expect(data({ budgetMinor: 800_000 }).tone).toBe('Attention')
    expect(data({ expenses: [] }).tone).toBe('Default')
  })

  it('says there is nothing yet when nothing has been spent', () => {
    expect(data({ expenses: [] })).toMatchObject({ spent: '₹0', headline: 'Nothing spent yet', detail: '', perDay: '' })
  })

  it('says it is too early in the first days of a month', () => {
    const early = new Date(2026, 9, 2, 9, 0)
    expect(data({}, early).headline).toBe('Too early to say where it ends')
  })

  it('speaks of a month that is over as spent, not so far', () => {
    expect(data({ month: '2026-09' })).toMatchObject({ title: 'September', spentLabel: 'Spent', headline: 'Spent in September' })
  })

  it('names the next payment that leaves on its own, and how soon', () => {
    expect(data({ recurring: [emi('2026-10-28')] }).next).toBe('Next: Home loan ₹12500, in 8 days')
    expect(data({ recurring: [emi('2026-10-21')] }).next).toBe('Next: Home loan ₹12500, tomorrow')
    expect(data({ recurring: [emi('2026-10-20')] }).next).toBe('Next: Home loan ₹12500, today')
  })

  it('says a payment that should have left is late', () => {
    expect(data({ recurring: [emi('2026-10-18')] }).next).toBe('Next: Home loan ₹12500, late')
  })

  it('has no next payment when nothing is set up, or what is set up is for next month', () => {
    expect(data().next).toBe('')
    expect(data({ recurring: [emi('2026-11-05')] }).next).toBe('')
  })

  it('says when it was worked out, since the widget only changes when the app is opened', () => {
    expect(data().updated).toMatch(/^Updated .+, .+/)
  })

  it('shows amounts the way the app was told to, so hidden amounts stay hidden', () => {
    const masked = buildWidgetData(buildAiSummary({ ...base, budgetMinor: 2_000_000, recurring: [emi('2026-10-28')] }), () => '₹••••', NOW)
    // No amount shows (the number of days to a payment is not an amount).
    for (const field of ['spent', 'headline', 'detail', 'perDay', 'next'] as const) expect(masked[field].replace(/in \d+ days/, ''), field).not.toMatch(/\d/)
  })
})

describe('the widget files', () => {
  const template = readFileSync('public/widgets/spending-template.json', 'utf8')
  const placeholder = JSON.parse(readFileSync('public/widgets/spending-data.json', 'utf8')) as Record<string, string>
  const fields = Object.keys(data())

  it('is an Adaptive Card that Windows can draw: version 1.5, with its schema, and a button that opens the app', () => {
    const card = JSON.parse(template)
    expect(card).toMatchObject({ type: 'AdaptiveCard', version: '1.5', $schema: 'http://adaptivecards.io/schemas/adaptive-card.json' })
    expect(card.actions).toEqual([{ type: 'Action.Execute', title: 'Open Expense Tracker', verb: 'open' }])
  })

  it('asks only for fields the app provides', () => {
    const asked = [...template.matchAll(/\$\{(\w+)/g)].map((m) => m[1])
    expect(asked.length).toBeGreaterThan(5)
    for (const field of asked) expect(fields, field).toContain(field)
  })

  it('uses every field the app provides', () => {
    for (const field of fields) expect(template, field).toContain(`\${${field}`)
  })

  it('shows the lines that can be empty only when they are not', () => {
    const card = JSON.parse(template)
    const conditional = card.body.filter((b: { $when?: string }) => b.$when).map((b: { text: string }) => b.text)
    expect(conditional.sort()).toEqual(['${detail}', '${next}', '${perDay}'])
  })

  it('has a placeholder with exactly the same fields, for before the app has left any figures', () => {
    expect(Object.keys(placeholder).sort()).toEqual([...fields].sort())
  })

  it('colours with names Adaptive Cards knows', () => {
    expect(['Default', 'Good', 'Warning', 'Attention', 'Accent']).toContain(placeholder.tone)
    for (const tone of [data().tone, data({ budgetMinor: 800_000 }).tone, data({ expenses: [] }).tone]) expect(['Default', 'Good', 'Warning', 'Attention', 'Accent']).toContain(tone)
  })

  it('has a picker screenshot of the size Windows asks for: 300 by 304', () => {
    const png = readFileSync('public/widgets/spending-screenshot.png')
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([300, 304])
  })

  it('is declared in the manifest, pointing at files that exist, with the tag the worker is told about', () => {
    const config = readFileSync('vite.config.ts', 'utf8')
    expect(config).toContain("tag: 'spending'")
    expect(config).toContain("ms_ac_template: 'widgets/spending-template.json'")
    expect(config).toContain("data: 'widgets/spending-data.json'")
    expect(config).toContain("sizes: '300x304'")
    expect(config).toContain('json}') // the worker fetches the template, so it is precached
  })
})
