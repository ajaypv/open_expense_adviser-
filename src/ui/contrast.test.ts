import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/index.css', 'utf8')

/** The custom properties declared in the block that starts at `start` (up to its closing brace). */
function tokens(start: string, from = 0): Record<string, string> {
  const i = css.indexOf(start, from)
  if (i < 0) throw new Error(`no block: ${start}`)
  const body = css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i))
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]))
}

const light = tokens(':root {')
const dark = tokens(":root:not([data-theme='light'])", css.indexOf('@media (prefers-color-scheme: dark)'))
const forcedDark = tokens(":root[data-theme='dark']")

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const themes = { light, dark, 'forced dark': forcedDark }
const surfaces = ['bg', 'surface', 'surface-2']

describe.each(Object.entries(themes))('contrast in the %s theme', (_name, t) => {
  it('keeps reading text at 4.5:1 or more on every surface it sits on', () => {
    for (const text of ['ink', 'ink-2', 'muted', 'critical-text', 'good-text']) {
      for (const surface of surfaces) {
        expect(ratio(t[text], t[surface]), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('keeps the outline of a control at 3:1 or more, so a field can be found', () => {
    for (const surface of surfaces) expect(ratio(t.edge, t[surface]), `edge on ${surface}`).toBeGreaterThanOrEqual(3)
  })

  it('keeps the warning colour visible as an icon or a bar', () => {
    expect(ratio(t['warn-ui'], t.surface), 'warn-ui on surface').toBeGreaterThanOrEqual(3)
    expect(ratio(t['warn-ui'], t['surface-2']), 'warn-ui on surface-2').toBeGreaterThanOrEqual(3)
  })

  it('keeps every category colour at 3:1 or more on the card it is drawn on', () => {
    for (const slot of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 'other']) {
      expect(ratio(t[slot], t.surface), `${slot} on surface`).toBeGreaterThanOrEqual(3)
    }
  })

  it('keeps the placeholder colour (muted) readable inside a filled field', () => {
    expect(ratio(t.muted, t['surface-2'])).toBeGreaterThanOrEqual(4.5)
  })
})

describe('the two dark blocks agree', () => {
  it('declare the same colours for the tokens they share', () => {
    for (const key of Object.keys(dark)) expect(forcedDark[key], key).toBe(dark[key])
  })
})

describe('the dark theme is soft, not pure black on bright white', () => {
  it.each([
    ['media block', dark],
    ['forced dark', forcedDark],
  ])('uses a charcoal page, a lighter card on it, and an off-white text (%s)', (_name, t) => {
    expect(t.bg).not.toMatch(/^#0{6}$|^#0d0d0d$/i) // not black, and not the old near-black either
    expect(luminance(t.bg)).toBeGreaterThan(0.004)
    expect(luminance(t.bg)).toBeLessThan(0.02)
    expect(luminance(t.surface)).toBeGreaterThan(luminance(t.bg)) // cards sit above the page
    expect(luminance(t['surface-2'])).toBeGreaterThan(luminance(t.surface))
    expect(t.ink).not.toMatch(/^#f{6}$/i) // never pure white
    expect(ratio(t.ink, t.bg)).toBeLessThan(18) // calmer than white on black (which is 21:1)
    expect(ratio(t.ink, t.bg)).toBeGreaterThan(12) // still very easy to read
  })

  it('keeps the card edge visible without drawing a hard line', () => {
    expect(ratio(dark.line, dark.surface)).toBeGreaterThan(1.1)
    expect(ratio(dark.line, dark.surface)).toBeLessThan(2)
  })
})
