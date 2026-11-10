// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const app = vi.hoisted(() => ({
  native: true,
  handler: null as null | ((e: { canGoBack: boolean }) => void),
  remove: vi.fn().mockResolvedValue(undefined),
  exitApp: vi.fn(),
  addListener: vi.fn(),
}))
vi.mock('../native/platform', () => ({ isNativeApp: () => app.native }))
vi.mock('@capacitor/app', () => ({ App: { addListener: app.addListener, exitApp: app.exitApp } }))

import { handleNativeBack } from './back'

beforeEach(() => {
  app.native = true
  app.handler = null
  app.remove.mockClear()
  app.exitApp.mockClear()
  app.addListener.mockReset().mockImplementation((_name: string, cb: (e: { canGoBack: boolean }) => void) => {
    app.handler = cb
    return Promise.resolve({ remove: app.remove })
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('the back button in the Android app', () => {
  it('listens for the phone’s back button', () => {
    handleNativeBack()
    expect(app.addListener).toHaveBeenCalledExactlyOnceWith('backButton', expect.any(Function))
  })

  it('steps back through the page’s history when there is a step to take, which is what closes a sheet', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    handleNativeBack()
    app.handler!({ canGoBack: true })
    expect(back).toHaveBeenCalledOnce()
    expect(app.exitApp).not.toHaveBeenCalled()
  })

  it('leaves the app when there is nothing left to close', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    handleNativeBack()
    app.handler!({ canGoBack: false })
    expect(app.exitApp).toHaveBeenCalledOnce()
    expect(back).not.toHaveBeenCalled()
  })

  it('stops listening when told to', async () => {
    const stop = handleNativeBack()
    await flush()
    stop()
    await flush()
    expect(app.remove).toHaveBeenCalledOnce()
  })

  it('stops listening even when told to before the listener was ready', async () => {
    const stop = handleNativeBack()
    stop()
    await flush()
    expect(app.remove).toHaveBeenCalledOnce()
  })

  it('does nothing in a browser, where back already works', () => {
    app.native = false
    const stop = handleNativeBack()
    stop()
    expect(app.addListener).not.toHaveBeenCalled()
  })
})
