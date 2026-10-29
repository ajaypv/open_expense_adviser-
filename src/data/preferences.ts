import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'

/** Where regular-transaction suggestions appear. "off" hides them everywhere, including the add form. */
export type SuggestionPlacement = 'input' | 'home' | 'off'

export const SUGGESTION_PLACEMENTS: SuggestionPlacement[] = ['input', 'home', 'off']

const KEY = 'suggestionPlacement'
const DEFAULT: SuggestionPlacement = 'input'

const isPlacement = (v: unknown): v is SuggestionPlacement => SUGGESTION_PLACEMENTS.includes(v as SuggestionPlacement)

/** The saved choice, or the default when none is saved or the stored value is unrecognised. */
export async function getSuggestionPlacement(): Promise<SuggestionPlacement> {
  const value = (await db.settings.get(KEY))?.value
  return isPlacement(value) ? value : DEFAULT
}

export async function setSuggestionPlacement(placement: SuggestionPlacement): Promise<void> {
  await db.settings.put({ key: KEY, value: placement })
}

/**
 * The live choice. Until the first read finishes this reports "off", so a suggestions row the
 * user turned off never flashes in for a moment on startup.
 */
export function useSuggestionPlacement(): SuggestionPlacement {
  return useLiveQuery(getSuggestionPlacement, []) ?? 'off'
}
