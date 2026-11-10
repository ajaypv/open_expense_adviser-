// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category, Transaction } from '../db/schema'
import { makeLedger } from '../test/ledger'

vi.mock('./publish', () => ({ publishWidgetData: vi.fn().mockResolvedValue(true), publishTimelineData: vi.fn().mockResolvedValue(true) }))

import { publishTimelineData, publishWidgetData } from './publish'
import { timelineWidgetFor, updateWidgetNow, useWidgetSnapshot, WIDGET_DELAY_MS, widgetDataFor } from './useWidgetSnapshot'

const EDGE_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'
const PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'

const categories: Category[] = [{ id: 1, name: 'Food', color: 'var(--s1)' }]
const tx = (id: number, date: string, rupees: number): Transaction => ({
  id, kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId: 1, merchant: 'Cafe', note: '', date, paymentMethod: '', source: 'manual', createdAt: id,
})
const month = new Date().toISOString().slice(0, 7)

function ledgerWith(expenses: Transaction[], over: Record<string, unknown> = {}) {
  return makeLedger({ txs: expenses, expenses, income: [], categories, expenseCategories: categories, categoryById: new Map(categories.map((c) => [c.id, c])), loading: false, ...over })
}

const publish = vi.mocked(publishWidgetData)
const publishTimeline = vi.mocked(publishTimelineData)

beforeEach(() => {
  vi.useFakeTimers()
  publish.mockClear()
  publishTimeline.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const edge = () => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(EDGE_WINDOWS)

describe('widgetDataFor', () => {
  it('works out the month in progress from the ledger', () => {
    const data = widgetDataFor(ledgerWith([tx(1, `${month}-01`, 450)]), new Date())
    expect(data.spent).toBe('₹450')
    expect(data.title).toMatch(/so far$/)
  })
})

describe('timelineWidgetFor', () => {
  it('works out the last days from the ledger, in the amounts the app shows', () => {
    const today = new Date()
    const data = timelineWidgetFor(ledgerWith([tx(1, new Date(today.getFullYear(), today.getMonth(), today.getDate()).toLocaleDateString('en-CA'), 450)]), today)
    expect(data.rows[0].amount).toBe('₹450')
    expect(data.rows[0].text).toMatch(/^Today/)
  })
})

describe('updateWidgetNow', () => {
  it('leaves both widgets their figures, and says whether the Spending one got them', async () => {
    vi.useRealTimers()
    expect(await updateWidgetNow(ledgerWith([tx(1, `${month}-01`, 450)]))).toBe(true)
    expect(publish).toHaveBeenCalledOnce()
    expect(publishTimeline).toHaveBeenCalledOnce()
    publish.mockResolvedValueOnce(false)
    expect(await updateWidgetNow(ledgerWith([tx(1, `${month}-01`, 450)]))).toBe(false)
  })
})

describe('useWidgetSnapshot', () => {
  it('leaves the figures for the widget a moment after the ledger loads, where a widget can exist', () => {
    edge()
    renderHook(() => useWidgetSnapshot(ledgerWith([tx(1, `${month}-01`, 450)])))
    expect(publish).not.toHaveBeenCalled()
    vi.advanceTimersByTime(WIDGET_DELAY_MS)
    expect(publish).toHaveBeenCalledOnce()
    expect(publish.mock.calls[0][0]).toMatchObject({ spent: '₹450' })
    expect(publishTimeline).toHaveBeenCalledOnce()
  })

  it('does nothing on a phone, where there is no widget to keep up to date', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(PHONE)
    renderHook(() => useWidgetSnapshot(ledgerWith([tx(1, `${month}-01`, 450)])))
    vi.advanceTimersByTime(WIDGET_DELAY_MS * 3)
    expect(publish).not.toHaveBeenCalled()
  })

  it('waits for the ledger to load rather than leaving figures for an empty one', () => {
    edge()
    renderHook(() => useWidgetSnapshot(ledgerWith([], { loading: true })))
    vi.advanceTimersByTime(WIDGET_DELAY_MS * 3)
    expect(publish).not.toHaveBeenCalled()
  })

  it('works out a burst of changes once, not each time', () => {
    edge()
    const { rerender } = renderHook(({ n }) => useWidgetSnapshot(ledgerWith([tx(1, `${month}-01`, n)])), { initialProps: { n: 100 } })
    vi.advanceTimersByTime(WIDGET_DELAY_MS / 2)
    rerender({ n: 200 })
    vi.advanceTimersByTime(WIDGET_DELAY_MS / 2)
    rerender({ n: 300 })
    vi.advanceTimersByTime(WIDGET_DELAY_MS)
    expect(publish).toHaveBeenCalledOnce()
    expect(publish.mock.calls[0][0]).toMatchObject({ spent: '₹300' })
  })

  it('does not leave figures after it has been taken away', () => {
    edge()
    const { unmount } = renderHook(() => useWidgetSnapshot(ledgerWith([tx(1, `${month}-01`, 450)])))
    unmount()
    vi.advanceTimersByTime(WIDGET_DELAY_MS * 2)
    expect(publish).not.toHaveBeenCalled()
  })
})
