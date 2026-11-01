// @vitest-environment jsdom
import './test/dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { reloadDisplay } from './data/display'
import { localDateString } from './db/money'
import { db } from './db/schema'
import { APP_VERSION } from './pwa/version'
import { resetLockForTests } from './security/lock'

// The service-worker helper only exists in a real build.
vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }))

beforeEach(() => {
  reloadDisplay()
  resetLockForTests()
})

const onboard = () =>
  db.settings.bulkPut([
    { key: 'onboarded', value: true },
    { key: 'lastSeenVersion', value: APP_VERSION },
  ])

const tx = (over: Record<string, unknown> = {}) =>
  db.transactions.add({
    kind: 'expense', amountMinor: 45_000, currency: 'INR', categoryId: 1, merchant: 'Cafe', note: '', date: localDateString(),
    paymentMethod: '', source: 'manual', createdAt: Date.now() + Math.random(), ...over,
  } as never)

const open = async () => {
  await onboard()
  const user = userEvent.setup()
  render(<App />)
  return user
}

const type = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  await user.type(await screen.findByLabelText('Add a transaction'), `${text}{Enter}`)
}

/** The icon on the pop-up that is showing. */
const island = async () => {
  await waitFor(() => expect(document.querySelector('.toast')).not.toBeNull())
  const icon = document.querySelector('.toast [data-icon]') as HTMLElement
  return { icon: icon.getAttribute('data-icon'), color: icon.style.getPropertyValue('--c'), text: document.querySelector('.toast')!.textContent ?? '' }
}

describe('The pop-up shows which category the money goes to', () => {
  it.each([
    ['450 lunch at Cafe', 'utensils', 'Food & Dining'],
    ['1200 groceries', 'cart', 'Groceries'],
    ['230 uber', 'car', 'Transport'],
    ['999 electricity', 'bolt', 'Bills & Utilities'],
    ['600 pharmacy', 'heart', 'Health'],
    ['500 netflix', 'ticket', 'Entertainment & Travel'],
    ['1500 amazon', 'bag', 'Shopping'],
    ['20 something', 'tag', 'Other'],
  ])('for %s shows the %s icon, beside "to %s"', async (text, icon, category) => {
    const user = await open()
    await type(user, text)
    const shown = await island()
    expect(shown.icon).toBe(icon)
    expect(shown.text).toContain(`to ${category}`)
  })

  it('uses the category’s own colour for the icon', async () => {
    const user = await open()
    await type(user, '450 lunch at Cafe')
    const food = (await db.categories.where('name').equals('Food & Dining').first())!
    expect((await island()).color).toBe(food.color)
  })

  it('shows an arrow in for money received, in the colour that means money in', async () => {
    const user = await open()
    await type(user, 'Salary 80,000')
    const shown = await island()
    expect(shown.icon).toBe('arrowDown')
    expect(shown.color).toBe('var(--good-text)')
  })

  it('shows a list for several entries at once', async () => {
    const user = await open()
    await type(user, 'coffee 120, lunch 340')
    expect((await island()).icon).toBe('list')
  })

  it('says where it went in words too, as before, so nothing depends on the icon', async () => {
    const user = await open()
    await type(user, '20 something')
    expect((await island()).text).toContain('Added ₹20 to Other')
  })
})

describe('The pop-up shows what was done to a transaction', () => {
  it('shows a bin for a delete, with Undo', async () => {
    await tx({ merchant: 'Cafe' })
    const user = await open()
    const nav = within(await screen.findByRole('navigation', { name: 'Main' }))
    await user.click(nav.getByRole('button', { name: 'Activity' }))
    await user.click(await screen.findByRole('button', { name: /Edit spent Cafe/ }))
    const form = await screen.findByRole('dialog', { name: 'Edit transaction' })
    await user.click(within(form).getByRole('button', { name: /Delete/ }))
    const shown = await island()
    expect(shown.icon).toBe('trash')
    expect(shown.text).toContain('Undo')
  })
})
