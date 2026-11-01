// @vitest-environment jsdom
import '../../test/dom'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Category, Transaction } from '../../db/schema'
import { makeLedger } from '../../test/ledger'
import { BalanceTrail } from './BalanceTrail'

const now = new Date(2026, 10, 2, 12, 0).getTime() // Mon 2 Nov 2026, noon
const DAY = 86_400_000
const categories: Category[] = [{ id: 1, name: 'Rent & Housing', color: 'var(--s6)' }]

let id = 0
const tx = (merchant: string, rupees: number, agoMs: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId: 1, merchant, note: '',
  date: '2026-11-01', paymentMethod: '', source: 'manual', createdAt: now - agoMs, ...extra,
})

const mount = (txs: Transaction[]) =>
  render(<BalanceTrail ledger={makeLedger({ txs, categories, categoryById: new Map(categories.map((c) => [c.id, c])) })} now={now} />)
const panel = () => screen.getByRole('region', { name: 'What changed your balance' })

describe('BalanceTrail: where the balance has been moving', () => {
  it('says plainly when the balance moves, and that regular payments never post by themselves', () => {
    mount([tx('Rent', 6000, 1000)])
    expect(panel()).toHaveTextContent('Your balance only moves when an entry is added, edited, deleted or restored, when you import a file, or when you change an exchange rate.')
    expect(panel()).toHaveTextContent('Regular payments never post by themselves: you add them from the Due now card.')
  })

  it('adds up the last week by where the entries came from', () => {
    mount([
      tx('Rent', 6000, 1000, { source: 'recurring' }),
      tx('EMI', 12500, 2000, { source: 'recurring' }),
      tx('Lunch', 120, 3000, { source: 'chat' }),
    ])
    const week = within(panel()).getByRole('list', { name: 'Last 7 days, by where they came from' })
    expect(week).toHaveTextContent('Added from a regular payment')
    expect(week).toHaveTextContent('−₹18,500')
    expect(week).toHaveTextContent('2 entries')
    expect(week).toHaveTextContent('Typed in the chat bar')
    expect(week).toHaveTextContent('1 entry')
  })

  it('lists the latest entries that moved it, each with its source, when it was entered and what it did', () => {
    mount([tx('Rent', 6000, 1000, { source: 'recurring' }), tx('Salary', 80000, 2000, { kind: 'income', source: 'import' })])
    const list = within(panel()).getByRole('list', { name: 'Latest changes' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Rent')
    expect(rows[0]).toHaveTextContent('Added from a regular payment')
    expect(rows[0]).toHaveTextContent('−₹6,000')
    expect(rows[0]).toHaveTextContent(/Entered .*(2 Nov|Nov 2)/)
    expect(rows[1]).toHaveTextContent('Salary')
    expect(rows[1]).toHaveTextContent('Imported from a file')
    expect(rows[1]).toHaveTextContent('+₹80,000')
  })

  it('names an entry by its category when it has no name', () => {
    mount([tx('', 6000, 1000)])
    expect(within(panel()).getByRole('list', { name: 'Latest changes' })).toHaveTextContent('Rent & Housing')
  })

  it('shows an older entry in the list but not in the week', () => {
    mount([tx('Old rent', 6000, 9 * DAY)])
    expect(within(panel()).queryByRole('list', { name: 'Last 7 days, by where they came from' })).toBeNull()
    expect(within(panel()).getByRole('list', { name: 'Latest changes' })).toHaveTextContent('Old rent')
    expect(panel()).toHaveTextContent('Nothing has been entered in the last 7 days.')
  })

  it('says so when nothing has been entered at all', () => {
    mount([])
    expect(panel()).toHaveTextContent('Nothing has been entered yet.')
    expect(within(panel()).queryByRole('list', { name: 'Latest changes' })).toBeNull()
  })

  it('does not show the balance itself, which Home keeps hidden until asked', () => {
    mount([tx('Rent', 6000, 1000)])
    expect(panel()).not.toHaveTextContent(/balance (is|now)/i)
  })
})
