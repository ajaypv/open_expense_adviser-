import { useSyncExternalStore } from 'react'
import { setNumberFormat, setPrivacyMode, type NumberFormat } from '../db/money'

export type TextSize = 'small' | 'default' | 'large' | 'xlarge'

export interface DisplayPrefs {
  numberFormat: NumberFormat
  /** Replace every amount with a mask, so the screen can be shown to others. */
  privacy: boolean
  textSize: TextSize
}

/** Root font size for each text size. The whole interface is sized in rem, so it all scales. */
export const TEXT_SCALE: Record<TextSize, string> = { small: '90%', default: '100%', large: '112.5%', xlarge: '125%' }

const KEY = 'display-prefs'
const DEFAULTS: DisplayPrefs = { numberFormat: 'auto', privacy: false, textSize: 'default' }

const NUMBER_FORMATS: NumberFormat[] = ['auto', 'indian', 'international']
const TEXT_SIZES = Object.keys(TEXT_SCALE) as TextSize[]

/**
 * These live in localStorage, like the theme, not the database: they must be known before the first
 * paint, or amounts would flash on screen for someone who turned privacy mode on.
 */
function read(): DisplayPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<DisplayPrefs>
    return {
      numberFormat: NUMBER_FORMATS.includes(raw.numberFormat as NumberFormat) ? (raw.numberFormat as NumberFormat) : DEFAULTS.numberFormat,
      privacy: raw.privacy === true,
      textSize: TEXT_SIZES.includes(raw.textSize as TextSize) ? (raw.textSize as TextSize) : DEFAULTS.textSize,
    }
  } catch {
    return DEFAULTS
  }
}

/** Push the preferences into the places that act on them. */
export function applyDisplay(prefs: DisplayPrefs): void {
  setNumberFormat(prefs.numberFormat)
  setPrivacyMode(prefs.privacy)
  if (typeof document !== 'undefined') document.documentElement.style.fontSize = TEXT_SCALE[prefs.textSize]
}

let state = read()
applyDisplay(state) // before anything renders
const listeners = new Set<() => void>()

export const getDisplay = () => state

export function setDisplay(patch: Partial<DisplayPrefs>): void {
  state = { ...state, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* private mode: the choice lasts for this session only */
  }
  applyDisplay(state)
  listeners.forEach((l) => l())
}

/** Re-read from storage; used by tests and when another tab changes the setting. */
export function reloadDisplay(): void {
  state = read()
  applyDisplay(state)
  listeners.forEach((l) => l())
}

export function useDisplay(): DisplayPrefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getDisplay,
    getDisplay,
  )
}
