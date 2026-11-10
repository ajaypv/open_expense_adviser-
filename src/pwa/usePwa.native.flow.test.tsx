// @vitest-environment jsdom
import '../test/dom'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const app = vi.hoisted(() => ({ native: true, registerSW: vi.fn(), retire: vi.fn() }))
vi.mock('../native/platform', () => ({ isNativeApp: () => app.native }))
vi.mock('virtual:pwa-register', () => ({ registerSW: app.registerSW }))
vi.mock('./retire', () => ({ retireServiceWorker: app.retire }))

import { usePwa } from './usePwa'

beforeEach(() => {
  app.native = true
  app.registerSW.mockReset().mockReturnValue(vi.fn())
  app.retire.mockReset().mockResolvedValue(true)
})

describe('usePwa inside the Android app', () => {
  it('keeps no service worker, and removes one an earlier version left behind', async () => {
    renderHook(() => usePwa())
    await waitFor(() => expect(app.retire).toHaveBeenCalledOnce())
    expect(app.registerSW).not.toHaveBeenCalled()
  })

  it('has no update or install to offer', () => {
    const { result } = renderHook(() => usePwa())
    expect(result.current).toMatchObject({ canInstall: false, updateReady: false, offlineReady: false, showIosHint: false })
  })
})

describe('usePwa in a browser', () => {
  it('registers the service worker as before and leaves it alone', () => {
    app.native = false
    renderHook(() => usePwa())
    expect(app.registerSW).toHaveBeenCalledOnce()
    expect(app.retire).not.toHaveBeenCalled()
  })
})
