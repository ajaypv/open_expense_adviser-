import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeLedger } from '../test/ledger'
import { Settings } from './Settings'

const render = (props: { updateReady?: boolean } = {}) =>
  renderToStaticMarkup(
    createElement(Settings, {
      ledger: makeLedger(), theme: 'system', onTheme: () => {}, updateReady: false, onApplyUpdate: () => {}, onCheckUpdate: async () => 'latest', onShowWhatsNew: () => {},
      ...props,
    }),
  )

describe('Settings', () => {
  it('lets the user choose where suggestions appear, including off', () => {
    const html = render()
    for (const text of ['Suggestions', 'Above the input bar', 'On the Home screen', 'Off', 'including the add form']) {
      expect(html).toContain(text)
    }
    expect((html.match(/name="suggestion-placement"/g) ?? []).length).toBe(3)
  })

  it('shows the running version and a way to check for updates', () => {
    const html = render()
    expect(html).toContain('App updates')
    expect(html).toMatch(/Version [\w.]+/)
    expect(html).toContain('Check for updates')
    expect(html).not.toContain('Update now')
  })

  it('offers Update now, and says so, when a new version is already waiting', () => {
    const html = render({ updateReady: true })
    expect(html).toContain('Update now')
    expect(html).toContain('Update ready')
    expect(html).toContain('A new version is ready')
    expect(html).not.toContain('Check for updates')
  })
})

describe('Settings: how it is laid out', () => {
  const at = (html: string, s: string) => html.indexOf(s)

  it('groups the settings under a few headings, safest and most important first', () => {
    const html = render()
    const headings = ['Your data and privacy', 'Money', 'Automatic', 'Appearance', 'More']
    for (const h of headings) expect(html, h).toMatch(new RegExp(`<h2[^>]*>${h}</h2>`))
    const order = headings.map((h) => at(html, `>${h}</h2>`))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('puts each setting under the heading it belongs to', () => {
    const html = render()
    const between = (from: string, to: string, what: string) => {
      const a = at(html, `>${from}</h2>`)
      const b = at(html, `>${to}</h2>`)
      const w = at(html, `>${what}</h3>`)
      return w > a && w < b
    }
    expect(between('Your data and privacy', 'Money', 'Your data')).toBe(true)
    expect(between('Your data and privacy', 'Money', 'App lock')).toBe(true)
    expect(between('Money', 'Automatic', 'Currency')).toBe(true)
    expect(between('Money', 'Automatic', 'Accounts and balance')).toBe(true)
    expect(between('Money', 'Automatic', 'Monthly budget')).toBe(true)
    expect(between('Automatic', 'Appearance', 'Recurring')).toBe(true)
    expect(between('Automatic', 'Appearance', 'Reminders')).toBe(true)
    expect(between('Automatic', 'Appearance', 'Suggestions')).toBe(true)
  })

  it('has a bar to jump to each part, so nobody scrolls through everything', () => {
    const html = render()
    expect(html).toContain('aria-label="Jump to a part of Settings"')
    for (const part of ['Your data and privacy', 'Money', 'Automatic', 'Appearance', 'More']) {
      expect(html).toContain(`>${part}</button>`)
    }
  })

  it('folds away what is rarely touched, but keeps it a tap away', () => {
    const html = render()
    expect(html).toMatch(/<details(?![^>]*\sopen)[^>]*id="more-details"/)
    expect(html).toContain('Location')
    expect(html).toContain('App updates')
  })

  it('opens the folded part when an update is waiting, so it is not missed', () => {
    expect(render({ updateReady: true })).toMatch(/<details[^>]*\sopen[^>]*id="more-details"|<details[^>]*id="more-details"[^>]*\sopen/)
  })

  it('does not advertise something that does not exist yet', () => {
    const html = render()
    expect(html).not.toContain('AI assistant')
    expect(html).not.toContain('Coming soon')
  })
});

describe('Settings: regular payments', () => {
  it('leads to the upcoming payments, where they are added and changed', () => {
    const html = renderToStaticMarkup(
      createElement(Settings, {
        ledger: makeLedger(), theme: 'system', onTheme: () => {}, updateReady: false, onApplyUpdate: () => {}, onCheckUpdate: async () => 'latest', onShowWhatsNew: () => {}, onOpenUpcoming: () => {},
      }),
    )
    expect(html).toContain('See what is coming up, or add a payment')
    expect(html).toContain('Loans, auto-payments, subscriptions, rent and salary')
  })
});
