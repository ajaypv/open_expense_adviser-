import { parseLocalDate } from '../db/money'
import type { AiSummary } from '../insights/ai'

/**
 * What the widget shows, as the text to put in it. Everything is written out here, in the amounts and words the app uses,
 * because the widget is drawn by Windows from a template and has no code of its own to format anything. The names are the
 * fields of public/widgets/spending-template.json; widget.test holds the two in step.
 */
export interface WidgetData {
  /** "October so far". */
  title: string
  spent: string
  spentLabel: string
  /** The one line that matters, coloured by `tone`. */
  headline: string
  /** Against the budget, or against last month; empty if there is neither. */
  detail: string
  /** What can be spent a day to stay inside the budget; empty when it does not apply. */
  perDay: string
  /** The next payment that leaves on its own; empty when none is coming. */
  next: string
  /** An Adaptive Cards colour. */
  tone: 'Default' | 'Good' | 'Warning' | 'Attention'
  /** When this was worked out: the widget only changes when the app is opened, and says so. */
  updated: string
}

const DAY_MS = 86_400_000
const TONES = { good: 'Good', watch: 'Warning', bad: 'Attention', quiet: 'Default' } as const

let dayFormat: Intl.DateTimeFormat | undefined
let timeFormat: Intl.DateTimeFormat | undefined

/** The widget's words and figures for a month, from the same reading of the ledger that the AI insights page uses. */
export function buildWidgetData(s: AiSummary, money: (minor: number) => string, now: Date): WidgetData {
  const t = s.trajectory
  const day = (dayFormat ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })).format(now)
  const time = (timeFormat ??= new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })).format(now)
  const updated = `Updated ${day}, ${time}`
  const title = `${s.monthName}${s.isCurrent ? ' so far' : ''}`

  if (!s.hasData) {
    return { title, spent: money(0), spentLabel: 'Spent', headline: 'Nothing spent yet', detail: '', perDay: '', next: nextPayment(s, money, now), tone: 'Default', updated }
  }

  let headline: string
  let detail = ''
  if (t.overBudget?.already) {
    headline = `Over budget by ${money(t.overBudget.byMinor)}`
    detail = `Passed your ${money(t.budgetMinor!)} budget`
  } else if (t.projectedMinor !== null) {
    headline = `Heading for about ${money(t.projectedMinor)}`
    if (t.overBudget) detail = `${money(t.overBudget.byMinor)} over your budget`
    else if (t.budgetMinor !== null) detail = `${money(t.budgetMinor - t.projectedMinor)} inside your budget`
    else {
      const last = t.previous.at(-1)
      if (last) {
        const pct = Math.round(((t.projectedMinor - last) / last) * 100)
        detail = pct === 0 ? `About the same as ${s.prevName}` : `${Math.abs(pct)}% ${pct > 0 ? 'more' : 'less'} than ${s.prevName}`
      }
    }
  } else {
    headline = s.isCurrent ? 'Too early to say where it ends' : `Spent in ${s.monthName}`
  }

  return {
    title,
    spent: money(s.spentMinor),
    spentLabel: s.isCurrent ? 'Spent so far' : 'Spent',
    headline,
    detail,
    perDay: t.perDayAllowedMinor !== null ? `About ${money(t.perDayAllowedMinor)} a day keeps you inside it` : '',
    next: nextPayment(s, money, now),
    tone: TONES[s.verdict.tone],
    updated,
  }
}

/** The next payment that is still to leave on its own: "Next: Rent ₹6,000, in 5 days". */
function nextPayment(s: AiSummary, money: (minor: number) => string, now: Date): string {
  const next = s.deductions?.items.filter((i) => i.state !== 'done').sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0]
  if (!next) return ''
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const left = Math.round((parseLocalDate(next.date).getTime() - today.getTime()) / DAY_MS)
  const when = next.state === 'late' ? 'late' : left <= 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${left} days`
  return `Next: ${next.name} ${money(next.amountMinor)}, ${when}`
}
