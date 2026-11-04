import { describe, expect, it, vi } from 'vitest'
import { snapshotUrl } from './snapshot'
import { refreshWidgets, renderWidget, type WidgetDeps, type WidgetHost, type WidgetLike } from './worker'

const widget = (over: Partial<WidgetLike['definition']> = {}): WidgetLike => ({
  definition: { tag: 'spending', msAcTemplate: 'https://app.test/widgets/spending-template.json', data: 'https://app.test/widgets/spending-data.json', ...over },
})

function setup(snapshot: string | null = '{"spent":"₹9,000"}', installed: WidgetLike[] = [widget()]) {
  const updateByTag = vi.fn().mockResolvedValue(undefined)
  const host: WidgetHost = { matchAll: vi.fn().mockResolvedValue(installed), updateByTag }
  const files: Record<string, string> = {
    'https://app.test/widgets/spending-template.json': '{"type":"AdaptiveCard"}',
    'https://app.test/widgets/spending-data.json': '{"spent":"placeholder"}',
  }
  const fetchText = vi.fn(async (url: string) => files[url] ?? '')
  const deps: WidgetDeps = { widgets: host, fetchText, readSnapshot: vi.fn().mockResolvedValue(snapshot) }
  return { deps, host, updateByTag, fetchText }
}

describe('renderWidget', () => {
  it('draws the widget from its template and the figures the app left', async () => {
    const { deps, updateByTag } = setup()
    await renderWidget(widget(), deps)
    expect(updateByTag).toHaveBeenCalledExactlyOnceWith('spending', { template: '{"type":"AdaptiveCard"}', data: '{"spent":"₹9,000"}' })
  })

  it('draws the placeholder from the manifest before the app has left any figures', async () => {
    const { deps, updateByTag } = setup(null)
    await renderWidget(widget(), deps)
    expect(updateByTag).toHaveBeenCalledWith('spending', { template: '{"type":"AdaptiveCard"}', data: '{"spent":"placeholder"}' })
  })

  it('draws an empty set of figures when there is neither', async () => {
    const { deps, updateByTag } = setup(null)
    await renderWidget(widget({ data: undefined }), deps)
    expect(updateByTag).toHaveBeenCalledWith('spending', expect.objectContaining({ data: '{}' }))
  })

  it('does not fetch the placeholder when the app has left figures', async () => {
    const { deps, fetchText } = setup()
    await renderWidget(widget(), deps)
    expect(fetchText).toHaveBeenCalledExactlyOnceWith('https://app.test/widgets/spending-template.json')
  })

  it('does nothing in a browser with no widgets', async () => {
    const { deps, fetchText } = setup()
    await renderWidget(widget(), { ...deps, widgets: undefined })
    expect(fetchText).not.toHaveBeenCalled()
  })

  it('passes on a failure to draw, so the browser can see it did not finish', async () => {
    const { deps, updateByTag } = setup()
    updateByTag.mockRejectedValue(new Error('no widget host'))
    await expect(renderWidget(widget(), deps)).rejects.toThrow('no widget host')
  })
})

describe('refreshWidgets', () => {
  it('draws every widget that has been added, and says how many', async () => {
    const { deps, host, updateByTag } = setup('{"x":1}', [widget(), widget({ tag: 'other' })])
    expect(await refreshWidgets(deps)).toBe(2)
    expect(host.matchAll).toHaveBeenCalledWith({ installed: true })
    expect(updateByTag.mock.calls.map((c) => c[0])).toEqual(['spending', 'other'])
  })

  it('draws nothing when none has been added', async () => {
    const { deps, updateByTag } = setup('{}', [])
    expect(await refreshWidgets(deps)).toBe(0)
    expect(updateByTag).not.toHaveBeenCalled()
  })

  it('does nothing in a browser with no widgets', async () => {
    const { deps } = setup()
    expect(await refreshWidgets({ ...deps, widgets: undefined })).toBe(0)
  })
})

describe('where the figures are kept', () => {
  it('is the same address from the page and the worker, in the app’s own folder', () => {
    expect(snapshotUrl('/', 'https://app.test')).toBe('https://app.test/widget-snapshot.json')
    expect(snapshotUrl('/open_expense_adviser-/', 'https://ajaypv.github.io')).toBe('https://ajaypv.github.io/open_expense_adviser-/widget-snapshot.json')
    expect(snapshotUrl('//', 'https://app.test')).toBe('https://app.test/widget-snapshot.json')
  })
})
