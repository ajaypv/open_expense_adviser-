// @vitest-environment jsdom
import '../../test/dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reloadDisplay } from '../../data/display'
import { useLedger } from '../../data/useLedger'
import { db } from '../../db/schema'
import { ToastProvider } from '../../ui/toast'
import { PeopleSection } from './PeopleSection'
import type { Ledger } from './parts'

beforeEach(() => reloadDisplay())

function Live({ children }: { children: (ledger: Ledger) => ReactNode }) {
  return <>{children(useLedger())}</>
}
const mount = () =>
  render(
    <ToastProvider>
      <Live>{(l) => <PeopleSection ledger={l} />}</Live>
    </ToastProvider>,
  )

const person = (name: string, phone?: string) => db.people.add({ name, ...(phone ? { phone } : {}), createdAt: Date.now() } as never) as Promise<number>
const sent = (personId: number, rupees: number, date: string, delivery: 'sent' | 'received' = 'sent') =>
  db.transactions.add({
    kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId: 1, merchant: 'x', note: '', date, paymentMethod: '',
    source: 'manual', createdAt: Date.now(), personId, delivery, ...(delivery === 'received' ? { receivedAt: 1 } : {}),
  } as never) as Promise<number>

describe('People', () => {
  it('lists each person with what was sent to them and what is waiting', async () => {
    const shweta = await person('Shweta Rao', '+91 98765 43210')
    const ankit = await person('Ankit')
    await sent(shweta, 500, '2026-11-01', 'received')
    await sent(shweta, 300, '2026-11-04')
    mount()
    const row = (await screen.findByText('Shweta Rao')).closest('li')!
    expect(within(row).getByText('₹800 sent in 2 payments')).toBeInTheDocument()
    expect(within(row).getByText('₹300 not received')).toBeInTheDocument()
    expect(within(screen.getByText('Ankit').closest('li')!).getByText('Nothing sent yet')).toBeInTheDocument()
    expect(ankit).toBeGreaterThan(0)
    expect(screen.getByText('1 not received')).toBeInTheDocument()
    expect(screen.getByText(/sent across 1 payment and not received yet/)).toBeInTheDocument()
  })

  it('shows the person who was sent to most recently first', async () => {
    const old = await person('Asha')
    const recent = await person('Meera')
    await sent(old, 10, '2026-10-01')
    await sent(recent, 10, '2026-11-02')
    mount()
    await screen.findByText('Meera')
    const names = screen.getAllByRole('button', { expanded: false }).map((b) => b.textContent)
    expect(names.findIndex((t) => t?.includes('Meera'))).toBeLessThan(names.findIndex((t) => t?.includes('Asha')))
  })

  it('opens a person to their payments that have not been received, and marks one received', async () => {
    const shweta = await person('Shweta Rao')
    const first = await sent(shweta, 300, '2026-11-04')
    await sent(shweta, 200, '2026-11-05')
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: /Shweta Rao/ }))
    const pending = screen.getByRole('list', { name: 'Payments to Shweta Rao not received yet' })
    expect(within(pending).getAllByRole('listitem')).toHaveLength(2)
    await user.click(within(within(pending).getAllByRole('listitem')[1]).getByRole('button', { name: 'Mark received' }))
    await waitFor(async () => expect((await db.transactions.get(first))?.delivery).toBe('received'))
    expect(typeof (await db.transactions.get(first))?.receivedAt).toBe('number')
    expect(await screen.findByText('Marked received by Shweta Rao')).toBeInTheDocument()
  })

  it('takes a mark back with Undo', async () => {
    const shweta = await person('Shweta Rao')
    const id = await sent(shweta, 300, '2026-11-04')
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: /Shweta Rao/ }))
    await user.click(screen.getByRole('button', { name: 'Mark received' }))
    await waitFor(async () => expect((await db.transactions.get(id))?.delivery).toBe('received'))
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect((await db.transactions.get(id))?.delivery).toBe('sent'))
  })

  it('marks everything to one person received at once', async () => {
    const shweta = await person('Shweta Rao')
    const a = await sent(shweta, 100, '2026-11-01')
    const b = await sent(shweta, 100, '2026-11-02')
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: /Shweta Rao/ }))
    await user.click(screen.getByRole('button', { name: 'Mark all received' }))
    await waitFor(async () => {
      expect((await db.transactions.get(a))?.delivery).toBe('received')
      expect((await db.transactions.get(b))?.delivery).toBe('received')
    })
    expect(await screen.findByText('Marked 2 payments received by Shweta Rao')).toBeInTheDocument()
  })

  it('says when everything has been received, and shows no waiting total', async () => {
    const shweta = await person('Shweta Rao')
    await sent(shweta, 100, '2026-11-01', 'received')
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: /Shweta Rao/ }))
    expect(screen.getByText('Everything sent to Shweta Rao has been received.')).toBeInTheDocument()
    expect(screen.getByText('All received')).toBeInTheDocument()
    expect(screen.queryByText(/not received yet\./)).toBeNull()
  })

  it('adds a person by name, and refuses an empty one', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter who it was sent to')
    await user.type(screen.getByLabelText('Add a person'), 'Kavya Nair')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(async () => expect((await db.people.toArray()).map((p) => p.name)).toEqual(['Kavya Nair']))
    expect(await screen.findByText('Kavya Nair added')).toBeInTheDocument()
    expect(screen.getByLabelText('Add a person')).toHaveValue('')
  })

  it('removes a person after asking, and keeps their payments in the history', async () => {
    const shweta = await person('Shweta Rao')
    const id = await sent(shweta, 100, '2026-11-01')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: /Shweta Rao/ }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Shweta Rao'))
    await waitFor(async () => expect(await db.people.count()).toBe(0))
    expect(await db.transactions.get(id)).toBeDefined()
    confirm.mockRestore()
  })

  it('leaves the person alone when removing is cancelled', async () => {
    await person('Shweta Rao')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: /Shweta Rao/ }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(await db.people.count()).toBe(1)
    confirm.mockRestore()
  })
})

