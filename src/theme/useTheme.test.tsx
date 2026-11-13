// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PALETTES, type PaletteId } from './palettes'
import { useTheme } from './useTheme'

const root = document.documentElement

function addMetas() {
  for (const scheme of ['light', 'dark']) {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.setAttribute('media', `(prefers-color-scheme: ${scheme})`)
    meta.content = '#000000'
    document.head.append(meta)
  }
}
const metaColor = (scheme: 'light' | 'dark') => document.querySelector(`meta[name="theme-color"][media="(prefers-color-scheme: ${scheme})"]`)?.getAttribute('content')

beforeEach(() => {
  localStorage.clear()
  delete root.dataset.palette
  delete root.dataset.theme
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove())
})
afterEach(() => vi.restoreAllMocks())

describe('useTheme: the colour theme', () => {
  it('starts on the classic colours, in the light theme', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.palette).toBe('classic')
    expect(result.current.pref).toBe('light')
  })

  it('starts on the colours that were saved', () => {
    localStorage.setItem('palette', 'forest')
    expect(renderHook(() => useTheme()).result.current.palette).toBe('forest')
  })

  it('ignores a saved value it does not know', () => {
    localStorage.setItem('palette', 'chartreuse')
    expect(renderHook(() => useTheme()).result.current.palette).toBe('classic')
  })

  it.each(PALETTES.filter((p) => p.id !== 'classic').map((p) => p.id))('puts %s on the page and remembers it', (id) => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setPalette(id))
    expect(result.current.palette).toBe(id)
    expect(root.dataset.palette).toBe(id)
    expect(localStorage.getItem('palette')).toBe(id)
  })

  it('takes the attribute and the saved value away for the classic colours, which are what the page has with none', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setPalette('ocean'))
    act(() => result.current.setPalette('classic'))
    expect(root.dataset.palette).toBeUndefined()
    expect(localStorage.getItem('palette')).toBeNull()
    expect(result.current.palette).toBe('classic')
  })

  it('does not accept a theme it does not have', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setPalette('chartreuse' as PaletteId))
    expect(result.current.palette).toBe('classic')
    expect(root.dataset.palette).toBeUndefined()
  })

  it('still applies a choice for the session when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setPalette('rose'))
    expect(root.dataset.palette).toBe('rose')
    expect(result.current.palette).toBe('rose')
  })

  it('starts on the classic colours when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(renderHook(() => useTheme()).result.current.palette).toBe('classic')
  })

  it('keeps light or dark and the colour theme independent', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setPref('dark'))
    act(() => result.current.setPalette('lavender'))
    expect(root.dataset.theme).toBe('dark')
    expect(root.dataset.palette).toBe('lavender')
    act(() => result.current.setPref('system'))
    expect(root.dataset.theme).toBeUndefined()
    expect(root.dataset.palette).toBe('lavender')
  })
})

describe('useTheme: the browser bars', () => {
  it('takes the light page colour for both, since the page is light whatever the phone is set to', () => {
    addMetas()
    const { result } = renderHook(() => useTheme())
    expect(metaColor('light')).toBe('#f2f1ed')
    expect(metaColor('dark')).toBe('#f2f1ed')
    act(() => result.current.setPalette('ocean'))
    expect(metaColor('light')).toBe('#eaf3f9')
    expect(metaColor('dark')).toBe('#eaf3f9')
  })

  it('takes the dark page colour for both when dark is chosen', () => {
    addMetas()
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setPref('dark'))
    expect(metaColor('light')).toBe('#121314')
    expect(metaColor('dark')).toBe('#121314')
  })

  it('takes each scheme its own colour when the system decides', () => {
    addMetas()
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setPref('system'))
    expect(metaColor('light')).toBe('#f2f1ed')
    expect(metaColor('dark')).toBe('#121314')
    act(() => result.current.setPalette('ocean'))
    expect(metaColor('light')).toBe('#eaf3f9')
    expect(metaColor('dark')).toBe('#0a1620')
  })

  it('takes the one dark page colour of a dark-only theme for both, since it has no light', () => {
    addMetas()
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setPalette('aurora'))
    expect(metaColor('light')).toBe('#070b16')
    expect(metaColor('dark')).toBe('#070b16')
  })

  it('does not mind there being no such tags', () => {
    expect(() => renderHook(() => useTheme())).not.toThrow()
  })
})
