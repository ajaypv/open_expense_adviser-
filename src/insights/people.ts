import type { Person, Transaction } from '../db/schema'

/** What has been sent to one person, and how much of it is still waiting to be received. */
export interface PersonStat {
  person: Person
  /** Everything sent to them, in the main currency. */
  sentMinor: number
  count: number
  /** Sent, and not yet marked received. */
  pendingMinor: number
  pendingCount: number
  /** The newest payment's date, or null when nothing has been sent yet. */
  lastDate: string | null
  /** Their payments that are not received yet, newest first. */
  pending: Transaction[]
}

/** A payment to a person that is still alive (not in the trash). */
const toPerson = (t: Transaction) => t.kind === 'expense' && t.personId !== undefined && t.deletedAt === undefined

/**
 * Each person with what has been sent to them. The people sent to most recently come first, then those not yet sent
 * anything, by name, so the ones you are likely to pay again are at the top of every list.
 */
export function personStats(people: Person[], txs: Transaction[]): PersonStat[] {
  const stats = new Map<number, PersonStat>(
    people.map((person) => [person.id, { person, sentMinor: 0, count: 0, pendingMinor: 0, pendingCount: 0, lastDate: null, pending: [] }]),
  )
  for (const t of txs) {
    if (!toPerson(t)) continue
    const s = stats.get(t.personId!)
    if (!s) continue
    s.sentMinor += t.amountMinor
    s.count += 1
    if (s.lastDate === null || t.date > s.lastDate) s.lastDate = t.date
    if (t.delivery === 'sent') {
      s.pendingMinor += t.amountMinor
      s.pendingCount += 1
      s.pending.push(t)
    }
  }
  for (const s of stats.values()) s.pending.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt))
  return [...stats.values()].sort((a, b) => {
    if (a.lastDate !== b.lastDate) return a.lastDate === null ? 1 : b.lastDate === null ? -1 : a.lastDate < b.lastDate ? 1 : -1
    return a.person.name.localeCompare(b.person.name)
  })
}

/** Total waiting to be received, across everyone. */
export function pendingTotal(stats: PersonStat[]): { minor: number; count: number } {
  return stats.reduce((a, s) => ({ minor: a.minor + s.pendingMinor, count: a.count + s.pendingCount }), { minor: 0, count: 0 })
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * The people who fit what has been typed, best first: a name that starts with it, then one with a word that starts with it, then
 * one that has it anywhere. Case and accents do not matter. With nothing typed, the first few of `people` as they come (the ones
 * sent to most recently, when they come from `personStats`).
 */
export function matchPeople(people: Person[], query: string, limit = 5): Person[] {
  const q = fold(query.trim())
  if (!q) return people.slice(0, limit)
  const scored: { person: Person; rank: number; at: number }[] = []
  people.forEach((person, at) => {
    const name = fold(person.name)
    const rank = name.startsWith(q) ? 0 : name.split(/\s+/).some((w) => w.startsWith(q)) ? 1 : name.includes(q) ? 2 : -1
    if (rank >= 0) scored.push({ person, rank, at })
  })
  return scored.sort((a, b) => a.rank - b.rank || a.at - b.at).slice(0, limit).map((s) => s.person)
}

/** The person whose name is exactly what was typed (case and accents aside), if there is one. */
export function personNamed(people: Person[], name: string): Person | undefined {
  const q = fold(name.trim().replace(/\s+/g, ' '))
  return q ? people.find((p) => fold(p.name) === q) : undefined
}
