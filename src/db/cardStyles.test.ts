import { describe, expect, it } from 'vitest'
import { CARD_CHOICES, CARD_STYLES, cardStyleName, defaultCardStyle, isCardStyle } from './cardStyles'

describe('card looks', () => {
  it('are the thirteen of the Untitled UI credit card set', () => {
    expect(CARD_STYLES).toHaveLength(13)
    expect(new Set(CARD_STYLES).size).toBe(13)
    for (const s of ['brand-dark', 'brand-light', 'gray-dark', 'gray-light', 'gradient-strip', 'salmon-strip', 'gray-strip', 'gradient-strip-vertical', 'salmon-strip-vertical', 'gray-strip-vertical', 'transparent', 'transparent-gradient', 'transparent-strip']) {
      expect(isCardStyle(s), s).toBe(true)
    }
  })

  it('know a look from anything else', () => {
    expect(isCardStyle('neon')).toBe(false)
    expect(isCardStyle(undefined)).toBe(false)
    expect(isCardStyle(3)).toBe(false)
  })

  it('offer a choice without the see-through ones, which have nothing to show against here', () => {
    expect(CARD_CHOICES).toHaveLength(10)
    expect(CARD_CHOICES.some((s) => s.startsWith('transparent'))).toBe(false)
  })

  it('give each card a look of its own until one is chosen: the same each time, and never a see-through one', () => {
    expect(defaultCardStyle(1)).toBe(defaultCardStyle(1))
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(defaultCardStyle)).size).toBe(8)
    for (let id = 0; id < 40; id++) expect(defaultCardStyle(id).startsWith('transparent')).toBe(false)
    expect(isCardStyle(defaultCardStyle(-7))).toBe(true)
  })

  it('are named in words', () => {
    expect(cardStyleName('brand-dark')).toBe('Brand dark')
    expect(cardStyleName('gradient-strip-vertical')).toBe('Gradient strip vertical')
  })
})
