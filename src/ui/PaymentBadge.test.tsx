import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PaymentBadge } from './PaymentBadge'

const html = (props: Parameters<typeof PaymentBadge>[0]) => renderToStaticMarkup(<PaymentBadge {...props} />)

describe('PaymentBadge', () => {
  it('shows an EMI as a calendar of instalments', () => {
    expect(html({ tag: 'loan', name: 'Car loan' })).toContain('data-icon="emi"')
  })

  it('shows a bill as a receipt, and a recharge as a phone', () => {
    expect(html({ tag: 'bill', name: 'Water' })).toContain('data-icon="receipt"')
    expect(html({ tag: 'bill', name: 'Mobile recharge' })).toContain('data-icon="recharge"')
  })

  it('shows a well-known service by its own logo, from the icon library, in its own colour, and not the icon for its kind', () => {
    for (const [name, id] of [['Netflix', 'netflix'], ['Spotify Premium', 'spotify'], ['Google One 2 TB', 'googleone'], ['Amazon Prime', 'amazonprime'], ['Prime Video', 'amazonprime'], ['Microsoft 365', 'microsoft'], ['Adobe Creative Cloud', 'adobe'], ['LinkedIn Premium', 'linkedin'], ['ChatGPT Plus', 'openai'], ['Airtel postpaid', 'airtel'], ['Jio Fiber', 'jio'], ['YouTube Premium', 'youtube'], ['YouTube Music', 'youtubemusic'], ['iCloud+', 'icloud'], ['Swiggy One', 'swiggy']]) {
      const out = html({ tag: 'subscription', name })
      expect(out).toContain(`data-brand="${id}"`)
      expect(out).not.toContain('data-icon')
    }
    expect(html({ tag: 'bill', name: 'Jio recharge' })).toContain('data-brand="jio"')
  })

  it('tells Google One from Google, and does not take a word that only contains a name', () => {
    expect(html({ tag: 'subscription', name: 'Google Play Pass' })).toContain('data-brand="googleplay"')
    expect(html({ tag: 'subscription', name: 'Google' })).toContain('data-brand="google"')
    expect(html({ tag: 'subscription', name: 'Netflix' })).toContain('fill="#E50914"')
    expect(html({ tag: 'bill', name: 'Gym' })).not.toContain('data-brand')
    expect(html({ tag: 'bill', name: 'Viva club' })).not.toContain('data-brand')
    expect(html({ tag: 'bill', name: 'Cola supplies' })).not.toContain('data-brand')
  })

  it('draws the ones copied in whole in their own colours, and the others as one path in the brand colour', () => {
    expect(html({ tag: 'subscription', name: 'Google One' })).toContain('fill="#34a853"')
    expect(html({ tag: 'subscription', name: 'Microsoft 365' })).toContain('fill="#f1511b"')
    expect(html({ tag: 'subscription', name: 'Amazon Prime' })).toContain('fill="#00A8E1"')
  })

  it('does not know a service the libraries do not have, so Disney+ Hotstar keeps the icon for its kind', () => {
    expect(html({ tag: 'subscription', name: 'Disney+ Hotstar' })).toContain('data-icon')
    expect(html({ tag: 'subscription', name: 'Disney+ Hotstar' })).not.toContain('data-brand')
  })

  it('never gives a loan or money coming in a brand tile', () => {
    expect(html({ tag: 'loan', name: 'Amazon Pay EMI' })).toContain('data-icon="emi"')
    expect(html({ tag: 'income', name: 'Google salary' })).not.toContain('data-brand')
  })

  it('is decoration: hidden from screen readers, with the type left to the words beside it', () => {
    expect(html({ tag: 'autopay', name: 'Gym' })).toMatch(/aria-hidden="true"[^>]*data-icon="autopay"|data-icon="autopay"[^>]*aria-hidden="true"/)
  })
})
