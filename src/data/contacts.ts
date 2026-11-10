import { registerPlugin } from '@capacitor/core'
import { isNativeApp } from '../native/platform'

/** The phone's own contact picker, in the Android app (android/.../ContactPickerPlugin.java). It gives back only the one contact chosen. */
interface NativeContactPicker {
  pick(): Promise<{ contacts: { name?: string; phone?: string }[] }>
}
const nativePicker = registerPlugin<NativeContactPicker>('ContactPicker')

/** A contact the person chose to share. */
export interface PickedContact {
  name: string
  phone?: string
}

/**
 * Whether this browser can open the phone's contacts. Only Chrome on Android can (the Contact Picker API); iPhones, desktop
 * browsers and Firefox cannot, and there nothing is offered. The page can never read the contact list by itself: it can only ask
 * the phone to show its own picker, and receives just the people chosen there.
 */
export function contactsSupported(): boolean {
  if (isNativeApp()) return true
  return typeof navigator !== 'undefined' && !!navigator.contacts && typeof navigator.contacts.select === 'function' && typeof window !== 'undefined' && 'ContactsManager' in window
}

/** The first number of a contact, as the phone gave it, trimmed. */
const firstPhone = (tel?: string[]) => tel?.map((t) => t.trim()).find(Boolean)

/**
 * Opens the phone's contact picker and returns the people chosen (none if it was closed without choosing). It must be called
 * from a tap. Contacts with no name are left out. Throws only if the browser refuses, with a message that can be shown.
 */
export async function pickContacts(multiple: boolean): Promise<PickedContact[]> {
  // The phone's picker lets one contact be chosen at a time, so a person adding several taps again for each.
  if (isNativeApp()) {
    try {
      const { contacts } = await nativePicker.pick()
      return contacts.map((c) => ({ name: (c.name ?? '').trim(), phone: c.phone?.trim() })).filter((c) => c.name !== '').map((c) => (c.phone ? { name: c.name, phone: c.phone } : { name: c.name }))
    } catch {
      throw new Error('Couldn’t open your contacts. Type the name instead.')
    }
  }
  if (!contactsSupported()) throw new Error('This browser can’t open your contacts. Type the name instead.')
  try {
    const picked = await navigator.contacts!.select(['name', 'tel'], { multiple })
    return picked
      .map((c): PickedContact => ({ name: (c.name?.[0] ?? '').trim(), phone: firstPhone(c.tel) }))
      .filter((c) => c.name !== '')
      .map((c) => (c.phone ? c : { name: c.name }))
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return []
    throw new Error('Couldn’t open your contacts. Check that the app is allowed to, or type the name instead.')
  }
}
