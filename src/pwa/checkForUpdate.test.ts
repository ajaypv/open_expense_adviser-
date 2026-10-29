import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkForUpdate } from './checkForUpdate'

/** A stand-in service worker whose state can be changed by the test. */
function fakeWorker(state: ServiceWorkerState = 'installing') {
  const target = new EventTarget() as EventTarget & { state: ServiceWorkerState }
  target.state = state
  return target
}

function fakeRegistration(parts: { waiting?: unknown; installing?: unknown; update?: () => Promise<void> }) {
  return { waiting: null, installing: null, update: async () => {}, ...parts } as unknown as ServiceWorkerRegistration
}

const online = () => true

afterEach(() => vi.useRealTimers())

describe('checkForUpdate', () => {
  it('says unsupported when there is no service worker to ask', async () => {
    expect(await checkForUpdate(undefined, online)).toBe('unsupported')
  })

  it('reports a version that is already downloaded and waiting, without a network check', async () => {
    const update = vi.fn()
    const reg = fakeRegistration({ waiting: fakeWorker('installed'), update })
    expect(await checkForUpdate(reg, () => false)).toBe('available')
    expect(update).not.toHaveBeenCalled()
  })

  it('says offline instead of failing when there is no connection', async () => {
    const update = vi.fn()
    expect(await checkForUpdate(fakeRegistration({ update }), () => false)).toBe('offline')
    expect(update).not.toHaveBeenCalled()
  })

  it('says latest when the check finds nothing new', async () => {
    expect(await checkForUpdate(fakeRegistration({}), online)).toBe('latest')
  })

  it('reports an update that finished downloading during the check', async () => {
    const reg = fakeRegistration({
      update: async () => {
        ;(reg as unknown as { waiting: unknown }).waiting = fakeWorker('installed')
      },
    })
    expect(await checkForUpdate(reg, online)).toBe('available')
  })

  it('waits for a newly found version to finish downloading', async () => {
    const worker = fakeWorker('installing')
    const pending = checkForUpdate(fakeRegistration({ installing: worker }), online)
    worker.state = 'installed'
    worker.dispatchEvent(new Event('statechange'))
    expect(await pending).toBe('available')
  })

  it('reports an error if the new version fails to install', async () => {
    const worker = fakeWorker('installing')
    const pending = checkForUpdate(fakeRegistration({ installing: worker }), online)
    worker.state = 'redundant'
    worker.dispatchEvent(new Event('statechange'))
    expect(await pending).toBe('error')
  })

  it('gives up if the download never finishes', async () => {
    vi.useFakeTimers()
    const pending = checkForUpdate(fakeRegistration({ installing: fakeWorker('installing') }), online)
    await vi.advanceTimersByTimeAsync(21_000)
    expect(await pending).toBe('error')
  })

  it('reports an error when the check fails while online, and offline when the connection dropped', async () => {
    const failing = fakeRegistration({
      update: async () => {
        throw new TypeError('network')
      },
    })
    expect(await checkForUpdate(failing, online)).toBe('error')
    let up = true
    const dropping = fakeRegistration({
      update: async () => {
        up = false
        throw new TypeError('network')
      },
    })
    expect(await checkForUpdate(dropping, () => up)).toBe('offline')
  })
})
