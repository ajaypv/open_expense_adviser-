// @vitest-environment jsdom
import './test/dom'
import { render, screen, waitFor } from '@testing-library/react'
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

const categoryId = async (name: string) => (await db.categories.where('name').equals(name).first())!.id

const seed = async (merchant: string, category: string, over: Record<string, unknown> = {}) =>
  db.transactions.add({
    kind: 'expense', amountMinor: 10_000, currency: 'INR', categoryId: await categoryId(category), merchant, note: '',
    date: localDateString(), paymentMethod: '', source: 'manual', createdAt: Date.now() + Math.random(), ...over,
  } as never)

const open = async () => {
  await db.settings.bulkPut([
    { key: 'onboarded', value: true },
    { key: 'lastSeenVersion', value: APP_VERSION },
  ])
  const user = userEvent.setup()
  render(<App />)
  return user
}

/** Types into the chat bar and returns the entry it saved. */
const log = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  const before = await db.transactions.count()
  await user.type(await screen.findByLabelText('Add a transaction'), `${text}{Enter}`)
  await waitFor(async () => expect(await db.transactions.count()).toBe(before + 1))
  const saved = (await db.transactions.orderBy('id').last())!
  return { saved, category: (await db.categories.get(saved.categoryId))!.name }
}

describe('the chat bar learns from what you did before', () => {
  it('files a name under the category you chose for similar names, not the keyword guess', async () => {
    await seed('Zudio kurta', 'Shopping')
    await seed('Zudio shirts', 'Shopping')
    const user = await open()
    expect((await log(user, '500 zudio')).category).toBe('Shopping') // the keywords alone would say Other
  })

  it('lets a newly known word work even though old entries were filed under Other', async () => {
    for (let i = 0; i < 3; i++) await seed('Dosa', 'Other', { source: 'chat' })
    const user = await open()
    expect((await log(user, '60 dosa')).category).toBe('Food & Dining')
  })

  it('uses the way you usually pay when the message does not say', async () => {
    await seed('Uber', 'Transport', { paymentMethod: 'Online' })
    await seed('Uber', 'Transport', { paymentMethod: 'Online' })
    const user = await open()
    expect((await log(user, '230 uber')).saved.paymentMethod).toBe('Online')
  })

  it('lets what you type beat the habit', async () => {
    await seed('Uber', 'Transport', { paymentMethod: 'Online' })
    const user = await open()
    expect((await log(user, '230 uber cash')).saved.paymentMethod).toBe('Cash')
  })

  it('leaves the method empty when there is no habit and none was typed', async () => {
    const user = await open()
    expect((await log(user, '230 uber')).saved.paymentMethod).toBe('')
  })
})
