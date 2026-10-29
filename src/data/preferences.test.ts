import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(async () => {
  await Dexie.delete('expense-tracker')
  vi.resetModules()
})

async function load() {
  const [{ db }, prefs] = await Promise.all([import('../db/schema'), import('./preferences')])
  await db.open()
  return { db, ...prefs }
}

describe('suggestion placement', () => {
  it('defaults to above the input bar when nothing is saved', async () => {
    const { getSuggestionPlacement } = await load()
    expect(await getSuggestionPlacement()).toBe('input')
  })

  it('remembers each choice', async () => {
    const { getSuggestionPlacement, setSuggestionPlacement } = await load()
    for (const choice of ['home', 'off', 'input'] as const) {
      await setSuggestionPlacement(choice)
      expect(await getSuggestionPlacement()).toBe(choice)
    }
  })

  it('falls back to the default if the stored value is not a known choice', async () => {
    const { db, getSuggestionPlacement } = await load()
    await db.settings.put({ key: 'suggestionPlacement', value: 'sideways' })
    expect(await getSuggestionPlacement()).toBe('input')
    await db.settings.put({ key: 'suggestionPlacement', value: 42 })
    expect(await getSuggestionPlacement()).toBe('input')
  })
})
