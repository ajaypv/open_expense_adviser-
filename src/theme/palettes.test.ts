import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GLASS_PALETTES, PALETTES, type Palette } from './palettes'

// Comments out, so that a rule's selector is only its selector.
const raw = readFileSync('src/index.css', 'utf8').replace(/\r/g, '')
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')

/** Every rule in the style sheet as a selector list and its body. At-rules' own braces are skipped, their rules kept. */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }))

function hexTokens(body: string): Record<string, string> {
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]))
}
function allTokens(body: string): string[] {
  return [...body.matchAll(/--([\w-]+):/g)].map((m) => m[1])
}
function rgbaTokens(body: string): Record<string, string> {
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(rgba?\([^)]*\))/g)].map((m) => [m[1], m[2]]))
}
const find = (test: (selector: string) => boolean, what: string) => {
  const rule = rules.find((r) => test(r.selector))
  if (!rule) throw new Error(`no rule: ${what}`)
  return rule
}
const selectors = (s: string) => s.split(',').map((x) => x.trim())

// A theme with a light and a dark has a block for each (and one for dark chosen by hand); a dark-only one has a single block.
const light = (p: Palette) => (p.darkOnly ? solo(p) : find((s) => s === `[data-palette='${p.id}']`, `${p.id} light`))
const dark = (p: Palette) => (p.darkOnly ? solo(p) : find((s) => s.includes(`:root:not([data-theme='light'])[data-palette='${p.id}']`), `${p.id} dark`))
const forcedDark = (p: Palette) => (p.darkOnly ? solo(p) : find((s) => s.includes(`:root[data-theme='dark'][data-palette='${p.id}']`), `${p.id} forced dark`))
const solo = (p: Palette) => find((s) => selectors(s).includes(`:root[data-palette='${p.id}']`), `${p.id} dark only`)

const baseLight = hexTokens(find((s) => s === ':root', 'base').body)
const baseDark = hexTokens(find((s) => s === ":root:not([data-theme='light'])", 'base dark').body)

// luminance and contrast, as in ui/contrast.test.ts
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
/** A translucent colour laid over an opaque one, as hex. */
function over(rgba: string, back: string): string {
  const [r, g, b, a = '1'] = rgba.match(/[\d.]+/g)!
  const bg = [1, 3, 5].map((i) => parseInt(back.slice(i, i + 2), 16))
  return '#' + [+r, +g, +b].map((v, i) => Math.round(v * +a + bg[i] * (1 - +a)).toString(16).padStart(2, '0')).join('')
}

/** What every theme sets, and what a glass one sets besides. The category colours and the meaning colours are never among them. */
const TOKENS = ['bg', 'surface', 'surface-2', 'ink', 'ink-2', 'muted', 'line', 'axis', 'edge', 'ring', 'btn', 'btn-ink', 'island', 'island-ink', 'accent']
const GLASS_TOKENS = ['glass-surface', 'glass-surface-2', 'glass-chrome', 'glass-sheet', 'glass-edge', 'glass-hi', 'glass-shadow', 'backdrop-worst', 'font-ui', 'bg-art']
const NEVER = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 'other', 'good-text', 'critical-text', 'critical', 'warn', 'warn-ui']
const expected = (p: Palette) => (p.look === 'glass' ? [...TOKENS, ...GLASS_TOKENS] : TOKENS)

