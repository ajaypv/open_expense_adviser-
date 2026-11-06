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

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }))

beforeEach(() => {
  reloadDisplay()
  resetLockForTests()
})

async function open() {
  await db.settings.bulkPut([
    { key: 'onboarded', value: true },
    { key: 'lastSeenVersion', value: APP_VERSION },
  ])
  await db.people.bulkAdd([
    { name: 'Shweta Rao', phone: '+91 98765 43210', createdAt: 1 },
    { name: 'Ankit Verma', createdAt: 2 },
  ] as never)
  const user = userEvent.setup()
  render(<App />)
  const bar = (await screen.findByLabelText('Add a transaction')) as HTMLTextAreaElement
  // The people are read a moment after the first screen, so wait until the bar has them.
  await waitFor(async () => expect(await db.people.count()).toBe(2))
  return { user, bar }
}

const saved = () => db.transactions.toArray()

describe('The input bar: money sent to a person', () => {
  it('finds the person from "@shw", fills the name in, and logs the amount as sent to her', async () => {
    const { user, bar } = await open()
    await user.click(bar)
    await user.type(bar, '@shw')
    const list = await screen.findByRole('listbox', { name: 'People' })
    await user.click(within(within(list).getAllByRole('option')[0]).getByRole('button'))
    expect(bar).toHaveValue('@Shweta Rao ')
    await user.type(bar, '500{Enter}')

    await waitFor(async () => expect(await saved()).toHaveLength(1))
    const shweta = (await db.people.toArray()).find((p) => p.name === 'Shweta Rao')!
    expect((await saved())[0]).toMatchObject({
      kind: 'expense', amountMinor: 50_000, merchant: 'Shweta Rao', personId: shweta.id, delivery: 'sent', source: 'chat',
    })
    expect(await screen.findByText(/Sent ₹500 to Shweta Rao/)).toBeInTheDocument()
    expect(bar).toHaveValue('')
  })

  it('takes a typed first name, an amount, a note and a day in one line', async () => {
    const { user, bar } = await open()
    await user.type(bar, '@ankit 350 lunch yesterday{Enter}')
    await waitFor(async () => expect(await saved()).toHaveLength(1))
    const [row] = await saved()
    expect(row).toMatchObject({ merchant: 'Ankit Verma', amountMinor: 35_000, note: 'lunch', delivery: 'sent' })
    expect(row.personId).toBe((await db.people.toArray()).find((p) => p.name === 'Ankit Verma')!.id)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    expect(row.date).toBe(localDateString(yesterday))
  })

  it('remembers a new name, once', async () => {
    const { user, bar } = await open()
    await user.type(bar, '@kavya nair 200{Enter}')
    await waitFor(async () => expect(await saved()).toHaveLength(1))
    expect((await db.people.toArray()).map((p) => p.name).sort()).toEqual(['Ankit Verma', 'Kavya Nair', 'Shweta Rao'])
    const kavya = (await db.people.toArray()).find((p) => p.name === 'Kavya Nair')!
    expect((await saved())[0]).toMatchObject({ merchant: 'Kavya Nair', personId: kavya.id })
    await user.type(bar, '@kavya nair 50{Enter}')
    await waitFor(async () => expect(await saved()).toHaveLength(2))
    expect(await db.people.count()).toBe(3)
  })

  it('reads "500 to shweta" as sent to her', async () => {
    const { user, bar } = await open()
    await user.type(bar, '500 to shweta{Enter}')
    await waitFor(async () => expect(await saved()).toHaveLength(1))
    expect((await saved())[0]).toMatchObject({ merchant: 'Shweta Rao', delivery: 'sent' })
  })

  it('leaves an ordinary line alone', async () => {
    const { user, bar } = await open()
    await user.type(bar, '450 lunch at Cafe{Enter}')
    await waitFor(async () => expect(await saved()).toHaveLength(1))
    const [row] = await saved()
    expect(row.personId).toBeUndefined()
    expect(row.delivery).toBeUndefined()
  })

  it('undoes a payment to a person without leaving it in the trash', async () => {
    const { user, bar } = await open()
    await user.type(bar, '@shweta 500{Enter}')
    await waitFor(async () => expect(await saved()).toHaveLength(1))
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect(await saved()).toHaveLength(0))
  })
})
