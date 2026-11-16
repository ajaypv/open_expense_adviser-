import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r/g, '')
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : [p]
  })

describe('HeroUI is used on the Insights page, and only there', () => {
  it('is imported by the Insights page and by no other part of the app', () => {
    const users = files('src')
      .filter((f) => /\.(tsx?|jsx?)$/.test(f) && !/\.test\./.test(f))
      .filter((f) => read(f).includes('@heroui/'))
      .map((f) => f.replace(/\\/g, '/'))
    expect(users).toEqual(['src/screens/Insights.tsx'])
  })

  const css = read('src/heroui.css')

  it('imports only the stylesheets of the components the page uses, never HeroUI’s whole theme', () => {
    const imports = [...css.matchAll(/@import '([^']+)'/g)].map((m) => m[1])
    expect(imports).toEqual([
      '@heroui/styles/utilities',
      '@heroui/styles/components/button.css',
      '@heroui/styles/components/card.css',
      '@heroui/styles/components/chip.css',
      '@heroui/styles/components/alert.css',
      '@heroui/styles/components/toggle-button.css',
      '@heroui/styles/components/toggle-button-group.css',
    ])
    expect(read('src/index.css')).not.toMatch(/@import ['"]@heroui\/styles['"]/)
    expect(read('src/index.css')).toContain("@import './heroui.css';")
  })

  it('sets its colours on the HeroUI components only, never on :root or the page, so no other page is repainted', () => {
    // Every rule that sets a custom property (outside @theme) is on a HeroUI component's own class.
    const rules = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@import [^;]*;/g, '')
      .replace(/@theme inline \{[\s\S]*?\n\}\n/, '')
      .split('}')
      .map((r) => r.trim())
      .filter((r) => /--[a-z-]+:/.test(r))
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) {
      const selector = rule.slice(0, rule.indexOf('{')).trim()
      expect(selector, selector).toMatch(/^(\.[a-z-]+,?\s*)+$/)
      expect(selector).not.toMatch(/:root|html|body|\*/)
    }
  })

  it('does not change the app’s own radii or any colour name it already has', () => {
    expect(css).not.toMatch(/--radius-(xs|sm|md|lg|xl|2xl|3xl|4xl):/)
    const app = read('src/index.css')
    const taken = ['--color-bg', '--color-ink', '--color-ink-2', '--color-line', '--color-btn', '--color-btn-ink', '--color-good', '--color-critical', '--color-surface-2']
    for (const name of taken) {
      expect(app, name).toContain(`${name}:`)
      expect(css, name).not.toContain(`${name}:`)
    }
  })

  it('makes the chosen button of a group the app’s own solid pill', () => {
    expect(css).toMatch(/\.toggle-button \{[^}]*--toggle-button-bg-selected: var\(--btn\)/)
    expect(css).toMatch(/\.toggle-button \{[^}]*--toggle-button-fg-selected: var\(--btn-ink\)/)
  })

  it('gives the cards the app’s own thin ring, so they look as the other pages’ do', () => {
    expect(css).toMatch(/--surface-shadow: 0 0 0 1px var\(--ring\)/)
  })
})
