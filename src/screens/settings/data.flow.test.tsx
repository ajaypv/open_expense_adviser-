// @vitest-environment jsdom
import '../../test/dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLastBackup } from '../../data/backupState'
import { useLedger } from '../../data/useLedger'
import { localDateString } from '../../db/money'
import { db } from '../../db/schema'
import { ToastProvider } from '../../ui/toast'
import { DataSection } from './DataSection'
import type { Ledger } from './parts'

afterEach(() => {
  vi.restoreAllMocks()
  for (const key of ['canShare', 'share']) delete (navigator as unknown as Record<string, unknown>)[key]
})

function Live({ children }: { children: (ledger: Ledger) => ReactNode }) {
  return <>{children(useLedger())}</>
}
const mount = () =>
  render(
    <ToastProvider>
      <Live>{(l) => <DataSection ledger={l} />}</Live>
    </ToastProvider>,
  )

const tx = (over: Record<string, unknown> = {}) =>
  db.transactions.add({
    kind: 'expense', amountMinor: 45_000, currency: 'INR', categoryId: 1, merchant: 'Swiggy', note: '', date: '2026-10-05',
    paymentMethod: '', source: 'manual', createdAt: Date.now() + Math.random(), ...over,
  } as never)

/** Pretend the phone has a share sheet, and keep what was shared. */
function shareSheet(behaviour: 'ok' | 'cancel' = 'ok') {
  const shared: { name: string; text: Promise<string> }[] = []
  Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: vi.fn(async ({ files }: { files: File[] }) => {
      if (behaviour === 'cancel') throw new DOMException('closed', 'AbortError')
      shared.push({ name: files[0].name, text: files[0].text() })
    }),
  })
  return shared
}

const backupFile = (over: Record<string, unknown> = {}, name = 'backup.json') =>
  new File(
    [
      JSON.stringify({
        version: 2, currency: 'INR',
        categories: [{ id: 1, name: 'Food & Dining', color: 'var(--s1)' }],
        transactions: [
          { kind: 'expense', amountMinor: 45_000, currency: 'INR', categoryId: 1, merchant: 'Swiggy', date: '2026-10-05', createdAt: 1000 },
          { kind: 'expense', amountMinor: 23_000, currency: 'INR', categoryId: 1, merchant: 'Uber', date: '2026-10-06', createdAt: 2000 },
        ],
        budgets: [], accounts: [], recurring: [], rates: {},
        ...over,
      }),
    ],
    name,
    { type: 'application/json' },
  )

describe('Back up and export', () => {
  it('keeps backing up and exporting off until there is something to save', async () => {
    mount()
    expect(await screen.findByRole('button', { name: /Back up everything/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Export transactions/ })).toBeDisabled()
  })

  it('shares a backup of everything through the share sheet and records the date', async () => {
    await tx()
    await tx({ merchant: 'Uber' })
    await db.goals.add({ name: 'Trip', targetMinor: 100_000, savedMinor: 5_000, createdAt: 1 } as never)
    const trashed = await tx({ merchant: 'Deleted' })
    await db.transactions.update(trashed, { deletedAt: Date.now() })
    const shared = shareSheet()
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: /Back up everything/ }))
    await waitFor(() => expect(shared).toHaveLength(1))

    expect(shared[0].name).toBe(`expenses-backup-${localDateString()}.json`)
    const backup = JSON.parse(await shared[0].text)
    expect(backup.version).toBe(2)
    expect(backup.transactions.map((t: { merchant: string }) => t.merchant).sort()).toEqual(['Swiggy', 'Uber']) // not the trashed one
    expect(backup.goals).toMatchObject([{ name: 'Trip', savedMinor: 5_000 }])
    expect(backup.accounts).toHaveLength(1)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Backup shared'))
    expect(await getLastBackup()).toBeTypeOf('number')
  })

  it('does not count a backup as made if the share sheet was closed', async () => {
    await tx()
    shareSheet('cancel')
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: /Back up everything/ }))
    await waitFor(() => expect(navigator.share).toHaveBeenCalled())
    expect(screen.queryByRole('status')?.textContent ?? '').toBe('')
    expect(await getLastBackup()).toBeNull()
  })

  it('downloads the file where there is no share sheet', async () => {
    await tx()
    URL.createObjectURL = vi.fn(() => 'blob:backup')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: /Back up everything/ }))
    await waitFor(() => expect(click).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Backup saved to your downloads'))
    expect(await getLastBackup()).toBeTypeOf('number')
  })

  it('exports a spreadsheet with a header and one row per transaction', async () => {
    await tx()
    await tx({ merchant: 'Uber', amountMinor: 23_000 })
    const shared = shareSheet()
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: /Export transactions/ }))
    await waitFor(() => expect(shared).toHaveLength(1))
    expect(shared[0].name).toBe(`expenses-${localDateString()}.csv`)
    const lines = (await shared[0].text).split('\n')
    expect(lines[0]).toBe('date,type,amount,currency,category,merchant,note,payment_method,source,latitude,longitude,account,to_account')
    expect(lines).toHaveLength(3)
    expect(lines.join('\n')).toContain('Swiggy')
    expect(lines.join('\n')).toContain('Food & Dining')
  })
})

