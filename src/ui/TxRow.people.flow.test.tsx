// @vitest-environment jsdom
import '../test/dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LedgerTx } from '../data/buildLedger'
import type { Category } from '../db/schema'
import { TxRow } from './TxRow'

const category: Category = { id: 3, name: 'Other', color: 'var(--other)' }
const row = (over: Partial<LedgerTx> = {}): LedgerTx => ({
  id: 1, kind: 'expense', amountMinor: 50_000, currency: 'INR', categoryId: 3, merchant: 'Shweta Rao', note: '', date: '2026-11-05',
  paymentMethod: '', source: 'manual', createdAt: 1, ...over,
})
const show = (tx: LedgerTx) => render(<TxRow tx={tx} category={category} currency="INR" onClick={vi.fn()} />)

describe('A payment to a person in the list', () => {
  it('shows a person’s icon and says it has not been received yet', () => {
    const { container } = show(row({ personId: 1, delivery: 'sent' }))
    expect(container.querySelector('[data-icon="person"]')).toBeInTheDocument()
    expect(screen.getByText('Not received yet')).toHaveAttribute('data-delivery', 'sent')
    expect(screen.getByRole('button')).toHaveAccessibleName(expect.stringContaining('not received yet'))
  })

  it('says Received, with a tick, once it has been', () => {
    const { container } = show(row({ personId: 1, delivery: 'received', receivedAt: 5 }))
    const chip = screen.getByText('Received')
    expect(chip).toHaveAttribute('data-delivery', 'received')
    expect(chip.querySelector('svg')).toBeInTheDocument()
    expect(container.querySelector('[data-icon="person"]')).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAccessibleName(expect.stringContaining('received'))
  })

  it('still shows the name when the person has since been removed', () => {
    show(row({ delivery: 'sent' }))
    expect(screen.getByText('Shweta Rao')).toBeInTheDocument()
  })

  it('leaves an ordinary purchase and received money as they were', () => {
    const { container, unmount } = show(row({ merchant: 'Cafe' }))
    expect(screen.queryByText('Not received yet')).toBeNull()
    expect(container.querySelector('[data-icon="person"]')).toBeNull()
    unmount()
    show(row({ kind: 'income', merchant: 'Employer', delivery: 'sent' }))
    expect(screen.queryByText('Not received yet')).toBeNull()
  })
})
