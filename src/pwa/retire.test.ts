import { afterEach, describe, expect, it, vi } from 'vitest'
import { retireServiceWorker } from './retire'

function stub(over: { registrations?: { unregister: () => Promise<boolean> }[]; keys?: string[]; serviceWorker?: unknown } = {}) {
  const deleted: string[] = []
  vi.stubGlobal('navigator', { serviceWorker: 'serviceWorker' in over ? over.serviceWorker : { getRegistrations: async () => over.registrations ?? [] } })
  vi.stubGlobal('caches', { keys: async () => over.keys ?? [], delete: async (key: string) => void deleted.push(key) })
  return deleted
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('retireServiceWorker', () => {
  it('removes every worker and everything it kept', async () => {
    const one = vi.fn().mockResolvedValue(true)
    const two = vi.fn().mockResolvedValue(true)
    const deleted = stub({ registrations: [{ unregister: one }, { unregister: two }], keys: ['workbox-precache-v2', 'widget-data'] })
    expect(await retireServiceWorker()).toBe(true)
    expect(one).toHaveBeenCalledOnce()
    expect(two).toHaveBeenCalledOnce()
    expect(deleted).toEqual(['workbox-precache-v2', 'widget-data'])
  })

  it('is quiet when there is nothing to remove', async () => {
    const deleted = stub()
    expect(await retireServiceWorker()).toBe(true)
    expect(deleted).toEqual([])
  })

  it('copes with a page that has no service workers at all', async () => {
    stub({ serviceWorker: undefined, keys: ['old'] })
    expect(await retireServiceWorker()).toBe(true)
  })

  it('says so, rather than failing, when it cannot', async () => {
    stub({ registrations: [{ unregister: () => Promise.reject(new Error('no')) }] })
    expect(await retireServiceWorker()).toBe(false)
  })
})
