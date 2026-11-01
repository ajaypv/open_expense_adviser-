// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getPlace = vi.fn()
const isRecordingLocation = vi.fn()
const permissionState = vi.fn()
vi.mock('./location', () => ({
  getPlace: (...args: unknown[]) => getPlace(...args),
  isRecordingLocation: () => isRecordingLocation(),
  permissionState: () => permissionState(),
}))

import { useNearby } from './useNearby'

const fix = { ok: true, place: { lat: 12.9716, lon: 77.5946, accuracyM: 10 } }

beforeEach(() => {
  getPlace.mockReset()
  getPlace.mockResolvedValue(fix)
  isRecordingLocation.mockReset()
  isRecordingLocation.mockResolvedValue(true)
  permissionState.mockReset()
  permissionState.mockResolvedValue('granted')
})

const comeToFront = () => act(() => void document.dispatchEvent(new Event('visibilitychange')))

describe('useNearby: only looks for you while you are entering something', () => {
  it('does not ask for a position when the app starts, or while the add form is shut', async () => {
    const { result } = renderHook(() => useNearby(false))
    await act(async () => {})
    expect(getPlace).not.toHaveBeenCalled()
    expect(result.current).toBeNull()
  })

  it('does not ask again when the app comes back to the front', async () => {
    renderHook(() => useNearby(false))
    comeToFront()
    comeToFront()
    await act(async () => {})
    expect(getPlace).not.toHaveBeenCalled()
  })

  it('asks for a fresh position when the add form opens, and uses it', async () => {
    const { result, rerender } = renderHook(({ open }) => useNearby(open), { initialProps: { open: false } })
    rerender({ open: true })
    await waitFor(() => expect(result.current).toEqual({ lat: 12.9716, lon: 77.5946 }))
    expect(getPlace).toHaveBeenCalledTimes(1)
    // No age is given, so the device is asked for a current fix, not one it kept.
    expect(getPlace.mock.calls[0][1]).toBeUndefined()
  })

  it('asks once per opening, not again when the app comes to the front with the form open', async () => {
    const { rerender } = renderHook(({ open }) => useNearby(open), { initialProps: { open: true } })
    await waitFor(() => expect(getPlace).toHaveBeenCalledTimes(1))
    comeToFront()
    await act(async () => {})
    expect(getPlace).toHaveBeenCalledTimes(1)
    rerender({ open: true })
    expect(getPlace).toHaveBeenCalledTimes(1)
  })

  it('lets go of the position as soon as the form shuts, so a stale one is never shown next time', async () => {
    const { result, rerender } = renderHook(({ open }) => useNearby(open), { initialProps: { open: true } })
    await waitFor(() => expect(result.current).not.toBeNull())
    rerender({ open: false })
    await waitFor(() => expect(result.current).toBeNull())
    expect(getPlace).toHaveBeenCalledTimes(1) // shutting the form is not a reason to look again
  })

  it('asks again, afresh, the next time the form opens', async () => {
    getPlace.mockResolvedValueOnce(fix).mockResolvedValueOnce({ ok: true, place: { lat: 13.1, lon: 77.7, accuracyM: 8 } })
    const { result, rerender } = renderHook(({ open }) => useNearby(open), { initialProps: { open: true } })
    await waitFor(() => expect(result.current).toEqual({ lat: 12.9716, lon: 77.5946 }))
    rerender({ open: false })
    rerender({ open: true })
    await waitFor(() => expect(result.current).toEqual({ lat: 13.1, lon: 77.7 }))
    expect(getPlace).toHaveBeenCalledTimes(2)
  })

  it('never asks when location is off, or the browser has not already allowed it', async () => {
    isRecordingLocation.mockResolvedValue(false)
    const off = renderHook(() => useNearby(true))
    await act(async () => {})
    expect(getPlace).not.toHaveBeenCalled()
    off.unmount()

    isRecordingLocation.mockResolvedValue(true)
    permissionState.mockResolvedValue('prompt')
    renderHook(() => useNearby(true))
    await act(async () => {})
    expect(getPlace).not.toHaveBeenCalled()
  })

  it('is nothing when the position cannot be found', async () => {
    getPlace.mockResolvedValue({ ok: false, reason: 'timeout' })
    const { result } = renderHook(() => useNearby(true))
    await waitFor(() => expect(getPlace).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })
})
