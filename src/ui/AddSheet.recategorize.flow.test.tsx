// @vitest-environment jsdom
import '../test/dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { LedgerTx } from '../data/buildLedger'
import { localDateString } from '../db/money'
import { db } from '../db/schema'
import { AddSheet } from './AddSheet'
import { ToastProvider } from './toast'

const byName = async (name: string) => (await db.categories.where('name').equals(name).first())!.id

const add = async (merchant: string, categoryId: number, extra: Record<string, unknown> = {}) =>
  (await db.transactions.add({
    kind: 'expense', amountMinor: 20_000, currency: 'INR', categoryId, merchant, note: '', date: localDateString(),
    paymentMethod: '', source: 'chat', createdAt: Date.now() + Math.random(), ...extra,
  } as never)) as number

/** Opens the edit sheet for one entry, as tapping its row would. */
async function edit(entryId: number) {
  const categories = await db.categories.toArray()
  const accounts = await db.accounts.toArray()
  const row = (await db.transactions.get(entryId))! as LedgerTx
  render(
    <ToastProvider>
      <AddSheet open editing={row} categories={categories} accounts={accounts} currency="INR" suggestions={[]} showSuggestions={false} prefill={null} startKind="expense" onClose={vi.fn()} />
    </ToastProvider>,
  )
  return userEvent.setup()
}

const toastText = async (match: RegExp) => {
  await waitFor(() => expect(document.querySelector('.toast')?.textContent ?? '').toMatch(match))
  return document.querySelector('.toast')!.textContent ?? ''
}

describe('Edit: moving earlier entries with the same name', () => {
  it('offers to move the earlier entries after you change a category, and moves them when you agree', async () => {
    const other = await byName('Other')
    const food = await byName('Food & Dining')
    const editedId = await add('Cafe', other)
    const earlier = [await add('Cafe', other), await add('cafe', other), await add('Cafe', other)]
    const user = await edit(editedId)

    await user.click(screen.getByLabelText('Food & Dining'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    const text = await toastText(/earlier/)
    expect(text).toContain('3 earlier')
    expect(text).toContain('Cafe')
    expect(text).toContain('Food & Dining')
    // The entry itself is already saved; the others wait for a yes.
    expect((await db.transactions.get(editedId))!.categoryId).toBe(food)
    for (const id of earlier) expect((await db.transactions.get(id))!.categoryId).toBe(other)

    await user.click(screen.getByRole('button', { name: /^Move/ }))
    await waitFor(async () => {
      for (const id of earlier) expect((await db.transactions.get(id))!.categoryId).toBe(food)
    })
    expect(await toastText(/Moved 3/)).toContain('Food & Dining')
  })

  it('says "entry" when there is one', async () => {
    const other = await byName('Other')
    const editedId = await add('Cafe', other)
    await add('Cafe', other)
    const user = await edit(editedId)
    await user.click(screen.getByLabelText('Food & Dining'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await toastText(/earlier/)).toContain('1 earlier')
  })

  it('does not ask when nothing else carries that name', async () => {
    const other = await byName('Other')
    const editedId = await add('Cafe', other)
    await add('Uber', other)
    const user = await edit(editedId)
    await user.click(screen.getByLabelText('Food & Dining'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await toastText(/Changes saved/)).not.toMatch(/earlier/)
  })

  it('does not ask when the category was not changed', async () => {
    const other = await byName('Other')
    const editedId = await add('Cafe', other)
    await add('Cafe', other)
    const user = await edit(editedId)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await toastText(/Changes saved/)).not.toMatch(/earlier/)
  })

  it('does not ask for entries already under the new category', async () => {
    const other = await byName('Other')
    const food = await byName('Food & Dining')
    const editedId = await add('Cafe', other)
    await add('Cafe', food)
    const user = await edit(editedId)
    await user.click(screen.getByLabelText('Food & Dining'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await toastText(/Changes saved/)).not.toMatch(/earlier/)
  })
})