describe('the themes', () => {
  it('has eleven, each with its own name, the classic one first, the flat colours before the glass ones', () => {
    expect(PALETTES.map((p) => p.id)).toEqual(['classic', 'ocean', 'forest', 'sunset', 'lavender', 'rose', 'liquid', 'pearl', 'aurora', 'neon', 'obsidian'])
    expect(new Set(PALETTES.map((p) => p.name)).size).toBe(PALETTES.length)
    expect(PALETTES.every((p) => p.detail.length > 10)).toBe(true)
    expect(PALETTES.map((p) => p.look)).toEqual([...PALETTES.map((p) => p.look)].sort((a, b) => (a === b ? 0 : a === 'flat' ? -1 : 1)))
  })

  it.each(PALETTES)('$id sets what it should, in each of its blocks', (p) => {
    for (const rule of [light(p), dark(p), forcedDark(p)]) expect(allTokens(rule.body).sort()).toEqual([...expected(p)].sort())
  })

  it.each(PALETTES)('$id sets the same colours whether dark comes from the phone or from the choice', (p) => {
    expect(hexTokens(dark(p).body)).toEqual(hexTokens(forcedDark(p).body))
  })

  it.each(PALETTES)('$id leaves the category colours and the meaning colours alone', (p) => {
    for (const rule of [light(p), dark(p), forcedDark(p)]) for (const never of NEVER) expect(allTokens(rule.body), never).not.toContain(never)
  })

  it('makes the classic theme exactly what the page has with no theme at all', () => {
    const classic = PALETTES[0]
    const same = (a: Record<string, string>, b: Record<string, string>) => {
      for (const key of TOKENS.filter((k) => k !== 'accent' && k !== 'ring')) expect(a[key], key).toBe(b[key])
    }
    same(hexTokens(light(classic).body), baseLight)
    same(hexTokens(dark(classic).body), baseDark)
    // The accent is the first category colour, as it always was.
    expect(hexTokens(light(classic).body).accent).toBe(baseLight.s1)
    expect(hexTokens(dark(classic).body).accent).toBe(baseDark.s1)
  })

  it('records the page colour of each, for the browser bars, as the style sheet has it', () => {
    for (const p of PALETTES) {
      expect(hexTokens(light(p).body).bg, `${p.id} light`).toBe(p.bg.light)
      expect(hexTokens(dark(p).body).bg, `${p.id} dark`).toBe(p.bg.dark)
    }
  })

  it('has accent tokens in the base styles, so the charts have one colour to ask for', () => {
    expect(css).toContain('--accent: var(--s1);')
    expect(css).toContain('--color-accent: var(--accent);')
  })
})

describe('the dark-only themes', () => {
  const darkOnly = PALETTES.filter((p) => p.darkOnly)

  it('are the glass ones that have no light', () => {
    expect(darkOnly.map((p) => p.id)).toEqual(['aurora', 'neon', 'obsidian'])
    expect(darkOnly.every((p) => p.look === 'glass')).toBe(true)
  })

  it.each(darkOnly)('$id is dark whatever the phone or the choice says, and says so to the browser', (p) => {
    const rule = solo(p)
    expect(rule.body).toContain('color-scheme: dark')
    // On the page itself, at the weight of the light and dark blocks, so it wins over both.
    expect(selectors(rule.selector)).toEqual([`[data-palette='${p.id}']`, `:root[data-palette='${p.id}']`])
    expect(p.bg.light).toBe(p.bg.dark)
  })

  it('have no light version to fall out of step: the others each have both', () => {
    for (const p of PALETTES.filter((x) => !x.darkOnly)) expect(() => dark(p)).not.toThrow()
  })
})

