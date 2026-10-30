import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Category, Transaction } from '../db/schema'
import { TxList } from './TxList'
import { TxRow } from './TxRow'

const food: Category = { id: 1, name: 'Food & Dining', color: 'var(--s1)' }
const income: Category = { id: 2, name: 'Income', color: 'var(--ink-2)' }

const tx = (extra: Partial<Transaction> = {}): Transaction => ({
  id: 1, kind: 'expense', amountMinor: 45000, currency: 'INR', categoryId: 1, merchant: 'Swiggy', note: '',
  date: '2026-10-28', paymentMethod: '', source: 'manual', createdAt: new Date(2026, 9, 28, 19, 42).getTime(),
  ...extra,
})

const row = (t: Transaction, category: Category | undefined = food, props: { showTime?: boolean; showDate?: boolean } = {}) =>
  renderToStaticMarkup(createElement(TxRow, { tx: t, category, currency: 'INR', onClick: () => {}, ...props }))

describe('TxRow', () => {
  it('shows merchant, category, payment method, note and amount', () => {
    const html = row(tx({ paymentMethod: 'Online', note: 'Team lunch' }))
    for (const text of ['Swiggy', 'Food &amp; Dining', 'Online', 'Team lunch', '₹450']) expect(html).toContain(text)
  })

  it('does not repeat the category when it is already the title', () => {
    const html = row(tx({ merchant: '' }))
    expect((html.match(/Food &amp; Dining/g) ?? []).length).toBe(2) // title + the spoken label, not a second subtitle
    expect(html).not.toContain('size-2 shrink-0 rounded-full')
  })

  it('draws money received with an arrow, a plus and the green text token', () => {
    const html = row(tx({ kind: 'income', merchant: 'Employer', amountMinor: 8_000_000, categoryId: 2 }), income)
    expect(html).toContain('+₹80,000')
    expect(html).toContain('text-good')
    expect(html).toContain('<svg') // the arrow replaces the initial
    expect(html).not.toContain('>E<')
    expect(row(tx())).toContain('>S<') // a purchase keeps its initial
  })

  it('shows the time only when asked and only when it is the time of the transaction itself', () => {
    expect(row(tx(), food, { showTime: true })).toMatch(/\d{1,2}:42/)
    expect(row(tx(), food)).not.toMatch(/\d{1,2}:42/) // not asked for
    // Logged on the 29th for a transaction dated the 20th: the entry time says nothing about it.
    const backdated = tx({ date: '2026-10-20', createdAt: new Date(2026, 9, 29, 9, 5).getTime() })
    expect(row(backdated, food, { showTime: true })).not.toMatch(/\d{1,2}:05/)
  })

  it('keeps a spoken label and flags saved locations', () => {
    const html = row(tx({ location: { lat: 1, lon: 2, accuracyM: 3 } }))
    expect(html).toContain('aria-label="Edit spent Swiggy, ₹450, Food &amp; Dining, added with location"')
    expect(html).toContain('Added with location')
  })

  it('never prints NaN or undefined', () => {
    expect(row(tx({ merchant: '', note: '' }), undefined, { showTime: true, showDate: true })).not.toMatch(/NaN|undefined/)
  })
})

describe('TxList', () => {
  it('renders one row per transaction in a single card', () => {
    const rows = [tx({ id: 1, merchant: 'Swiggy' }), tx({ id: 2, merchant: 'Uber' }), tx({ id: 3, merchant: 'Cafe' })]
    const html = renderToStaticMarkup(
      createElement(TxList, { rows, categoryById: new Map([[1, food]]), currency: 'INR', showTime: true, onEdit: () => {} }),
    )
    expect((html.match(/<li /g) ?? []).length).toBe(3)
    expect((html.match(/<ul /g) ?? []).length).toBe(1)
    for (const name of ['Swiggy', 'Uber', 'Cafe']) expect(html).toContain(name)
  })
})

describe('TxRow spoken label', () => {
  it('carries what the eye sees: category, date and note, not only the title and amount', () => {
    const html = row(tx({ note: 'with the team', date: '2026-10-20' }), food, { showDate: true })
    expect(html).toMatch(/aria-label="Edit spent Swiggy, ₹450, Food &amp; Dining, (20 Oct|Oct 20)[^"]*, note: with the team"/)
  })

  it('leaves the date out when the list does not show it', () => {
    expect(row(tx({ date: '2026-10-20' }), food)).not.toMatch(/aria-label="[^"]*(20 Oct|Oct 20)/)
  })
})
