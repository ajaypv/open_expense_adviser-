import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Settings } from './Settings'

const ledger = {
  loading: false, txs: [], expenses: [], income: [], categories: [], expenseCategories: [],
  categoryById: new Map(), currency: 'INR', budgetMinor: null, balanceSet: false, estimatedBalanceMinor: 0, netMinor: 0,
}

const render = (props: { updateReady?: boolean } = {}) =>
  renderToStaticMarkup(
    createElement(Settings, {
      ledger, theme: 'system', onTheme: () => {}, updateReady: false, onApplyUpdate: () => {}, onCheckUpdate: async () => 'latest',
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
