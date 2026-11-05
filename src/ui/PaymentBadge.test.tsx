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
    expect(html({ tag: 'bill', name: 'Jio recharge' })).toContain('data-icon="recharge"')
  })

  it('is decoration: hidden from screen readers, with the type left to the words beside it', () => {
    expect(html({ tag: 'autopay', name: 'Gym' })).toMatch(/aria-hidden="true"[^>]*data-icon="autopay"|data-icon="autopay"[^>]*aria-hidden="true"/)
  })
})
