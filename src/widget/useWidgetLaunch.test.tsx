// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const phone = vi.hoisted(() => ({ android: true, view: vi.fn() }))
vi.mock('./native', () => ({ isAndroidApp: () => phone.android, takeLaunchView: phone.view }))

import { useWidgetLaunch } from './useWidgetLaunch'

const onTimeline = vi.fn()

beforeEach(() => {
  phone.android = true
  phone.view.mockReset().mockResolvedValue(null)
  onTimeline.mockClear()
})

afterEach(cleanup)

describe('useWidgetLaunch', () => {
  it('opens the timeline when the app was started from the Timeline widget', async () => {
    phone.view.mockResolvedValueOnce('timeline')
    renderHook(() => useWidgetLaunch(onTimeline))
    await waitFor(() => expect(onTimeline).toHaveBeenCalledOnce())
  })

  it('does nothing when the app was opened some other way', async () => {
    renderHook(() => useWidgetLaunch(onTimeline))
    await waitFor(() => expect(phone.view).toHaveBeenCalled())
    expect(onTimeline).not.toHaveBeenCalled()
  })

  it('looks again when a running app is brought to the front by the widget', async () => {
    renderHook(() => useWidgetLaunch(onTimeline))
    await waitFor(() => expect(phone.view).toHaveBeenCalledTimes(1))
    phone.view.mockResolvedValueOnce('timeline')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    await waitFor(() => expect(onTimeline).toHaveBeenCalledOnce())
  })

  it('does not look while the app is out of sight', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    renderHook(() => useWidgetLaunch(onTimeline))
    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(phone.view).not.toHaveBeenCalled()
    visibility.mockRestore()
  })

  it('uses the latest handler, not the one it began with', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const view = renderHook(({ fn }) => useWidgetLaunch(fn), { initialProps: { fn: first } })
    await waitFor(() => expect(phone.view).toHaveBeenCalledTimes(1))
    view.rerender({ fn: second })
    phone.view.mockResolvedValueOnce('timeline')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    await waitFor(() => expect(second).toHaveBeenCalledOnce())
    expect(first).not.toHaveBeenCalled()
  })

  it('stops looking when it goes away', async () => {
    const view = renderHook(() => useWidgetLaunch(onTimeline))
    await waitFor(() => expect(phone.view).toHaveBeenCalledTimes(1))
    view.unmount()
    phone.view.mockResolvedValue('timeline')
    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(onTimeline).not.toHaveBeenCalled()
  })

  it('does nothing outside the Android app', async () => {
    phone.android = false
    renderHook(() => useWidgetLaunch(onTimeline))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(phone.view).not.toHaveBeenCalled()
  })
})
