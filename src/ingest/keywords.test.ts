import { describe, expect, it } from 'vitest'
import { INCOME_CATEGORY } from '../db/defaultCategories'
import { CATEGORY_KEYWORDS, CATEGORY_ORDER, FILLER_WORDS, GENERAL, INCOME_FILLER_WORDS, INDIA, KARNATAKA, PACKS, PAYMENT_WORDS } from './keywords'
import { parseExpense } from './localParser'

const all = CATEGORY_KEYWORDS.flatMap(([category, words]) => words.map((word) => ({ category, word })))

describe('the word lists', () => {
  it('has only single lowercase words, since the parser looks at one word at a time', () => {
    for (const { category, word } of all) expect(word, `${category}: "${word}"`).toMatch(/^[a-z0-9]+$/)
  })

  it('has no word in two places, so a pack can never quietly override another', () => {
    const seen = new Map<string, string>()
    for (const { category, word } of all) {
      expect(seen.get(word), `"${word}" is in ${seen.get(word)} and ${category}`).toBeUndefined()
      seen.set(word, category)
    }
  })

  it('only names categories the app has, and never offers Income for spending', () => {
    for (const pack of PACKS) for (const name of Object.keys(pack)) expect(CATEGORY_ORDER).toContain(name)
    expect(CATEGORY_ORDER).not.toContain(INCOME_CATEGORY)
  })

  it('gives every category in the order at least one word', () => {
    for (const [category, words] of CATEGORY_KEYWORDS) expect(words.length, category).toBeGreaterThan(0)
  })

  it('keeps the order of the categories, which decides ties', () => {
    expect(CATEGORY_KEYWORDS.map(([c]) => c)).toEqual(CATEGORY_ORDER)
    expect(CATEGORY_ORDER.indexOf('Groceries')).toBeLessThan(CATEGORY_ORDER.indexOf('Food & Dining'))
  })

  it('has no word that is also filler or a payment word, which the parser would drop before looking it up', () => {
    const dropped = new Set([...FILLER_WORDS, ...INCOME_FILLER_WORDS, ...Object.keys(PAYMENT_WORDS)])
    for (const { category, word } of all) expect(dropped.has(word), `${category}: "${word}"`).toBe(false)
  })
})

describe('adding words', () => {
  it('joins every pack, so a word added to any of them is known to the parser', () => {
    const words = (pack: typeof GENERAL) => Object.values(pack).flat()
    const known = new Set(all.map((a) => a.word))
    for (const pack of [GENERAL, INDIA, KARNATAKA]) for (const w of words(pack)) expect(known.has(w), w).toBe(true)
  })

  it('files a Karnataka word under its category through the parser', () => {
    expect(parseExpense('KSRTC bus fare 137')?.categoryName).toBe('Transport')
    expect(parseExpense('bescom 1450')?.categoryName).toBe('Bills & Utilities')
  })
})
