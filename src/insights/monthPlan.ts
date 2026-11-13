import { restOfMonth, type UpcomingPayment } from './upcoming'

/** The part of a transaction this needs; a ledger row has all of it. */
interface PaidTx {
  kind: 'expense' | 'income' | 'transfer'
  source: 'manual' | 'chat' | 'import' | 'recurring'
  /** YYYY-MM-DD. */
  date: string
  /** In the main currency. */
  amountMinor: number
}

/** A month of regular payments in two halves: what has already gone, and what is still to go. */
export interface MonthPlan {
  /** YYYY-MM. */
  monthKey: string
  /** Regular payments already added this month, going out. */
  paidMinor: number
  paidCount: number
  /** Still to go out this month: what is due in the days left, and anything late that has not been added yet. */
  leftMinor: number
  leftCount: number
  /** Of what is left, how much is already late. */
  lateMinor: number
  /** What the month comes to in all: what has gone and what is still to go. */
  totalMinor: number
  /** How much of the total has already gone, 0 to 1 (0 when the month has none). */
  paidShare: number
  /** The last day something is still due, and the next one; null when nothing is left. */
  nextDate: string | null
  lastDate: string | null
  /** Money that comes in by regular payment (a salary): already received, and still to come. */
  receivedMinor: number
  comingMinor: number
}

/**
 * What the regular payments come to this month. "Already went" is what was added from a regular payment on a day of this month (a payment
 * counts once it has been added, which is when it leaves the account); "still to go" is the payments due in the rest of the month, with
 * any that are late and not yet added. `items` are the payments from today to the end of the month, as `upcomingPayments` gives them.
 */
export function monthPlan(txs: PaidTx[], items: UpcomingPayment[], todayKey: string): MonthPlan {
  const monthKey = todayKey.slice(0, 7)
  let paidMinor = 0
  let paidCount = 0
  let receivedMinor = 0
  for (const t of txs) {
    if (t.source !== 'recurring' || t.date.slice(0, 7) !== monthKey) continue
    if (t.kind === 'expense') {
      paidMinor += t.amountMinor
      paidCount++
    } else if (t.kind === 'income') receivedMinor += t.amountMinor
  }

  let leftMinor = 0
  let leftCount = 0
  let lateMinor = 0
  let comingMinor = 0
  const dates: string[] = []
  for (const p of restOfMonth(items, todayKey)) {
    if (p.kind === 'income') {
      comingMinor += p.amountMinor
      continue
    }
    leftMinor += p.amountMinor
    leftCount++
    if (p.overdue) lateMinor += p.amountMinor
    dates.push(p.overdue ? todayKey : p.date)
  }
  dates.sort()

  const totalMinor = paidMinor + leftMinor
  return {
    monthKey,
    paidMinor,
    paidCount,
    leftMinor,
    leftCount,
    lateMinor,
    totalMinor,
    paidShare: totalMinor > 0 ? paidMinor / totalMinor : 0,
    nextDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
    receivedMinor,
    comingMinor,
  }
}
