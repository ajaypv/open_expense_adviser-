import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CARD_STYLES } from '../db/cardStyles'
import { CreditCardArt } from './CreditCardArt'

const html = (props: Partial<Parameters<typeof CreditCardArt>[0]> = {}) =>
  renderToStaticMarkup(<CreditCardArt type="brand-dark" company="HDFC card" cardHolder="You owe" cardNumber="₹2,500" cardExpiration="Due 3 Dec" {...props} />)

describe('CreditCardArt', () => {
  it('draws every one of the thirteen looks', () => {
    for (const type of CARD_STYLES) {
      const out = html({ type })
      expect(out, type).toContain(`data-card-style="${type}"`)
      expect(out, type).toContain('HDFC card')
      expect(out, type).toContain('₹2,500')
    }
  })

  it('puts the card’s name, what it is doing, when the bill is due and what is owed where a card has them', () => {
    const out = html()
    expect(out).toContain('>HDFC card<')
    expect(out).toContain('>You owe<')
    expect(out).toContain('>Due 3 Dec<')
    expect(out).toContain('₹2,500')
  })

  it('is a picture: hidden from a screen reader, which is told the same in words beside it', () => {
    expect(html()).toMatch(/aria-hidden="true"[^>]*data-card-style|data-card-style[^>]*aria-hidden="true"/)
  })

  it('claims no card network: no Mastercard mark, a plain chip where it would be', () => {
    const out = html()
    expect(out).not.toContain('#ED0006')
    expect(out).not.toContain('#F9A000')
    expect(out).toContain('#E8C766')
  })

  it('takes the theme’s accent for its brand colours, so it follows the colour theme', () => {
    expect(html({ type: 'brand-dark' })).toContain('var(--accent)')
    expect(html({ type: 'brand-light' })).toContain('var(--accent)')
    expect(html({ type: 'gray-dark' })).not.toContain('var(--accent)')
  })

  it('has a strip across the bottom for the strip looks, and one down the side for the vertical ones', () => {
    expect(html({ type: 'gradient-strip' })).toContain('inset-x-0 bottom-0')
    expect(html({ type: 'gradient-strip-vertical' })).toContain('inset-y-0 right-22')
    expect(html({ type: 'brand-dark' })).not.toContain('bg-neutral-800')
  })

  it('has its coloured haze for transparent-gradient, and only that', () => {
    expect(html({ type: 'transparent-gradient' })).toContain('blur-3xl')
    expect(html({ type: 'transparent' })).not.toContain('blur-3xl')
  })

  it('is designed at 316 by 190 and scaled to the width it is given, keeping its proportions', () => {
    const out = html({ width: 158 })
    expect(out).toContain('width:158px;height:95px')
    expect(out).toContain('transform:scale(0.5)')
    expect(html({ width: 316 })).toContain('transform:scale(1)')
  })

  it('fits the space it is in, up to 360, by default', () => {
    const out = html()
    expect(out).toContain('max-width:360px')
    expect(out).toContain('w-full')
  })

  it('keeps the line for the amount even when there is none', () => {
    expect(html({ cardNumber: '' })).toContain('invisible')
  })
})
