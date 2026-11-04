import { parseLocalDate } from '../db/money'
import { forecast, tagOf, type UpcomingPayment } from './upcoming'

export interface AheadRow {
  kind: 'emi' | 'biggest' | 'income'
  payment: UpcomingPayment
  /** For the EMI: it is also the biggest payment going out, so it is not listed twice. */
  alsoBiggest: boolean
}

/** What to do about what is due: save the shortfall, or keep this much aside when there is no balance to check against. */
export interface SetAside {
  /** short: the balance will not cover it; plain: no balance is set, so only what is due is known. */
  tone: 'short' | 'plain'
  /** short: how much more is needed. plain: how much goes out in the window. */
  amountMinor: number
  /** short: the first day the balance goes below zero. */
  byDate: string | null
  /** About how much to put away each day, to a whole currency unit. */
  perDayMinor: number
}

export interface PlanAhead {
  rows: AheadRow[]
  setAside: SetAside | null
}

const DAY_MS = 86_400_000
const daysBetween = (fromKey: string, toKey: string) => Math.round((parseLocalDate(toKey).getTime() - parseLocalDate(fromKey).getTime()) / DAY_MS)
/** Rounded up to a whole currency unit: a saving target should not be a few paise short. */
const ceilWhole = (minor: number) => Math.ceil(minor / 100) * 100

/**
 * What to know about the next stretch, from the payments already worked out for it: the next loan EMI and when, the
 * biggest payment going out, when money next comes in, and what to put aside. A payment shown as the EMI is not shown
 * again as the biggest. With a balance set, the amount to save is the shortfall the balance would reach, spread over the
 * days until it first goes short; with none, it is what is due, spread over the window. Null when there is nothing to say.
 * A covered balance has nothing to put aside, and the Coming up card already says it is covered.
 */
export function planAhead(items: UpcomingPayment[], balance: { set: boolean; minor: number }, todayKey: string, horizonDays = 30): PlanAhead | null {
  const going = items.filter((p) => p.kind === 'expense')
  const emi = going.find((p) => tagOf(p.rule) === 'loan') ?? null
  // The earlier one on a tie, since the list is in date order and only a strictly bigger one replaces it.
  const biggest = going.reduce<UpcomingPayment | null>((best, p) => (best === null || p.amountMinor > best.amountMinor ? p : best), null)
  const coming = items.find((p) => p.kind === 'income') ?? null

  const rows: AheadRow[] = []
  const emiIsBiggest = emi !== null && biggest !== null && emi.key === biggest.key && going.length > 1
  if (emi) rows.push({ kind: 'emi', payment: emi, alsoBiggest: emiIsBiggest })
  // With one payment going out there is no "biggest" to point out; the Coming up card shows it.
  if (biggest && going.length > 1 && !(emi && emi.key === biggest.key)) rows.push({ kind: 'biggest', payment: biggest, alsoBiggest: false })
  if (coming) rows.push({ kind: 'income', payment: coming, alsoBiggest: false })

  let setAside: SetAside | null = null
  if (going.length > 0) {
    const dueMinor = going.reduce((sum, p) => sum + p.amountMinor, 0)
    if (!balance.set) {
      setAside = { tone: 'plain', amountMinor: dueMinor, byDate: null, perDayMinor: ceilWhole(dueMinor / horizonDays) }
    } else {
      const f = forecast(balance.minor, items, todayKey)
      if (f.shortfallMinor > 0 && f.firstShortDate !== null) {
        const days = Math.max(1, daysBetween(todayKey, f.firstShortDate))
        setAside = { tone: 'short', amountMinor: f.shortfallMinor, byDate: f.firstShortDate, perDayMinor: ceilWhole(f.shortfallMinor / days) }
      }
    }
  }

  return rows.length === 0 && setAside === null ? null : { rows, setAside }
}