describe('People: the phone’s contacts', () => {
  const nav = navigator as unknown as { contacts?: unknown }
  const win = window as unknown as { ContactsManager?: unknown }
  afterEach(() => {
    delete nav.contacts
    delete win.ContactsManager
  })

  it('says the browser cannot open contacts, and offers no button, where that is so', async () => {
    mount()
    expect(await screen.findByText(/This browser can’t open your contacts/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add from contacts' })).toBeNull()
  })

  it('adds the people chosen in the phone’s picker, with their numbers, and says how many were new', async () => {
    await person('Ankit')
    const select = vi.fn().mockResolvedValue([
      { name: ['Ankit'], tel: ['1'] },
      { name: ['Meera Shetty'], tel: ['+91 99999 11111'] },
      { name: ['Asha'] },
    ])
    nav.contacts = { select }
    win.ContactsManager = class {}
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Add from contacts' }))
    expect(select).toHaveBeenCalledWith(['name', 'tel'], { multiple: true })
    expect(await screen.findByText('Added 2 people')).toBeInTheDocument()
    const all = await db.people.toArray()
    expect(all.map((p) => p.name).sort()).toEqual(['Ankit', 'Asha', 'Meera Shetty'])
    expect(all.find((p) => p.name === 'Meera Shetty')?.phone).toBe('+91 99999 11111')
  })

  it('says so when everyone chosen was already there', async () => {
    await person('Ankit')
    nav.contacts = { select: vi.fn().mockResolvedValue([{ name: ['ankit'] }]) }
    win.ContactsManager = class {}
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Add from contacts' }))
    expect(await screen.findByText('They are already in your people')).toBeInTheDocument()
  })

  it('says so when the phone refuses', async () => {
    nav.contacts = { select: vi.fn().mockRejectedValue(new DOMException('no', 'SecurityError')) }
    win.ContactsManager = class {}
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Add from contacts' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t open your contacts')
  })
})
