import { parseLocalDate } from '../db/money'
import type { Category, Transaction } from '../db/schema'
import { FILLER_WORDS, type PaymentMethod } from './keywords'
import { guessCategoryName } from './localParser'

/** A choice counts half as much for every this many days that pass, so a change of mind wins within weeks. */
const HALF_LIFE_DAYS = 90
/** A single word in a name is only trusted when at least this many entries agree on it... */
const WORD_MIN_ENTRIES = 2
/** ...and when this share of the weight went one way. */
const WORD_MIN_SHARE = 0.7

const FILLER = new Set(FILLER_WORDS)
const key = (merchant: string) => merchant.trim().toLowerCase()

/** The words of a name that could say what it is: no filler, no numbers, nothing shorter than three letters. */
const wordsOf = (merchant: string) =>
  [...new Set(key(merchant).split(/[^a-z0-9]+/))].filter((w) => w.length >= 3 && !FILLER.has(w) && !/^\d+$/.test(w))

interface Vote<T> {
  value: T
  weight: number
  /** When it was given, for breaking a tie in favour of the newest. */
  at: string
  created: number
}

/** 1 for today, half that after HALF_LIFE_DAYS, and so on. A date in the future counts as today. */
function weightOf(date: string, today: Date): number {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const days = Math.max(0, Math.round((start - parseLocalDate(date).getTime()) / 86_400_000))
  return Math.pow(0.5, days / HALF_LIFE_DAYS)
}

/** The value with the most weight; on an exact tie, the one given most recently. */
function winner<T>(votes: Vote<T>[]): { value: T; weight: number; entries: number; share: number } | null {
  const by = new Map<T, { weight: number; entries: number; at: string; created: number }>()
  let total = 0
  for (const v of votes) {
    const c = by.get(v.value) ?? { weight: 0, entries: 0, at: '', created: 0 }
    c.weight += v.weight
    c.entries++
    if (v.at > c.at || (v.at === c.at && v.created > c.created)) {
      c.at = v.at
      c.created = v.created
    }
    by.set(v.value, c)
    total += v.weight
  }
  let best: { value: T; c: { weight: number; entries: number; at: string; created: number } } | null = null
  for (const [value, c] of by) {
    const closer = (a: typeof c, b: typeof c) => a.weight - b.weight > 1e-9 || (Math.abs(a.weight - b.weight) <= 1e-9 && (a.at > b.at || (a.at === b.at && a.created > b.created)))
    if (!best || closer(c, best.c)) best = { value, c }
  }
  return best ? { value: best.value, weight: best.c.weight, entries: best.c.entries, share: total > 0 ? best.c.weight / total : 0 } : null
}

/**
 * What you did with this name, from your history: first the exact name, and if that was never seen, the
 * single words in it that your past entries agree on ("Zudio" from "Zudio kurta" and "Zudio shirts").
 * `pick` returns what an entry says (a category, a payment method) or undefined when it says nothing.
 */
function learn<T>(merchant: string, txs: Transaction[], today: Date, pick: (t: Transaction) => T | undefined): T | null {
  const name = key(merchant)
  if (!name) return null

  const exact: Vote<T>[] = []
  const byWord = new Map<string, Vote<T>[]>()
  const wanted = wordsOf(merchant)
  for (const t of txs) {
    const value = pick(t)
    if (value === undefined) continue
    const vote: Vote<T> = { value, weight: weightOf(t.date, today), at: t.date, created: t.createdAt }
    if (key(t.merchant) === name) exact.push(vote)
    if (wanted.length === 0) continue
    const have = new Set(wordsOf(t.merchant))
    for (const w of wanted) if (have.has(w)) byWord.set(w, [...(byWord.get(w) ?? []), vote])
  }

  const whole = winner(exact)
  if (whole) return whole.value

  // The word the history is surest about wins; between equals, the longer (more specific) word.
  let best: { value: T; weight: number; length: number } | null = null
  for (const [word, votes] of byWord) {
    const w = winner(votes)
    if (!w || w.entries < WORD_MIN_ENTRIES || w.share < WORD_MIN_SHARE) continue
    if (!best || w.weight > best.weight + 1e-9 || (Math.abs(w.weight - best.weight) <= 1e-9 && word.length > best.length)) {
      best = { value: w.value, weight: w.weight, length: word.length }
    }
  }
  return best ? best.value : null
}

/**
 * The category you chose for this name. The input bar guesses from keywords; this is what you taught it.
 *
 * Only an entry that went against the keyword guess is a lesson; one that agrees teaches nothing, and the
 * chat bar's own fall-back to Other is not a choice, so a keyword added later still gets to work. Newer
 * choices count for more. Returns null when there is nothing to go on, and the keywords decide.
 */
export function learnedCategoryId(
  merchant: string,
  txs: Transaction[],
  categoryById: Map<number, Category>,
  today = new Date(),
): number | null {
  return learn(merchant, txs, today, (t) => {
    if (t.kind !== 'expense' || t.deletedAt !== undefined) return undefined
    const category = categoryById.get(t.categoryId)?.name
    if (!category || category === guessCategoryName(t.merchant)) return undefined
    if (category === 'Other' && t.source === 'chat') return undefined
    return t.categoryId
  })
}

/** How you usually pay for this name, in the same way: newest and most used first. Empty when unknown. */
export function learnedPaymentMethod(
  merchant: string,
  kind: Transaction['kind'],
  txs: Transaction[],
  today = new Date(),
): PaymentMethod {
  const found = learn<PaymentMethod>(merchant, txs, today, (t) => {
    if (t.kind !== kind || t.deletedAt !== undefined || !t.paymentMethod) return undefined
    return t.paymentMethod as PaymentMethod
  })
  return found ?? ''
}
