import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
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
  it('is a short list: a backup, the app update, and five pages to go to', () => {
    const html = render()
    expect(html).toMatch(/<h1[^>]*>Settings<\/h1>/)
    expect(html).toContain('aria-label="Backup and restore"')
    expect(html).toContain('aria-label="App update"')
    const nav = html.slice(html.indexOf('aria-label="Settings pages"'))
    for (const page of ['Money', 'Automatic', 'Suggestions', 'Appearance', 'Privacy and data']) expect(nav).toContain(`>${page}</span>`)
    expect((nav.match(/<li>/g) ?? []).length).toBe(5)
  })

  it('says in a line what is on each page', () => {
    const html = render()
    for (const line of ['Currency, accounts and balance, people, monthly budget', 'Regular payments, reminders, widget', 'Your regulars, on Home or above the input bar', 'Colour theme, light or dark, text size, hide amounts', 'App lock, location, export, recently deleted']) {
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
    expect(at('aria-label="Backup and restore"')).toBeLessThan(at('aria-label="App update"'))
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
    expect(html).not.toContain('aria-label="Backup and restore"')
  })

  it('Money: the currency, accounts and balance, and monthly budget', () => {
    const html = page('money')
    for (const h of ['Currency', 'Accounts and balance', 'Monthly budget']) expect(html, h).toMatch(new RegExp(`<h3[^>]*>${h}</h3>`))
  })

  it('Automatic: regular payments, reminders and the widget, and no longer the suggestions', () => {
    const html = page('auto')
    for (const h of ['Recurring', 'Reminders', 'Widget']) expect(html, h).toMatch(new RegExp(`<h3[^>]*>${h}</h3>`))
    expect(html).not.toContain('name="suggestion-placement"')
  })

  it('Suggestions: a page of its own, with where they appear', () => {
    const html = page('suggestions')
    expect(html).toMatch(/<h1[^>]*>Suggestions<\/h1>/)
    for (const text of ['Above the input bar', 'On the Home screen', 'Off', 'including the add form']) expect(html).toContain(text)
    expect((html.match(/name="suggestion-placement"/g) ?? []).length).toBe(3)
  })

  it('Suggestions: says nothing on the list until the choice has been read, so it never shows a wrong one', () => {
    const nav = render().slice(render().indexOf('aria-label="Settings pages"'))
    expect(nav).not.toMatch(/(On Home|By the input|Off)<\/span>/)
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

  it('Privacy and data: export and the trash, with backup and restore left to the top of Settings', () => {
    const html = page('privacy')
    for (const text of ['Export transactions', 'Recently deleted']) expect(html, text).toContain(text)
    for (const text of ['Back up everything', 'Restore from a backup']) expect(html, text).not.toContain(text)
  })

  it('shows each page only its own settings', () => {
    expect(page('look')).not.toContain('Main currency')
    expect(page('money')).not.toContain('Hide amounts')
    expect(page('auto')).not.toContain('App lock')
    expect(page('privacy')).not.toContain('Remind me at')
  })
})

describe('Settings: the list, set in the reference style', () => {
  const css = readFileSync('src/index.css', 'utf8').replace(/\r/g, '')

  it('puts the pages in groups, each under a quiet title', () => {
    const html = render()
    for (const title of ['Your money', 'Make it work for you', 'Safe and private']) expect(html, title).toMatch(new RegExp('<h2[^>]*>' + title + '</h2>'))
    expect(html.indexOf('Your money')).toBeLessThan(html.indexOf('Make it work for you'))
    expect(html.indexOf('Make it work for you')).toBeLessThan(html.indexOf('Safe and private'))
  })

  it('gives each row a round icon of its own: bank, circling A, palette, shield', () => {
    const html = render()
    for (const icon of ['bank', 'autopay', 'palette', 'shield']) expect(html, icon).toMatch(new RegExp('data-icon="' + icon + '" class="[^"]*rounded-full'))
  })

  it('keeps each group of pages in one card, divided by hairlines, with the summary allowed two lines', () => {
    const html = render()
    expect(html).toContain('divide-y divide-line overflow-hidden rounded-3xl')
    expect(html).toContain('line-clamp-2')
    expect(html.slice(html.indexOf('aria-label="Settings pages"'))).not.toContain('truncate')
  })

  it('sets the page title in the one title size, and each group title too', () => {
    expect(render()).toMatch(/<h1 class="type-greeting pt-4">Settings<\/h1>/)
    expect(render({ initialPage: 'money' })).toMatch(/<h3 id="currency-h" class="type-title">Currency<\/h3>/)
  })

  it('folds the long explanations away under How this works, so a page opens on the settings', () => {
    const html = render({ initialPage: 'money' })
    expect(html).toContain('How this works')
    expect(html).toContain('<details class="group')
    expect(html).toContain('What each account holds today. The total stays hidden on Home until you tap Show balance.')
  })

  it('shows each account with a round bank icon', () => {
    expect(render({ initialPage: 'money' })).toMatch(/data-icon="bank" class="[^"]*rounded-full/)
  })

  it('gives the Appearance settings a round icon each', () => {
    const html = render({ initialPage: 'look' })
    for (const icon of ['sun', 'sliders', 'eyeOff', 'swap']) expect(html, icon).toMatch(new RegExp('data-icon="' + icon + '" class="[^"]*rounded-full'))
  })

  it('says at a glance, on the right, the currency', () => {
    expect(render()).toMatch(/INR<\/span><span aria-hidden/)
  })

  it('is set in a rounded geometric typeface, on the list and on each page', () => {
    expect(render()).toContain('class="font-cred')
    expect(render({ initialPage: 'money' })).toContain('class="font-cred')
    expect(css).toMatch(/\.font-cred \{[^}]*font-family: 'Plus Jakarta Sans Variable'/)
  })

  it('holds the backup and the update in one softly rounded panel', () => {
    expect(render()).toContain('class="cred-panel')
    expect(css).toMatch(/\.cred-panel \{[^}]*border-radius: 2rem/)
  })
})