describe('the glass themes', () => {
  const glassRule = (suffix: string) => find((s) => s.includes('.bg-surface') && s.startsWith(':is(') && s.endsWith(suffix), `glass rule ${suffix}`)
  const ids = (selector: string) => [...selector.matchAll(/\[data-palette='(\w+)'\]/g)].map((m) => m[1])

  it('draw on exactly the themes that are marked as glass, and on no other', () => {
    expect(ids(glassRule('.bg-surface').selector).sort()).toEqual(GLASS_PALETTES.map((p) => p.id).sort())
  })

  it.each(GLASS_PALETTES)('$id has a backdrop of soft colour, so there is something to see through the glass', (p) => {
    for (const rule of [light(p), dark(p)]) expect(rule.body).toMatch(/--bg-art:\s*[\s\S]*gradient\(/)
  })

  it.each(GLASS_PALETTES)('$id names its typeface first, and that typeface is shipped', (p) => {
    const stack = /--font-ui:\s*([^;]+);/.exec(light(p).body)![1]
    expect(stack.startsWith(`'${p.font} Variable'`)).toBe(true)
    // Manrope is the app's own; the rest are added with their own licence beside the files.
    expect(raw).toContain(`font-family: '${p.font} Variable';`)
  })

  it('ships each typeface with its licence, the files in step with the rules', () => {
    const files = [...raw.matchAll(/url\('\.\/(assets\/fonts\/[^']+\.woff2)'\)/g)].map((m) => m[1])
    expect(files).toHaveLength(14) // seven typefaces (five for themes, one for the AI page, one for Home's words), each in two pieces: Latin, and Latin extended for the rupee sign
    expect(new Set(files).size).toBe(14)
  })

  describe.each(GLASS_PALETTES.flatMap((p) => (p.darkOnly ? [[p, 'dark'] as const] : [[p, 'light'] as const, [p, 'dark'] as const])))('over the art of $0.id, %s', (p, mode) => {
    const rule = mode === 'light' ? light(p) : dark(p)
    const t = { ...(mode === 'light' ? baseLight : baseDark), ...hexTokens(rule.body) }
    const glass = rgbaTokens(rule.body)
    // The page colour, and the strongest colour in the art behind a card (the generator picks the worst for the text).
    const backs = [t.bg, t['backdrop-worst']]

    it('keeps text at 4.5:1 or more on every kind of glass, over the worst of the art', () => {
      for (const back of backs) {
        for (const kind of ['glass-surface', 'glass-surface-2', 'glass-chrome', 'glass-sheet']) {
          const surface = over(glass[kind], back)
          for (const text of ['ink', 'ink-2', 'muted', 'critical-text', 'good-text']) expect(ratio(t[text], surface), `${text} on ${kind} over ${back}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    })

    it('keeps every category colour at 3:1 or more on a card of glass, and the accent too', () => {
      for (const back of backs) {
        const surface = over(glass['glass-surface'], back)
        for (const slot of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 'other', 'accent']) expect(ratio(t[slot], surface), `${slot} over ${back}`).toBeGreaterThanOrEqual(3)
      }
    })
  })

  it('goes back to opaque cards where the browser cannot blur, or where transparency is turned off', () => {
    expect(raw).toMatch(/@supports \(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)/)
    const reduced = raw.slice(raw.indexOf('@media (prefers-reduced-transparency: reduce)'))
    expect(reduced).toContain('background-color: var(--surface)')
    expect(reduced).toContain('backdrop-filter: none')
  })

  it('writes the blur out, because Safari does not read variables inside -webkit-backdrop-filter', () => {
    const declared = [...raw.matchAll(/-webkit-backdrop-filter:\s*([^;{}]+);/g)].map((m) => m[1])
    expect(declared.length).toBeGreaterThanOrEqual(3)
    for (const value of declared) expect(value).not.toContain('var(')
  })

  it('blurs only the bar, the sheet and the pop-up: the cards are translucent, not blurred', () => {
    const blurred = [...raw.matchAll(/([^{}]+)\{[^{}]*(?<!-webkit-)backdrop-filter:\s*blur/g)].map((m) => m[1].trim()).filter((s) => s.startsWith(':is('))
    expect(blurred).toHaveLength(3)
    expect(blurred.map((s) => s.replace(/^:is\([^)]*\)\s*/, '')).sort()).toEqual(['.island', "dialog.sheet", "nav[aria-label='Main']"].sort())
  })

  it('gives Pearl light, airy type: titles in a light weight, a little tighter', () => {
    const rule = find((s) => s.includes("[data-palette='pearl']") && s.includes('h1, h2, h3'), 'pearl headings')
    expect(rule.body).toContain('font-weight: 300')
    expect(rule.body).toContain('letter-spacing: -0.02em')
    // Only Pearl does this: the others keep the weight their headings were drawn in.
    expect(rules.filter((r) => r.selector.includes('h1, h2, h3') && r.selector.includes('data-palette')).length).toBe(1)
  })

  it('shows a card as chosen in the picker even with glass on it', () => {
    expect(raw).toContain('label.bg-surface:has(> input:checked)')
  })
})
