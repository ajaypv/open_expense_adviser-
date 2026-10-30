/**
 * The rules for when to nudge. Pure functions with no browser APIs, so the same code runs in the
 * page and in the service worker, and can be tested.
 */

export interface ReminderPrefs {
  /** Remind me to log if I haven't by this time. */
  logReminder: boolean
  /** Local time, HH:MM. */
  logTime: string
  /** Tell me when I reach 80% and 100% of a budget. */
  budgetAlerts: boolean
}

export const DEFAULT_REMINDERS: ReminderPrefs = { logReminder: false, logTime: '21:00', budgetAlerts: true }

export const REMINDERS_KEY = 'reminders'
export const REMINDER_STATE_KEY = 'reminderState'

/** What has already been nudged, so nobody is told the same thing twice. */
export interface ReminderState {
  /** Date (YYYY-MM-DD) of the last "log today" nudge. */
  lastLogNudge: string | null
  /** Budget alerts already sent, as "2026-10:overall:80". */
  budgetAlerts: string[]
}

export const EMPTY_STATE: ReminderState = { lastLogNudge: null, budgetAlerts: [] }

/** Read stored preferences defensively: anything missing or malformed falls back to the default. */
export function readPrefs(value: unknown): ReminderPrefs {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<ReminderPrefs>
  return {
    logReminder: v.logReminder === true,
    logTime: typeof v.logTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.logTime) ? v.logTime : DEFAULT_REMINDERS.logTime,
    budgetAlerts: v.budgetAlerts !== false,
  }
}

export function readState(value: unknown): ReminderState {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<ReminderState>
  return {
    lastLogNudge: typeof v.lastLogNudge === 'string' ? v.lastLogNudge : null,
    budgetAlerts: Array.isArray(v.budgetAlerts) ? v.budgetAlerts.filter((x): x is string => typeof x === 'string') : [],
  }
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** True when the reminder time has passed and nothing has been logged today. */
export function logReminderDue(now: Date, prefs: ReminderPrefs, loggedToday: boolean): boolean {
  return prefs.logReminder && !loggedToday && now.getHours() * 60 + now.getMinutes() >= minutes(prefs.logTime)
}

/** Whether to send the system notification now: it is due, and not already sent today. */
export function shouldNotifyLog(now: Date, today: string, prefs: ReminderPrefs, loggedToday: boolean, state: ReminderState): boolean {
  return logReminderDue(now, prefs, loggedToday) && state.lastLogNudge !== today
}

export const BUDGET_THRESHOLDS = [80, 100] as const

/**
 * Which budget thresholds have newly been reached. Spending can only cross upward, and each
 * threshold is reported once per month and budget, however many times it is checked.
 */
export function newBudgetAlerts(opts: {
  month: string
  scope: string
  spentMinor: number
  limitMinor: number
  sent: string[]
}): { threshold: number; key: string }[] {
  if (opts.limitMinor <= 0) return []
  const pct = (opts.spentMinor / opts.limitMinor) * 100
  return BUDGET_THRESHOLDS.filter((t) => pct >= t)
    .map((threshold) => ({ threshold, key: `${opts.month}:${opts.scope}:${threshold}` }))
    .filter((a) => !opts.sent.includes(a.key))
}

/** Only the highest threshold reached is worth saying: at 105% there is no need to also say 80%. */
export function strongestAlert(alerts: { threshold: number; key: string }[]): { threshold: number; key: string } | null {
  return alerts.length ? alerts.reduce((a, b) => (b.threshold > a.threshold ? b : a)) : null
}

export function budgetMessage(name: string, threshold: number): { title: string; body: string } {
  return threshold >= 100
    ? { title: 'Over budget', body: `You’ve gone over your ${name} budget this month.` }
    : { title: 'Close to your budget', body: `You’ve used ${threshold}% of your ${name} budget this month.` }
}

/** Keep the sent list from growing for ever: only this and last month matter. */
export function pruneSent(sent: string[], month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
  return sent.filter((k) => k.startsWith(`${month}:`) || k.startsWith(`${prev}:`))
}
