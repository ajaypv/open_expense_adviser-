import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'

const ONBOARDED = 'onboarded'
const SEEN_VERSION = 'lastSeenVersion'

export async function markOnboarded(): Promise<void> {
  await db.settings.put({ key: ONBOARDED, value: true })
}

export async function markVersionSeen(version: string): Promise<void> {
  await db.settings.put({ key: SEEN_VERSION, value: version })
}

/** undefined while the first read is in progress. */
export function useOnboarded(): boolean | undefined {
  return useLiveQuery(async () => (await db.settings.get(ONBOARDED))?.value === true, [])
}

/** undefined while loading; null when nothing has been seen yet. */
export function useSeenVersion(): string | null | undefined {
  return useLiveQuery(async () => {
    const v = (await db.settings.get(SEEN_VERSION))?.value
    return typeof v === 'string' ? v : null
  }, [])
}

/**
 * What to show on start-up. Someone who already has data is not "new" even though they have never
 * seen the welcome. Finishing the welcome records the current version as seen, so a brand-new person
 * is never shown a list of changes they did not live through.
 */
export function startupNotice(opts: {
  loading: boolean
  hasData: boolean
  onboarded: boolean | undefined
  seenVersion: string | null | undefined
  version: string
}): 'welcome' | 'whats-new' | null {
  if (opts.loading || opts.onboarded === undefined || opts.seenVersion === undefined) return null
  if (!opts.onboarded && !opts.hasData) return 'welcome'
  return opts.seenVersion === opts.version ? null : 'whats-new'
}
