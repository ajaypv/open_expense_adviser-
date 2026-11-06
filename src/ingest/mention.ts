import type { Person } from '../db/schema'
import { personNamed } from '../insights/people'
import { FILLER_WORDS, PAYMENT_WORDS } from './keywords'

/** Who a line of text says the money went to, and the line with their name taken out. */
export interface Mention {
  /** The name to file it under: the stored name of someone known, otherwise what was typed, in capitals. */
  name: string
  /** Set when it is someone already known. */
  person?: Person
  rest: string
}

/** Words that end a name that is not known: the amount, the day, how it was paid, little words like "on" and "for". */
const ENDS_A_NAME = new Set([
  ...FILLER_WORDS,
  ...Object.keys(PAYMENT_WORDS),
  'today', 'yesterday', 'yest', 'yday', 'tomorrow', 'tonight', 'ago', 'last',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
])

const clean = (token: string) => token.replace(/^@/, '').replace(/[,;!?.]+$/, '')
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const titleCase = (s: string) => s.replace(/(^|\s)(\S)/g, (_, space: string, c: string) => space + c.toUpperCase())

/** "shweta" finds "Shweta Rao" when she is the only Shweta; with two of them it is left for the person to say which. */
function byFirstName(people: Person[], name: string): Person | undefined {
  const first = fold(name)
  const found = people.filter((p) => fold(p.name).split(/\s+/)[0] === first)
  return found.length === 1 ? found[0] : undefined
}

/** A known person named by `tokens` from `from` on, as many as three words, the longest first. */
function knownAt(tokens: string[], from: number, people: Person[]): { person: Person; count: number } | null {
  for (let count = Math.min(3, tokens.length - from); count >= 1; count--) {
    const name = tokens.slice(from, from + count).map(clean).join(' ')
    const person = personNamed(people, name) ?? (count === 1 ? byFirstName(people, name) : undefined)
    if (person) return { person, count }
  }
  return null
}

const without = (tokens: string[], from: number, count: number) => [...tokens.slice(0, from), ...tokens.slice(from + count)].join(' ')

/**
 * Finds the person a line is about. "@Shweta 500" names one, known or new (a new name runs up to three words, to the first
 * amount, day or little word); "500 to Shweta" does too, but only when she is someone already known, since "to" alone does not
 * say a name from a shop. Returns null when no person is named.
 */
export function extractPerson(text: string, people: Person[]): Mention | null {
  const tokens = text.split(/\s+/).filter(Boolean)

  const at = tokens.findIndex((t) => t.startsWith('@') && clean(t) !== '')
  if (at !== -1) {
    const known = knownAt(tokens, at, people)
    if (known) return { name: known.person.name, person: known.person, rest: without(tokens, at, known.count) }
    let count = 1
    const nameWord = (t: string) => !/[\d₹$€£@]/.test(t) && !ENDS_A_NAME.has(clean(t).toLowerCase())
    while (count < 3 && at + count < tokens.length && nameWord(tokens[at + count])) count++
    const name = titleCase(tokens.slice(at, at + count).map(clean).join(' '))
    return { name, rest: without(tokens, at, count) }
  }

  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i].toLowerCase() !== 'to') continue
    const known = knownAt(tokens, i + 1, people)
    if (known) return { name: known.person.name, person: known.person, rest: without(tokens, i + 1, known.count) }
  }
  return null
}

/**
 * Where a name is being typed after an @, for the list of people: the @ must start a word (not be inside an address), and what
 * follows it up to the caret must look like a name (no digits, at most three words). `start` is where the @ is.
 */
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const start = before.lastIndexOf('@')
  if (start === -1) return null
  if (start > 0 && !/\s/.test(before[start - 1])) return null
  const query = before.slice(start + 1)
  if (/[\d\n₹$€£@]/.test(query) || query.split(/\s+/).length > 3) return null
  return { start, query }
}
