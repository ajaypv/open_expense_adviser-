import { beforeEach, describe, expect, it, vi } from 'vitest'

const phone = vi.hoisted(() => ({ native: true, pick: vi.fn() }))
vi.mock('../native/platform', () => ({ isNativeApp: () => phone.native }))
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ pick: phone.pick }) }))

import { contactsSupported, pickContacts } from './contacts'

beforeEach(() => {
  phone.native = true
  phone.pick.mockReset()
})

describe('contacts inside the Android app', () => {
  it('can be opened, whatever the browser would say', () => {
    expect(contactsSupported()).toBe(true)
  })

  it('opens the phone’s own picker and gives back the person chosen, with the number', async () => {
    phone.pick.mockResolvedValue({ contacts: [{ name: 'Asha Rao', phone: '+91 98765 43210' }] })
    expect(await pickContacts(false)).toEqual([{ name: 'Asha Rao', phone: '+91 98765 43210' }])
  })

  it('opens it the same way when several are wanted, one person at a time', async () => {
    phone.pick.mockResolvedValue({ contacts: [{ name: 'Asha', phone: '1' }] })
    expect(await pickContacts(true)).toEqual([{ name: 'Asha', phone: '1' }])
    expect(phone.pick).toHaveBeenCalledWith()
  })

  it('gives back nobody when the picker was closed without choosing', async () => {
    phone.pick.mockResolvedValue({ contacts: [] })
    expect(await pickContacts(false)).toEqual([])
  })

  it('trims names and numbers, and leaves out the number when there is none', async () => {
    phone.pick.mockResolvedValue({ contacts: [{ name: '  Ravi  ', phone: '  ' }, { name: 'Meena', phone: ' 555 ' }] })
    expect(await pickContacts(true)).toEqual([{ name: 'Ravi' }, { name: 'Meena', phone: '555' }])
  })

  it('leaves out a contact with no name', async () => {
    phone.pick.mockResolvedValue({ contacts: [{ name: '', phone: '555' }, { phone: '777' }] })
    expect(await pickContacts(false)).toEqual([])
  })

  it('says what to do instead when the phone could not open it', async () => {
    phone.pick.mockRejectedValue(new Error('No contacts app to choose from'))
    await expect(pickContacts(false)).rejects.toThrow('Couldn’t open your contacts. Type the name instead.')
  })
})

describe('contacts in a browser', () => {
  it('do not use the phone’s picker', () => {
    phone.native = false
    expect(contactsSupported()).toBe(false)
  })
})
