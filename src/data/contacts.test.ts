// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { contactsSupported, pickContacts } from './contacts'

const nav = navigator as unknown as { contacts?: unknown }
const win = window as unknown as { ContactsManager?: unknown }

function support(select: (...args: unknown[]) => unknown) {
  nav.contacts = { select }
  win.ContactsManager = class {}
}

afterEach(() => {
  delete nav.contacts
  delete win.ContactsManager
})

describe('contactsSupported', () => {
  it('is false where the browser has no contact picker', () => {
    expect(contactsSupported()).toBe(false)
  })

  it('is true where it does', () => {
    support(vi.fn())
    expect(contactsSupported()).toBe(true)
  })

  it('needs both the manager and the picker', () => {
    nav.contacts = { select: vi.fn() }
    expect(contactsSupported()).toBe(false)
  })
})

describe('pickContacts', () => {
  it('asks only for names and numbers, and for one or several as told', async () => {
    const select = vi.fn().mockResolvedValue([])
    support(select)
    await pickContacts(true)
    expect(select).toHaveBeenCalledWith(['name', 'tel'], { multiple: true })
    await pickContacts(false)
    expect(select).toHaveBeenLastCalledWith(['name', 'tel'], { multiple: false })
  })

  it('returns the first name and first number of each contact, trimmed, and leaves out the nameless', async () => {
    support(
      vi.fn().mockResolvedValue([
        { name: ['  Shweta Rao '], tel: [' +91 98765 43210 ', '+91 11111 11111'] },
        { name: ['Ankit'], tel: [] },
        { name: [''], tel: ['123'] },
        { tel: ['456'] },
      ]),
    )
    expect(await pickContacts(true)).toEqual([{ name: 'Shweta Rao', phone: '+91 98765 43210' }, { name: 'Ankit' }])
  })

  it('returns nobody when the picker is closed without choosing', async () => {
    support(vi.fn().mockResolvedValue([]))
    expect(await pickContacts(false)).toEqual([])
    support(vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError')))
    expect(await pickContacts(false)).toEqual([])
  })

  it('says so in plain words when the browser refuses, and when there is no picker at all', async () => {
    support(vi.fn().mockRejectedValue(new DOMException('no tap', 'SecurityError')))
    await expect(pickContacts(false)).rejects.toThrow(/Couldn’t open your contacts/)
    delete nav.contacts
    delete win.ContactsManager
    await expect(pickContacts(false)).rejects.toThrow(/can’t open your contacts/)
  })
})
