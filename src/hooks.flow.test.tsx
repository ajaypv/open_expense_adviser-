// @vitest-environment jsdom
import './test/dom'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePwa } from './pwa/usePwa'
import { useTheme } from './theme/useTheme'

// What the real service-worker helper would be given, so a test can play the browser's part.
const sw = vi.hoisted(() => ({
  options: null as null | { onNeedRefresh: () => void; onOfflineReady: () => void; onRegisteredSW: (url: string, reg: unknown) => void },
  update: vi.fn(),
}))
vi.mock('virtual:pwa-register', () => ({
  registerSW: (options: NonNullable<typeof sw.options>) => {
    sw.options = options
    return sw.update
  },
}))

afterEach(() => {
  delete document.documentElement.dataset.theme
  vi.restoreAllMocks()
})

describe('useTheme', () => {
  it('follows the system until a choice is made', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.pref).toBe('system')
  })

  it('applies and remembers a light or dark choice', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setPref('dark'))
    expect(result.current.pref).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
    act(() => result.current.setPref('light'))
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('goes back to following the system, forgetting the choice', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setPref('dark'))
    act(() => result.current.setPref('system'))
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(localStorage.getItem('theme')).toBeNull()
  })

  it('starts from the remembered choice', () => {
    localStorage.setItem('theme', 'dark')
    expect(renderHook(() => useTheme()).result.current.pref).toBe('dark')
  })

  it('ignores a remembered value it does not know', () => {
    localStorage.setItem('theme', 'purple')
    expect(renderHook(() => useTheme()).result.current.pref).toBe('system')
  })

  it('still applies the choice for this visit when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setPref('dark'))
    expect(result.current.pref).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})

describe('usePwa', () => {
  const install = (name: string) => {
    const event = Object.assign(new Event(name, { cancelable: true }), {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    })
    return event
  }

  it('starts with nothing to offer', () => {
    const { result } = renderHook(() => usePwa())
    expect(result.current).toMatchObject({ canInstall: false, updateReady: false, offlineReady: false, showIosHint: false })
  })

  it('knows when a new version is waiting, and applies it', () => {
    const { result } = renderHook(() => usePwa())
    act(() => sw.options!.onNeedRefresh())
    expect(result.current.updateReady).toBe(true)
    act(() => result.current.applyUpdate!())
    expect(sw.update).toHaveBeenCalledWith(true)
  })

  it('knows when the app is ready to work offline', () => {
    const { result } = renderHook(() => usePwa())
    act(() => sw.options!.onOfflineReady())
    expect(result.current.offlineReady).toBe(true)
  })

  it('offers to install when the browser says it can, and installs on request', async () => {
    const { result } = renderHook(() => usePwa())
    const event = install('beforeinstallprompt')
    act(() => void window.dispatchEvent(event))
    expect(event.defaultPrevented).toBe(true) // the app shows its own prompt instead of the browser's
    expect(result.current.canInstall).toBe(true)
    await act(async () => result.current.install())
    expect(event.prompt).toHaveBeenCalledOnce()
    expect(result.current.canInstall).toBe(false)
  })

  it('stops offering once installed', () => {
    const { result } = renderHook(() => usePwa())
    act(() => void window.dispatchEvent(install('beforeinstallprompt')))
    act(() => void window.dispatchEvent(new Event('appinstalled')))
    expect(result.current.canInstall).toBe(false)
  })

  it('does nothing if asked to install with no offer', async () => {
    const { result } = renderHook(() => usePwa())
    await expect(act(async () => result.current.install())).resolves.toBeUndefined()
  })

  it('shows the how-to for an iPhone, which has no install prompt', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    expect(renderHook(() => usePwa()).result.current.showIosHint).toBe(true)
  })

  it('does not show it once the app is already installed on the home screen', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    vi.spyOn(window, 'matchMedia').mockImplementation(((q: string) => ({ matches: q.includes('standalone'), media: q, addEventListener() {}, removeEventListener() {} })) as never)
    expect(renderHook(() => usePwa()).result.current.showIosHint).toBe(false)
  })

  it('checks for updates against the registration the browser reported', async () => {
    const { result } = renderHook(() => usePwa())
    const update = vi.fn().mockResolvedValue(undefined)
    act(() => sw.options!.onRegisteredSW('/sw.js', { update, waiting: null, installing: null }))
    const outcome = await act(async () => result.current.checkNow())
    expect(update).toHaveBeenCalled()
    expect(outcome).toBe('latest') // nothing new was found
  })
})
