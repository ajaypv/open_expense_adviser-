import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WalletPanel } from './WalletPanel'

const base = {
  monthName: 'October',
  sentMinor: 2_345_000,
  receivedMinor: 8_000_000,
  currency: 'INR',
  balanceMinor: 6_455_000,
  balanceSet: true,
  onToggle: () => {},
  onSetBalance: () => {},
}

const render = (props: Partial<Parameters<typeof WalletPanel>[0]>) =>
  renderToStaticMarkup(createElement(WalletPanel, { ...base, shown: false, ...props }))

describe('WalletPanel', () => {
  it('shows sent and received for the month, but keeps the balance hidden by default', () => {
    const html = render({})
    expect(html).toContain('Sent in October')
    expect(html).toContain('Received in October')
    expect(html).toContain('₹23,450')
    expect(html).toContain('₹80,000')
    expect(html).toContain('••••••')
    expect(html).toContain('Show balance')
    // The balance figure must not be anywhere in the markup, not even visually hidden.
    expect(html).not.toContain('64,550')
    expect(html).not.toContain('Hide balance')
  })

  it('reveals the balance and offers to hide it again', () => {
    const html = render({ shown: true })
    expect(html).toContain('₹64,550')
    expect(html).toContain('Hide balance')
    expect(html).not.toContain('••••••')
  })

  it('invites the user to set a starting balance only when they have not', () => {
    expect(render({ shown: true, balanceSet: false })).toContain('Set your balance')
    expect(render({ shown: true, balanceSet: true })).not.toContain('Set your balance')
    expect(render({ shown: false, balanceSet: false })).not.toContain('Set your balance')
  })

  it('formats a negative estimate instead of hiding the problem', () => {
    expect(render({ shown: true, balanceMinor: -45_000 })).toMatch(/-₹450|₹-450|−₹450/)
  })
})