describe('Restore from a backup', () => {
  const choose = async (user: ReturnType<typeof userEvent.setup>, file: File) => user.upload(await screen.findByLabelText('Backup file'), file)

  it('shows what the file holds before changing anything', async () => {
    const user = userEvent.setup()
    mount()
    await choose(user, backupFile())
    expect(await screen.findByText('backup.json')).toBeInTheDocument()
    expect(screen.getByText(/2 transactions in this file, 2 new\./)).toBeInTheDocument()
    expect(await db.transactions.count()).toBe(0)
  })

  it('adds what is missing, and says how many', async () => {
    const user = userEvent.setup()
    mount()
    await choose(user, backupFile())
    await user.click(await screen.findByRole('button', { name: 'Add what’s missing' }))
    await waitFor(async () => expect(await db.transactions.count()).toBe(2))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Restored 2 transactions'))
    expect(screen.queryByText('backup.json')).toBeNull() // the summary closes
  })

  it('restoring the same file again adds nothing', async () => {
    const user = userEvent.setup()
    mount()
    await choose(user, backupFile())
    await user.click(await screen.findByRole('button', { name: 'Add what’s missing' }))
    await waitFor(async () => expect(await db.transactions.count()).toBe(2))
    await choose(user, backupFile())
    expect(await screen.findByText(/none of them new/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add what’s missing' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Restored 0 transactions, 2 already here'))
    expect(await db.transactions.count()).toBe(2)
  })

  it('keeps what is already here when merging', async () => {
    await tx({ merchant: 'Cafe', createdAt: 5 })
    const user = userEvent.setup()
    mount()
    await choose(user, backupFile())
    await user.click(await screen.findByRole('button', { name: 'Add what’s missing' }))
    await waitFor(async () => expect(await db.transactions.count()).toBe(3))
  })

  it('replaces everything only after confirming', async () => {
    await tx({ merchant: 'Cafe', createdAt: 5 })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    mount()
    await choose(user, backupFile())
    await user.click(await screen.findByRole('button', { name: 'Replace everything' }))
    expect(await db.transactions.count()).toBe(1) // declined: nothing changed
    expect(screen.getByText('backup.json')).toBeInTheDocument()

    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Replace everything' }))
    await waitFor(async () => expect((await db.transactions.toArray()).map((t) => t.merchant).sort()).toEqual(['Swiggy', 'Uber']))
  })

  it('restores goals that are in the file', async () => {
    const user = userEvent.setup()
    mount()
    await choose(user, backupFile({ goals: [{ name: 'Trip', targetMinor: 100_000, savedMinor: 40_000 }] }))
    await user.click(await screen.findByRole('button', { name: 'Add what’s missing' }))
    await waitFor(async () => expect(await db.goals.toArray()).toMatchObject([{ name: 'Trip', savedMinor: 40_000 }]))
  })

  it('cancels without changing anything', async () => {
    const user = userEvent.setup()
    mount()
    await choose(user, backupFile())
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('backup.json')).toBeNull()
    expect(await db.transactions.count()).toBe(0)
  })

  it.each([
    ['text that is not JSON', 'hello there', /isn.t a backup/],
    ['a file of the wrong shape', JSON.stringify({ version: 2, transactions: [{ amountMinor: -1, date: 'soon' }] }), /can.t be used/],
    ['a backup from a newer app', JSON.stringify({ version: 9, transactions: [] }), /newer version/],
  ])('explains plainly when given %s', async (_what, content, message) => {
    const user = userEvent.setup()
    mount()
    await choose(user, new File([content as string], 'bad.json', { type: 'application/json' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message as RegExp)
    expect(screen.queryByRole('button', { name: 'Add what’s missing' })).toBeNull()
    expect(await db.transactions.count()).toBe(0)
  })

  it('refuses a file too large to be a backup, without reading it', async () => {
    const big = new File(['x'], 'big.json', { type: 'application/json' })
    Object.defineProperty(big, 'size', { value: 30 * 1024 * 1024 })
    const user = userEvent.setup()
    mount()
    await choose(user, big)
    expect(await screen.findByRole('alert')).toHaveTextContent('That file is too large to be a backup.')
  })
})

describe('Recently deleted', () => {
  const trashed = (merchant: string, daysAgo: number) =>
    tx({ merchant, deletedAt: Date.now() - daysAgo * 86_400_000, createdAt: Math.random() })

  it('says when there is nothing in the trash', async () => {
    mount()
    expect(await screen.findByText('Nothing here')).toBeInTheDocument()
  })

  it('lists what was deleted and how long each has left', async () => {
    await trashed('Swiggy', 2)
    mount()
    expect(await screen.findByText('1 kept for 30 days')).toBeInTheDocument()
    expect(screen.getByText(/28 days left/)).toBeInTheDocument()
  })

  it('restores one transaction', async () => {
    const id = (await trashed('Swiggy', 1)) as number
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByText('Recently deleted'))
    await user.click(await screen.findByRole('button', { name: 'Restore' }))
    await waitFor(async () => expect((await db.transactions.get(id))!.deletedAt).toBeUndefined())
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Restored'))
  })

  it('deletes one for good', async () => {
    const id = (await trashed('Swiggy', 1)) as number
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByText('Recently deleted'))
    await user.click(await screen.findByRole('button', { name: 'Delete Swiggy for good' }))
    await waitFor(async () => expect(await db.transactions.get(id)).toBeUndefined())
  })

  it('empties the trash only after confirming', async () => {
    await trashed('A', 1)
    await trashed('B', 2)
    await tx({ merchant: 'Kept' }) // not deleted: must survive
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByText('Recently deleted'))
    await user.click(await screen.findByRole('button', { name: 'Empty the trash' }))
    expect(await db.transactions.count()).toBe(3)
    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Empty the trash' }))
    await waitFor(async () => expect((await db.transactions.toArray()).map((t) => t.merchant)).toEqual(['Kept']))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Deleted 2 for good'))
  })
})
