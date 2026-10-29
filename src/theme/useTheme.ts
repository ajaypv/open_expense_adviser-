import { useCallback, useState } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'theme'

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    // Storage can be blocked (private mode); fall back to the system theme.
  }
  return 'system'
}

export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(read)

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

  return { pref, setPref }
}
