/**
 * The themes a person can choose from. The colours themselves live in index.css, set on `[data-palette='<id>']`; what is
 * here is how they are named and grouped, the typeface each one wears, and the page colour of each (for the browser's
 * address bar), which palettes.test checks against the style sheet so they cannot drift.
 *
 * look: "flat" themes recolour the page; "glass" themes also draw translucent cards over a backdrop of soft colour and give
 * the app a typeface of its own. A theme with darkOnly has no light version: its light and dark are one.
 */
export const PALETTES = [
  { id: 'classic', name: 'Classic', detail: 'Warm grey, black and white.', look: 'flat', darkOnly: false, font: null, bg: { light: '#f2f1ed', dark: '#121314' } },
  { id: 'ocean', name: 'Ocean', detail: 'Cool blues and clear water.', look: 'flat', darkOnly: false, font: null, bg: { light: '#eaf3f9', dark: '#0a1620' } },
  { id: 'forest', name: 'Forest', detail: 'Calm greens, like a morning walk.', look: 'flat', darkOnly: false, font: null, bg: { light: '#ebf3ec', dark: '#0c1510' } },
  { id: 'sunset', name: 'Sunset', detail: 'Warm oranges and soft cream.', look: 'flat', darkOnly: false, font: null, bg: { light: '#fbefe6', dark: '#1a1210' } },
  { id: 'lavender', name: 'Lavender', detail: 'Soft purples, quiet and clean.', look: 'flat', darkOnly: false, font: null, bg: { light: '#f1eef9', dark: '#130f1f' } },
  { id: 'rose', name: 'Rose', detail: 'Gentle pinks with a warm glow.', look: 'flat', darkOnly: false, font: null, bg: { light: '#faedf1', dark: '#1a0f15' } },
  { id: 'liquid', name: 'Liquid Glass', detail: 'Frosted, bright and airy, like Apple’s glass.', look: 'glass', darkOnly: false, font: 'Plus Jakarta Sans', bg: { light: '#e8eef9', dark: '#0a1020' } },
  { id: 'pearl', name: 'Pearl', detail: 'Soft pearl glass, light type and a touch of violet.', look: 'glass', darkOnly: false, font: 'Geist', bg: { light: '#e5e3ee', dark: '#12111c' } },
  { id: 'aurora', name: 'Aurora', detail: 'Dark glass over northern lights.', look: 'glass', darkOnly: true, font: 'Space Grotesk', bg: { light: '#070b16', dark: '#070b16' } },
  { id: 'neon', name: 'Neon', detail: 'Electric cyan and magenta on black.', look: 'glass', darkOnly: true, font: 'Exo 2', bg: { light: '#05060a', dark: '#05060a' } },
  { id: 'obsidian', name: 'Obsidian', detail: 'Black glass, silver light, nothing else.', look: 'glass', darkOnly: true, font: 'Manrope', bg: { light: '#060607', dark: '#060607' } },
] as const

export type PaletteId = (typeof PALETTES)[number]['id']
export type Palette = (typeof PALETTES)[number]

export const DEFAULT_PALETTE: PaletteId = 'classic'

export const isPalette = (v: unknown): v is PaletteId => PALETTES.some((p) => p.id === v)

export const FLAT_PALETTES = PALETTES.filter((p) => p.look === 'flat')
export const GLASS_PALETTES = PALETTES.filter((p) => p.look === 'glass')

/** The font stack a theme sets, for showing a sample of it before it is chosen. The others use the app's own face. */
export const fontStack = (p: Palette) => `'${p.font ?? 'Manrope'} Variable', 'Manrope Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`
