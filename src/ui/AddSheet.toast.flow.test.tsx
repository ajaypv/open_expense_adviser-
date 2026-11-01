// @vitest-environment jsdom
import '../test/dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Account, Category } from '../db/schema'
import { AddSheet } from './AddSheet'
import { ToastProvider } from './toast'

const categories: Category[] = [
  { id: 1, name: 'Food & Dining', color: 'var(--s1)' },
  { id: 2, name: 'Groceries', color: 'var(--s2)' },
  { id: 3, name: 'Other', color: 'var(--other)' },
  { id: 4, name: 'Income', color: 'var(--ink-2)' },
]
const accounts: Account[] = [
  { id: 1, name: 'Main', openingMinor: null },
  { id: 2, name: 'Cash', openingMinor: null },
]

function setup(startKind: 'expense' | 'income' = 'expense') {
  render(
    <ToastProvider>
      <AddSheet open editing={null} categories={categories} accounts={accounts} currency="INR" suggestions={[]} showSuggestions={false} prefill={null} startKind={startKind} onClose={vi.fn()} />
    </ToastProvider>,
  )
  return userEvent.setup()
}

const shown = async () => {
  await waitFor(() => expect(document.querySelector('.toast [data-icon]')).not.toBeNull())
  const icon = document.querySelector('.toast [data-icon]') as HTMLElement
  return { icon: icon.getAttribute('data-icon'), color: icon.style.getPropertyValue('--c'), text: document.querySelector('.toast')!.textContent ?? '' }
}

describe('Add form: the pop-up after saving', () => {
  it('shows the icon and colour of the category that was chosen', async () => {
    const user = setup()
    await user.type(screen.getByLabelText('Amount'), '350')
    await user.click(screen.getByLabelText('Groceries'))
    await user.click(screen.getByRole('button', { name: 'Add' }))
    const s = await shown()
    expect(s.icon).toBe('cart')
    expect(s.color).toBe('var(--s2)')
    expect(s.text).toContain('Added ₹350 spent')
  })

  it('shows the icon for Other when no category was picked', async () => {
    const user = setup()
    await user.type(screen.getByLabelText('Amount'), '20')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect((await shown()).icon).toBe('tag')
  })

  it('shows an arrow in, in the colour for money in, when money was received', async () => {
    const user = setup('income')
    await user.type(screen.getByLabelText('Amount'), '5000')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    const s = await shown()
    expect(s.icon).toBe('arrowDown')
    expect(s.color).toBe('var(--good-text)')
  })
})
