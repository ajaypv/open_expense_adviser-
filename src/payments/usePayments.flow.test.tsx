// @vitest-environment jsdom
import '../test/dom'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const phone = vi.hoisted(() => ({ native: true, pending: vi.fn() }))
vi.mock('../native/platform', () => ({ isNativeApp: () => phone.native }))
vi.mock('./native', () => ({ readPending: phone.pending }))

import type { PendingPayment } from './native'
import { PAYMENT_POLL_MS, usePayments } from './usePayments'

const at = new Date(2026, 10, 9, 14, 5).getTime()
const payment = (id: number, state: 'add' | 'edit', over: Partial<PendingPayment> = {}): PendingPayment => ({ id, state, amountMinor: 25000, merchant: 'Swiggy', income: false, package: 'com.phonepe.app', at, ...over })

const onAdd = vi.fn().mockResolvedValue(true)
const onOpen = vi.fn()
const mount = () => renderHook(() => usePayments(onAdd, onOpen))

beforeEach(() => {
  phone.native = true
  phone.pending.mockReset().mockResolvedValue([])
  onAdd.mockClear()
  onOpen.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('payments from the pop-ups', () => {
  it('adds a payment whose Add button was pressed, as the entry typing it would make', async () => {
    phone.pending.mockResolvedValueOnce([payment(1, 'add')])
    mount()
    await waitFor(() => expect(onAdd).toHaveBeenCalledOnce())
    expect(onAdd.mock.calls[0][0]).toEqual([expect.objectContaining({ kind: 'expense', amountMinor: 25000, merchant: 'Swiggy', date: '2026-11-09', paymentMethod: 'Online', note: 'via PhonePe' })])
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('adds several together, one call, in the order they came', async () => {
    phone.pending.mockResolvedValueOnce([payment(1, 'add', { merchant: 'Swiggy' }), payment(2, 'add', { merchant: 'Uber', income: false })])
    mount()
    await waitFor(() => expect(onAdd).toHaveBeenCalledOnce())
    expect(onAdd.mock.calls[0][0].map((e: { merchant: string }) => e.merchant)).toEqual(['Swiggy', 'Uber'])
  })

  it('opens the form for a pop-up that was touched, and adds nothing', async () => {
    const touched = payment(3, 'edit')
    phone.pending.mockResolvedValueOnce([touched])
    mount()
    await waitFor(() => expect(onOpen).toHaveBeenCalledExactlyOnceWith(touched))
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('opens the latest of several touched pop-ups, and adds the earlier ones as they were so none is lost', async () => {
    const first = payment(1, 'edit', { merchant: 'Swiggy' })
    const second = payment(2, 'edit', { merchant: 'Uber' })
    phone.pending.mockResolvedValueOnce([first, second])
    mount()
    await waitFor(() => expect(onOpen).toHaveBeenCalledExactlyOnceWith(second))
    expect(onAdd.mock.calls[0][0].map((e: { merchant: string }) => e.merchant)).toEqual(['Swiggy'])
  })

  it('does both when there is a payment to add and one to open', async () => {
    phone.pending.mockResolvedValueOnce([payment(1, 'add'), payment(2, 'edit', { merchant: 'Uber' })])
    mount()
    await waitFor(() => expect(onOpen).toHaveBeenCalledOnce())
    expect(onAdd).toHaveBeenCalledOnce()
  })

  it('leaves out an amount that cannot be added, and still adds the rest', async () => {
    phone.pending.mockResolvedValueOnce([payment(1, 'add', { amountMinor: 0 }), payment(2, 'add', { merchant: 'Uber' })])
    mount()
    await waitFor(() => expect(onAdd).toHaveBeenCalledOnce())
    expect(onAdd.mock.calls[0][0]).toHaveLength(1)
  })

  it('does nothing when there is nothing waiting', async () => {
    mount()
    await waitFor(() => expect(phone.pending).toHaveBeenCalled())
    expect(onAdd).not.toHaveBeenCalled()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('looks again when the app comes back to the front', async () => {
    mount()
    await waitFor(() => expect(phone.pending).toHaveBeenCalledTimes(1))
    phone.pending.mockResolvedValueOnce([payment(1, 'add')])
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    await waitFor(() => expect(onAdd).toHaveBeenCalledOnce())
  })

  it('looks every few seconds while the app is on screen, so a pop-up answered over the app shows up at once', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    mount()
    await vi.waitFor(() => expect(phone.pending).toHaveBeenCalledTimes(1))
    phone.pending.mockResolvedValueOnce([payment(1, 'add')])
    await act(async () => void vi.advanceTimersByTime(PAYMENT_POLL_MS))
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalledOnce())
  })

  it('does not look while the app is out of sight', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    mount()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(phone.pending).not.toHaveBeenCalled()
  })

  it('stops looking when it goes away', async () => {
    const view = mount()
    await waitFor(() => expect(phone.pending).toHaveBeenCalledTimes(1))
    view.unmount()
    phone.pending.mockResolvedValue([payment(1, 'add')])
    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('does nothing in a browser, where there is no phone to ask', async () => {
    phone.native = false
    mount()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(phone.pending).not.toHaveBeenCalled()
  })
})
