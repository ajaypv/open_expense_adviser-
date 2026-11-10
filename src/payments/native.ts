import { registerPlugin } from '@capacitor/core'
import { isNativeApp } from '../native/platform'
import type { NativeApp } from './apps'

/** A payment the person answered a pop-up for, waiting to be put in the app. */
export interface PendingPayment {
  id: number
  /** 'add': the Add button was pressed. 'edit': the pop-up was touched, to look at it first. */
  state: 'add' | 'edit'
  amountMinor: number
  /** Who it went to or came from; empty when the notification did not say. */
  merchant: string
  income: boolean
  /** The Android package of the app whose notification it was. */
  package: string
  /** When the notification arrived. */
  at: number
}

/** A notification from a payment app that had an amount in it but could not be understood. */
export interface UnreadPayment {
  package: string
  text: string
  at: number
}

export interface PaymentStatus {
  /** Whether the person has allowed notification access, which this needs. */
  listening: boolean
  /** Whether the phone lets this app show its pop-ups. */
  notifications: boolean
  /** Whether the person (or the app, with its defaults) has chosen apps yet. */
  configured: boolean
  apps: NativeApp[]
  unread: UnreadPayment[]
}

/** The Android side (android/.../PaymentBridgePlugin.java). */
interface PaymentBridge {
  getStatus(): Promise<PaymentStatus>
  setApps(options: { apps: NativeApp[] }): Promise<void>
  openListenerSettings(): Promise<void>
  openAppSettings(): Promise<void>
  takePending(): Promise<{ payments: PendingPayment[] }>
  clearUnread(): Promise<void>
}

const bridge = registerPlugin<PaymentBridge>('PaymentBridge')

/** How things stand, or null where there is no phone to ask (a browser) or it would not say. */
export async function readStatus(): Promise<PaymentStatus | null> {
  if (!isNativeApp()) return null
  try {
    return await bridge.getStatus()
  } catch {
    return null
  }
}

/** Chooses the apps to listen to. Returns whether it was kept. */
export async function saveApps(apps: NativeApp[]): Promise<boolean> {
  try {
    await bridge.setApps({ apps })
    return true
  } catch {
    return false
  }
}

export const openListenerSettings = (): Promise<void> => bridge.openListenerSettings().catch(() => undefined)
export const openAppSettings = (): Promise<void> => bridge.openAppSettings().catch(() => undefined)
export const clearUnread = (): Promise<void> => bridge.clearUnread().catch(() => undefined)

/** The payments waiting to be added or opened. They are forgotten on the phone once handed over. Empty where there is no phone. */
export async function readPending(): Promise<PendingPayment[]> {
  if (!isNativeApp()) return []
  try {
    return (await bridge.takePending()).payments ?? []
  } catch {
    return []
  }
}
