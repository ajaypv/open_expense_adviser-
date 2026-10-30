import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import {
  DEFAULT_REMINDERS,
  readPrefs,
  readState,
  REMINDER_STATE_KEY,
  REMINDERS_KEY,
  type ReminderPrefs,
  type ReminderState,
} from './logic'

export async function getReminderPrefs(): Promise<ReminderPrefs> {
  return readPrefs((await db.settings.get(REMINDERS_KEY))?.value)
}

export async function setReminderPrefs(patch: Partial<ReminderPrefs>): Promise<void> {
  await db.settings.put({ key: REMINDERS_KEY, value: { ...(await getReminderPrefs()), ...patch } })
}

export async function getReminderState(): Promise<ReminderState> {
  return readState((await db.settings.get(REMINDER_STATE_KEY))?.value)
}

export async function saveReminderState(patch: Partial<ReminderState>): Promise<void> {
  await db.settings.put({ key: REMINDER_STATE_KEY, value: { ...(await getReminderState()), ...patch } })
}

/** The live preferences. Until the first read finishes everything is off, so nothing fires early. */
export function useReminderPrefs(): ReminderPrefs & { loaded: boolean } {
  const prefs = useLiveQuery(getReminderPrefs, [])
  return prefs ? { ...prefs, loaded: true } : { ...DEFAULT_REMINDERS, logReminder: false, budgetAlerts: false, loaded: false }
}
