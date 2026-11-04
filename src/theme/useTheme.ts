import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_PALETTE, isPalette, PALETTES, type PaletteId } from './palettes'

export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'theme'
const PALETTE_KEY = 'palette'

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    // Storage can be blocked (private mode); fall back to the system theme.
  }
  return 'system'
}

function readPalette(): PaletteId {
  try {
    const v = localStorage.getItem(PALETTE_KEY)
    if (isPalette(v)) return v
  } catch {
    // Blocked storage: the classic colours.
  }
  return DEFAULT_PALETTE
}

/** The browser's own bars (address bar, status bar) take the colour of the page, so they follow the theme too. */
function applyThemeColor(id: PaletteId) {
  const bg = PALETTES.find((p) => p.id === id)!.bg
  for (const scheme of ['light', 'dark'] as const) {
    document.querySelector(`meta[name="theme-color"][media="(prefers-color-scheme: ${scheme})"]`)?.setAttribute('content', bg[scheme])
  }
}

export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(read)
  const [palette, setPaletteState] = useState<PaletteId>(readPalette)

  // The page already wears the saved colours (index.html sets them before the first paint); this keeps the bars in step.
  useEffect(() => applyThemeColor(palette), [palette])

  const setPref = useCallback((next: ThemePref) => {
    const root = document.documentElement
    if (next === 'system') delete root.dataset.theme
    else root.dataset.theme = next
    try {
      if (next === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, next)
    } catch {
      // Not persisted, but the choice still applies for this session.
    }
    setPrefState(next)
  }, [])

  const setPalette = useCallback((next: PaletteId) => {
    if (!isPalette(next)) return
    const root = document.documentElement
    // The classic colours are what the page has with no theme at all, so choosing them takes the attribute away.
    if (next === DEFAULT_PALETTE) delete root.dataset.palette
    else root.dataset.palette = next
    try {
      if (next === DEFAULT_PALETTE) localStorage.removeItem(PALETTE_KEY)
      else localStorage.setItem(PALETTE_KEY, next)
    } catch {
      // Not persisted, but the choice still applies for this session.
    }
    setPaletteState(next)
  }, [])

  return { pref, setPref, palette, setPalette }
}
