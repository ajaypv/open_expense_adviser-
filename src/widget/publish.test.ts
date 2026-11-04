import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WidgetData } from './data'
import { publishWidgetData } from './publish'

const data: WidgetData = { title: 'October so far', spent: '₹9,000', spentLabel: 'Spent so far', headline: 'Heading for about ₹13,754', detail: '', perDay: '', next: '', tone: 'Good', updated: 'Updated 20 Oct, 6:30 pm' }

function stub(over: { caches?: unknown; ready?: Promise<unknown> | undefined } = {}) {
  const put = vi.fn().mockResolvedValue(undefined)
  const postMessage = vi.fn()
  const open = vi.fn().mockResolvedValue({ put })
  vi.stubGlobal('caches', 'caches' in over ? over.caches : { open })
  vi.stubGlobal('location', { origin: 'https://app.test' })
  vi.stubGlobal('navigator', { serviceWorker: 'ready' in over ? { ready: over.ready } : { ready: Promise.resolve({ active: { postMessage } }) } })
  return { put, postMessage, open }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('publishWidgetData', () => {
  it('leaves the figures in the widget cache, under the app’s own address', async () => {
    const { put, open } = stub()
    expect(await publishWidgetData(data)).toBe(true)
    expect(open).toHaveBeenCalledWith('widget-data')
    expect(put.mock.calls[0][0]).toBe('https://app.test/widget-snapshot.json')
  })

  it('leaves them as JSON that reads back as the same figures', async () => {
    const { put } = stub()
    await publishWidgetData(data)
    const response = put.mock.calls[0][1] as Response
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(await response.json()).toEqual(data)
  })

  it('tells the worker to redraw', async () => {
    const { postMessage } = stub()
    await publishWidgetData(data)
    expect(postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'WIDGET_REFRESH' })
  })

  it('still leaves them when there is no worker to tell', async () => {
    const { put } = stub({ ready: Promise.resolve({ active: null }) })
    expect(await publishWidgetData(data)).toBe(true)
    expect(put).toHaveBeenCalled()
  })

  it('does nothing, and says so, where there is no cache', async () => {
    stub({ caches: undefined })
    expect(await publishWidgetData(data)).toBe(false)
  })

  it('says so, rather than failing, when the cache cannot be written', async () => {
    const { put } = stub()
    put.mockRejectedValue(new Error('quota'))
    expect(await publishWidgetData(data)).toBe(false)
  })
})
