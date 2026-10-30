import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/index.css', 'utf8')

describe('fonts', () => {
  it('sets Manrope first, with system fonts as the fallback while it loads', () => {
    expect(css).toMatch(/--font-sans:\s*'Manrope Variable',\s*system-ui/)
  })

  it('ships the font files with the app, so the type is the same offline', () => {
    const files = [...css.matchAll(/url\('\.\/(assets\/fonts\/[^']+\.woff2)'\)/g)].map((m) => `src/${m[1]}`)
    expect(files).toHaveLength(2)
    for (const file of files) expect(existsSync(file), file).toBe(true)
    expect(existsSync('src/assets/fonts/Manrope-OFL.txt')).toBe(true) // the licence goes with the font
  })

  it('covers the rupee sign, the euro sign and plain digits', () => {
    const ranges = [...css.matchAll(/unicode-range:\s*([^;]+);/g)].flatMap((m) =>
      m[1].split(',').map((part) => {
        const [from, to = from] = part.trim().replace(/U\+/g, '').split('-')
        return [parseInt(from, 16), parseInt(to, 16)] as const
      }),
    )
    const covered = (code: number) => ranges.some(([from, to]) => code >= from && code <= to)
    expect(covered(0x20b9)).toBe(true) // ₹
    expect(covered(0x20ac)).toBe(true) // €
    expect(covered(0x30)).toBe(true) // 0
  })
})
