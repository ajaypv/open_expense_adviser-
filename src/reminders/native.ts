import { LocalNotifications, type PermissionStatus } from '@capacitor/local-notifications'
import type { Permission } from './notify'

/** The small white shape in the status bar (android/.../drawable/ic_stat_notify.xml). */
const SMALL_ICON = 'ic_stat_notify'

/** How many days ahead the "log today" reminder is set, so it still comes if the app is not opened for a week. */
export const REMINDER_DAYS = 7

const LOG_TITLE = 'Log today’s spending'
const LOG_BODY = 'Nothing added today yet. It only takes a few seconds.'

const fromStatus = (status: PermissionStatus['display']): Permission => (status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'default')

/** Whether the phone lets the app show notifications (Android 13 and later ask; before that it is always allowed). */
export async function nativePermission(): Promise<Permission> {
  try {
    return fromStatus((await LocalNotifications.checkPermissions()).display)
  } catch {
    return 'unsupported'
  }
}

/** Asks for permission with the phone's own prompt. Call it from a tap. */
export async function requestNativePermission(): Promise<Permission> {
  try {
    return fromStatus((await LocalNotifications.requestPermissions()).display)
  } catch {
    return 'denied'
  }
}

/** A whole number made from a name, so that the same name always replaces its own notification instead of piling up. */
export function idFor(tag: string): number {
  let h = 7
  for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) | 0
  // Kept clear of the small numbers the daily reminders use.
  return (Math.abs(h) % 1_000_000) + 1000
}

/** Shows a notification now. Returns whether it was handed to the phone. */
export async function showNow(title: string, body: string, tag: string): Promise<boolean> {
  try {
    await LocalNotifications.schedule({ notifications: [{ id: idFor(tag), title, body, smallIcon: SMALL_ICON, extra: { tag } }] })
    return true
  } catch {
    return false
  }
}

export interface PlannedReminder {
  /** 1 for today, 2 for tomorrow, and so on: the same day always has the same number, so it can be replaced or taken back. */
  id: number
  at: Date
}

/**
 * When the "log today" reminder should go off over the next days: at `time` (HH:MM) each day, except times already past, and
 * except today when something has been logged already. The app plans this again whenever it is opened or something is logged,
 * so a reminder for a day you have already logged is taken back, and the days ahead keep coming if you do not open the app.
 */
export function reminderTimes(now: Date, time: string, loggedToday: boolean, days: number = REMINDER_DAYS): PlannedReminder[] {
  const [hours, minutes] = time.split(':').map(Number)
  const planned: PlannedReminder[] = []
  for (let i = 0; i < days; i++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hours, minutes)
    if (at.getTime() <= now.getTime()) continue
    if (i === 0 && loggedToday) continue
    planned.push({ id: i + 1, at })
  }
  return planned
}

/** Replaces whatever daily reminders were set with `planned` (none to switch them off). Returns whether any are set. */
export async function setLogReminders(planned: PlannedReminder[]): Promise<boolean> {
  try {
    await LocalNotifications.cancel({ notifications: Array.from({ length: REMINDER_DAYS }, (_, i) => ({ id: i + 1 })) })
    if (planned.length === 0) return false
    await LocalNotifications.schedule({
      notifications: planned.map(({ id, at }) => ({ id, title: LOG_TITLE, body: LOG_BODY, smallIcon: SMALL_ICON, schedule: { at, allowWhileIdle: true } })),
    })
    return true
  } catch {
    return false
  }
}
