import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LedgerTx } from '../data/buildLedger'
import type { Account, Category, Recurring } from '../db/schema'
import { makeLedger } from '../test/ledger'
import { DueCard, LogNudge } from './HomeCards'
import { TxList } from './TxList'
import { TxRow } from './TxRow'
import { WalletPanel } from './WalletPanel'

const food: Category = { id: 1, name: 'Food & Dining', color: 'var(--s1)' }
const accounts = new Map<number, Account>([
  [1, { id: 1, name: 'Main', openingMinor: null }],
  [2, { id: 2, name: 'Cash', openingMinor: null }],
])

let id = 0
const tx = (over: Partial<LedgerTx> = {}): LedgerTx => ({
  id: ++id, kind: 'expense', amountMinor: 45000, currency: 'INR', categoryId: 1, merchant: 'Swiggy', note: '', date: '2026-10-28',
  paymentMethod: '', source: 'manual', createdAt: id, ...over,
})

const row = (t: LedgerTx, props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(TxRow, { tx: t, category: food, currency: 'INR', accountById: accounts, onClick: () => {}, ...props }))

describe('TxRow: transfers', () => {
  const transfer = tx({ kind: 'transfer', merchant: '', amountMinor: 200_000, accountId: 1, toAccountId: 2 })

  it('shows where the money moved, with no category and no plus sign', () => {
    const html = row(transfer)
    expect(html).toContain('Transfer')
    expect(html).toContain('Main to Cash')
    expect(html).toContain('₹2,000')
    expect(html).not.toContain('+₹')
    expect(html).not.toContain('Food &amp; Dining</span>')
    expect(html).toContain('aria-label="Edit transfer Transfer, ₹2,000"')
  })
})

describe('TxRow: other currencies', () => {
  const dollars = tx({ amountMinor: 83_500, currency: 'INR', originalMinor: 1_000, originalCurrency: 'USD' })

  it('shows what was paid, with the converted amount beneath', () => {
    const html = row(dollars)
    expect(html).toContain('$10')
    expect(html).toContain('≈ ₹835')
    expect(html).toContain('aria-label="Edit sent Swiggy, $10"')
  })

  it('says a rate is missing instead of showing a made-up conversion', () => {
    const html = row({ ...dollars, amountMinor: 1_000, unconverted: true })
    expect(html).toContain('No USD rate set')
    expect(html).not.toContain('≈')
  })

  it('shows nothing extra for a transaction already in the main currency', () => {
    expect(row(tx())).not.toContain('≈')
  })
})

describe('TxRow: select mode', () => {
  it('becomes a checkbox that says whether it is ticked', () => {
    const off = row(tx(), { selecting: true, selected: false })
    expect(off).toContain('role="checkbox"')
    expect(off).toContain('aria-checked="false"')
    expect(off).toContain('aria-label="Select sent Swiggy')
    const on = row(tx(), { selecting: true, selected: true })
    expect(on).toContain('aria-checked="true"')
    expect(on).toContain('aria-label="Selected sent Swiggy')
  })

  it('is a plain button otherwise', () => {
    expect(row(tx())).not.toContain('role="checkbox"')
  })
})

describe('TxList swiping', () => {
  const rows = [tx({ merchant: 'A' }), tx({ merchant: 'B' })]
  const list = (props: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(TxList, { rows, categoryById: new Map([[1, food]]), currency: 'INR', onEdit: () => {}, ...props }))

  it('puts Copy and Delete just past each row, hidden from screen readers, when swiping is on', () => {
    const html = list({ swipe: { onCopy: () => {}, onDelete: () => {} } })
    expect((html.match(/>Copy</g) ?? []).length).toBe(2)
    expect((html.match(/>Delete</g) ?? []).length).toBe(2)
    expect(html).toContain('snap-x')
    expect(html).toContain('aria-hidden="true"><button type="button" tabindex="-1"')
  })

  it('has no swipe actions on a list that does not swipe, or in select mode', () => {
    expect(list({})).not.toContain('>Copy<')
    expect(list({ swipe: { onCopy: () => {}, onDelete: () => {} }, selection: { ids: new Set([1]), onToggle: () => {} } })).not.toContain('>Copy<')
  })
})

describe('Home cards', () => {
  const rule = (over: Partial<Recurring> = {}): Recurring => ({
    id: 1, kind: 'expense', amountMinor: 1_800_000, currency: 'INR', categoryId: 1, merchant: 'Rent', note: '',
    paymentMethod: '', frequency: 'monthly', nextDue: '2026-10-01', active: true, ...over,
  })
  const today = new Date(2026, 9, 28)
  const due = (recurring: Recurring[]) => renderToStaticMarkup(createElement(DueCard, { ledger: makeLedger({ recurring, categoryById: new Map([[1, food]]) }), today }))

  it('lists what is due, with Add and Skip for each', () => {
    const html = due([rule()])
    expect(html).toContain('Due now')
    expect(html).toContain('Rent')
    expect(html).toContain('₹18,000')
    expect(html).toContain('>Add<')
    expect(html).toContain('>Skip<')
  })

  it('offers Add all, and counts missed ones, when several are due', () => {
    const html = due([rule({ nextDue: '2026-08-01' })]) // Aug, Sep and Oct have all come due
    expect(html).toContain('Add all 3')
    expect(html).toContain('(3 due)')
  })

  it('shows nothing when nothing is due, or a rule is paused', () => {
    expect(due([])).toBe('')
    expect(due([rule({ nextDue: '2026-11-01' })])).toBe('')
    expect(due([rule({ active: false })])).toBe('')
  })

  it('nudges to log when nothing was added today', () => {
    expect(renderToStaticMarkup(createElement(LogNudge, { onAdd: () => {} }))).toContain('Nothing logged today yet')
  })
})

describe('WalletPanel balances by account', () => {
  const base = {
    monthName: 'October', sentMinor: 0, receivedMinor: 0, currency: 'INR', balanceMinor: 500_000, balanceSet: true,
    onToggle: () => {}, onSetBalance: () => {},
  }
  const lines = [{ id: 1, name: 'Main', estimatedMinor: 400_000 }, { id: 2, name: 'Cash', estimatedMinor: 100_000 }]
  const render = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(WalletPanel, { ...base, ...props } as never))

  it('lists each account only once the balance is revealed', () => {
    expect(render({ shown: false, accountLines: lines })).not.toContain('Cash')
    expect(render({ shown: false, accountLines: lines })).not.toContain('4,000')
    const shown = render({ shown: true, accountLines: lines })
    expect(shown).toContain('Balance by account')
    expect(shown).toContain('Main')
    expect(shown).toContain('₹4,000')
    expect(shown).toContain('₹1,000')
  })

  it('does not bother listing a single account', () => {
    expect(render({ shown: true, accountLines: lines.slice(0, 1) })).not.toContain('Balance by account')
  })
})
