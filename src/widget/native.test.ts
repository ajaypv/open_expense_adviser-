import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WidgetData } from './data'

const bridge = vi.hoisted(() => ({ platform: 'web', setSnapshot: vi.fn(), setTimeline: vi.fn(), takeLaunchView: vi.fn() }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => bridge.platform },
  registerPlugin: () => ({ setSnapshot: bridge.setSnapshot, setTimeline: bridge.setTimeline, takeLaunchView: bridge.takeLaunchView }),
}))

import { isAndroidApp, publishTimelineToAndroid, publishToAndroid, takeLaunchView } from './native'
import { publishTimelineData, publishWidgetData } from './publish'
import type { TimelineWidgetData } from './timelineData'
import { widgetsSupported } from './support'

const data: WidgetData = { title: 'October so far', spent: '₹9,000', spentLabel: 'Spent so far', headline: 'Heading for about ₹13,754', detail: '₹1,246 inside your budget', perDay: 'About ₹400 a day keeps you inside it', next: 'Next: Rent ₹6,000, in 5 days', tone: 'Good', updated: 'Updated 20 Oct, 6:30 pm' }
const PHONE_BROWSER = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'

beforeEach(() => {
  bridge.platform = 'web'
  bridge.setSnapshot.mockReset().mockResolvedValue(undefined)
  bridge.setTimeline.mockReset().mockResolvedValue(undefined)
  bridge.takeLaunchView.mockReset().mockResolvedValue({ view: '' })
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

const timeline: TimelineWidgetData = {
  title: 'Last 2 days · ₹680',
  rows: [
    { chip: '10', text: 'Today · 2 expenses', amount: '₹680', share: 1, color: '#d9452e' },
    { chip: '9', text: 'Yesterday · Nothing spent', amount: '₹0', share: 0, color: '#139aa6' },
  ],
  updated: 'Updated 10 Nov, 3:40 PM',
}

describe('the Timeline widget in the Android app', () => {
  it('hands the app’s widget its days as JSON text that reads back the same', async () => {
    bridge.platform = 'android'
    expect(await publishTimelineToAndroid(timeline)).toBe(true)
    const sent = bridge.setTimeline.mock.calls[0][0] as { json: string }
    expect(JSON.parse(sent.json)).toEqual(timeline)
  })

  it('says so, rather than failing, when the widget cannot be reached', async () => {
    bridge.platform = 'android'
    bridge.setTimeline.mockRejectedValue(new Error('no'))
    expect(await publishTimelineToAndroid(timeline)).toBe(false)
  })

  it('does nothing outside the Android app', async () => {
    expect(await publishTimelineToAndroid(timeline)).toBe(false)
    expect(await publishTimelineData(timeline)).toBe(false)
    expect(bridge.setTimeline).not.toHaveBeenCalled()
  })

  it('is where publishing the timeline goes inside the app', async () => {
    bridge.platform = 'android'
    expect(await publishTimelineData(timeline)).toBe(true)
    expect(bridge.setTimeline).toHaveBeenCalledOnce()
  })
})

describe('the page a widget opens the app on', () => {
  it('is the timeline when the app was opened from the Timeline widget', async () => {
    bridge.platform = 'android'
    bridge.takeLaunchView.mockResolvedValue({ view: 'timeline' })
    expect(await takeLaunchView()).toBe('timeline')
  })

  it('is nothing when the app was opened another way, or for a page it does not know', async () => {
    bridge.platform = 'android'
    expect(await takeLaunchView()).toBeNull()
    bridge.takeLaunchView.mockResolvedValue({ view: 'elsewhere' })
    expect(await takeLaunchView()).toBeNull()
  })

  it('is nothing when the phone cannot be asked', async () => {
    bridge.platform = 'android'
    bridge.takeLaunchView.mockRejectedValue(new Error('no'))
    expect(await takeLaunchView()).toBeNull()
  })

  it('is nothing, and asks nobody, outside the Android app', async () => {
    expect(await takeLaunchView()).toBeNull()
    expect(bridge.takeLaunchView).not.toHaveBeenCalled()
  })
})
