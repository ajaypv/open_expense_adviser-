import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WidgetData } from './data'

const bridge = vi.hoisted(() => ({ platform: 'web', setSnapshot: vi.fn() }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => bridge.platform },
  registerPlugin: () => ({ setSnapshot: bridge.setSnapshot }),
}))

import { isAndroidApp, publishToAndroid } from './native'
import { publishWidgetData } from './publish'
import { widgetsSupported } from './support'

const data: WidgetData = { title: 'October so far', spent: '₹9,000', spentLabel: 'Spent so far', headline: 'Heading for about ₹13,754', detail: '₹1,246 inside your budget', perDay: 'About ₹400 a day keeps you inside it', next: 'Next: Rent ₹6,000, in 5 days', tone: 'Good', updated: 'Updated 20 Oct, 6:30 pm' }
const PHONE_BROWSER = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'

beforeEach(() => {
  bridge.platform = 'web'
  bridge.setSnapshot.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the widget in the Android app', () => {
  it('is only there inside the Android app, not in a phone browser or on iOS', () => {
    expect(isAndroidApp()).toBe(false)
    bridge.platform = 'ios'
    expect(isAndroidApp()).toBe(false)
    bridge.platform = 'android'
    expect(isAndroidApp()).toBe(true)
  })

  it('counts as a place a widget can be, whatever the browser says it is', () => {
    expect(widgetsSupported(PHONE_BROWSER)).toBe(false)
    bridge.platform = 'android'
    expect(widgetsSupported(PHONE_BROWSER)).toBe(true)
    expect(widgetsSupported('')).toBe(true)
  })

  it('hands the figures to the app’s widget, exactly as worked out', async () => {
    bridge.platform = 'android'
    expect(await publishToAndroid(data)).toBe(true)
    expect(bridge.setSnapshot).toHaveBeenCalledExactlyOnceWith(data)
  })

  it('says so, rather than failing, when the widget cannot be reached', async () => {
    bridge.platform = 'android'
    bridge.setSnapshot.mockRejectedValue(new Error('not implemented'))
    expect(await publishToAndroid(data)).toBe(false)
  })

  it('does nothing outside the Android app', async () => {
    expect(await publishToAndroid(data)).toBe(false)
    expect(bridge.setSnapshot).not.toHaveBeenCalled()
  })

  it('is where publishing goes inside the app, and leaves the browser’s cache and worker alone', async () => {
    bridge.platform = 'android'
    const open = vi.fn()
    vi.stubGlobal('caches', { open })
    expect(await publishWidgetData(data)).toBe(true)
    expect(bridge.setSnapshot).toHaveBeenCalledExactlyOnceWith(data)
    expect(open).not.toHaveBeenCalled()
  })

  it('says publishing failed when the widget could not be reached', async () => {
    bridge.platform = 'android'
    bridge.setSnapshot.mockRejectedValue(new Error('no'))
    expect(await publishWidgetData(data)).toBe(false)
  })
})
