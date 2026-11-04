import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeLedger } from '../test/ledger'
import { Settings, type SettingsPage } from './Settings'

const render = (props: { updateReady?: boolean; initialPage?: SettingsPage | null; onOpenUpcoming?: () => void } = {}) =>
  renderToStaticMarkup(
    createElement(Settings, {
      ledger: makeLedger(), theme: 'system', onTheme: () => {}, updateReady: false, onApplyUpdate: () => {}, onCheckUpdate: async () => 'latest', onShowWhatsNew: () => {},
      ...props,
    }),
  )

describe('Settings: the list', () => {
  it('is a short list: a backup, the app update, and four pages to go to', () => {
    const html = render()
    expect(html).toMatch(/<h1[^>]*>Settings<\/h1>/)
    expect(html).toContain('aria-label="Backup"')
    expect(html).toContain('aria-label="App update"')
    const nav = html.slice(html.indexOf('aria-label="Settings pages"'))
    for (const page of ['Money', 'Automatic', 'Appearance', 'Privacy and data']) expect(nav).toContain(`>${page}</span>`)
    expect((nav.match(/<li>/g) ?? []).length).toBe(4)
  })

  it('says in a line what is on each page', () => {
    const html = render()
    for (const line of ['Currency, accounts and balance, monthly budget', 'Regular payments, reminders, suggestions, widget', 'Colour theme, light or dark, text size, hide amounts', 'App lock, location, export, restore, recently deleted']) {
      expect(html).toContain(line)
    }
  })

  it('keeps the settings themselves off the list, so it stays short', () => {
    const html = render()
    for (const text of ['Main currency', 'Monthly budget</h3>', 'Remind me at', 'Hide amounts', 'App lock</h3>', 'Recently deleted']) {
      expect(html, text).not.toContain(text)
    }
  })

  it('puts the backup first, then the update, then the pages', () => {
    const html = render()
    const at = (s: string) => html.indexOf(s)
    expect(at('aria-label="Backup"')).toBeLessThan(at('aria-label="App update"'))
    expect(at('aria-label="App update"')).toBeLessThan(at('aria-label="Settings pages"'))
  })

  it('has a button to back up, and says when nothing is there to back up yet', () => {
    const html = render()
    expect(html).toContain('Back up now')
    expect(html).toContain('Nothing to back up yet')
  })

  it('does not advertise something that does not exist yet', () => {
    const html = render()
    expect(html).not.toContain('AI assistant')
    expect(html).not.toContain('Coming soon')
  })
})

describe('Settings: the app update', () => {
  it('shows the running version and a way to check for updates', () => {
    const html = render()
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

  it('says nothing about updates until there is something to say', () => {
    expect(render()).not.toContain('New versions download in the background')
  })
})

describe('Settings: a page', () => {
  const page = (id: SettingsPage, extra: { onOpenUpcoming?: () => void } = {}) => render({ initialPage: id, ...extra })

  it('has the page title, a way back, and not the list', () => {
    const html = page('money')
    expect(html).toMatch(/<h1[^>]*>Money<\/h1>/)
    expect(html).toContain('aria-label="Back to Settings"')
    expect(html).not.toContain('aria-label="Settings pages"')
    expect(html).not.toContain('aria-label="Backup"')
  })

  it('Money: the currency, accounts and balance, and monthly budget', () => {
    const html = page('money')
    for (const h of ['Currency', 'Accounts and balance', 'Monthly budget']) expect(html, h).toMatch(new RegExp(`<h3[^>]*>${h}</h3>`))
  })

  it('Automatic: regular payments, reminders and suggestions, including where suggestions appear', () => {
    const html = page('auto')
    for (const h of ['Recurring', 'Reminders', 'Suggestions', 'Widget']) expect(html, h).toMatch(new RegExp(`<h3[^>]*>${h}</h3>`))
    for (const text of ['Above the input bar', 'On the Home screen', 'Off', 'including the add form']) expect(html).toContain(text)
    expect((html.match(/name="suggestion-placement"/g) ?? []).length).toBe(3)
  })

  it('Automatic: leads to the upcoming payments, where they are added and changed', () => {
    const html = page('auto', { onOpenUpcoming: () => {} })
    expect(html).toContain('See what is coming up, or add a payment')
    expect(html).toContain('Loans, auto-payments, subscriptions, rent and salary')
  })

  it('Appearance: the colour theme first, then light or dark, text size, hiding amounts and number format', () => {
    const html = page('look')
    expect(html).toMatch(/<h3[^>]*>Colour theme<\/h3>/)
    expect(html).toMatch(/<h3[^>]*>Mode, text and numbers<\/h3>/)
    expect(html.indexOf('>Colour theme</h3>')).toBeLessThan(html.indexOf('>Mode, text and numbers</h3>'))
    for (const text of ['Mode', 'Text size', 'Hide amounts', 'Number format']) expect(html, text).toContain(text)
  })

  it('Appearance: offers every colour theme, each with a line about it, and shows the chosen one', () => {
    const html = render({ initialPage: 'look' })
    expect(html).toContain('aria-label="Colour theme"')
    for (const name of ['Classic', 'Ocean', 'Forest', 'Sunset', 'Lavender', 'Rose', 'Liquid Glass', 'Pearl', 'Aurora', 'Neon', 'Obsidian']) expect(html, name).toContain(`>${name}</span>`)
    expect((html.match(/name="palette"/g) ?? []).length).toBe(11)
    // The flat colours first, then the glass and futuristic ones, each with a heading.
    expect(html.indexOf('>Colours</p>')).toBeLessThan(html.indexOf('>Glass and futuristic</p>'))
    expect(html.indexOf('>Rose</span>')).toBeLessThan(html.indexOf('>Glass and futuristic</p>'))
    expect(html.indexOf('>Liquid Glass</span>')).toBeGreaterThan(html.indexOf('>Glass and futuristic</p>'))
    // The classic one is chosen when nothing has been.
    expect(html).toMatch(/checked=""[^>]*name="palette"|name="palette"[^>]*checked=""/)
  })

  it('Privacy and data: your data first, then the app lock, then location', () => {
    const html = page('privacy')
    const at = (h: string) => html.indexOf(`>${h}</h3>`)
    expect(at('Your data')).toBeGreaterThan(-1)
    expect(at('Your data')).toBeLessThan(at('App lock'))
    expect(at('App lock')).toBeLessThan(at('Location'))
  })

  it('Privacy and data: backup, export, restore and the trash', () => {
    const html = page('privacy')
    for (const text of ['Back up everything', 'Export transactions', 'Restore from a backup', 'Recently deleted']) expect(html, text).toContain(text)
  })

  it('shows each page only its own settings', () => {
    expect(page('look')).not.toContain('Main currency')
    expect(page('money')).not.toContain('Hide amounts')
    expect(page('auto')).not.toContain('App lock')
    expect(page('privacy')).not.toContain('Remind me at')
  })
})
