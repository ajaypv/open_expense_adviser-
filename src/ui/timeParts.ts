/** Helpers for the time picker. Times are stored as "HH:MM" on a 24-hour clock. */

const FALLBACK = { hour: 21, minute: 0 }

export function splitTime(value: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return FALLBACK
  const hour = Number(match[1])
  const minute = Number(match[2])
  return hour <= 23 && minute <= 59 ? { hour, minute } : FALLBACK
}

const pad = (n: number) => String(n).padStart(2, '0')

export const joinTime = (hour: number, minute: number) => `${pad(hour)}:${pad(minute)}`

/** 0 is 12 AM, 12 is 12 PM. */
export function to12(hour24: number): { hour: number; pm: boolean } {
  return { hour: hour24 % 12 === 0 ? 12 : hour24 % 12, pm: hour24 >= 12 }
}

export const from12 = (hour: number, pm: boolean) => (hour % 12) + (pm ? 12 : 0)

/** "9:00 PM" on a 12-hour clock, "21:00" on a 24-hour one. */
export function formatTime(value: string, hour12: boolean): string {
  const { hour, minute } = splitTime(value)
  if (!hour12) return joinTime(hour, minute)
  const t = to12(hour)
  return `${t.hour}:${pad(minute)} ${t.pm ? 'PM' : 'AM'}`
}

/** Every five minutes, plus the current minute when it was set some other way. */
export function minuteChoices(current: number): number[] {
  const steps = Array.from({ length: 12 }, (_, i) => i * 5)
  return steps.includes(current) ? steps : [...steps, current].sort((a, b) => a - b)
}

/** Whether this device shows time with AM and PM. */
export const prefers12Hour = (): boolean => new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 ?? true
