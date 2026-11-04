/**
 * What the service worker does for the widget, written to be given what it needs, so it can be tested without a browser.
 * The page works out the widget's data and leaves it in the cache; the worker's part is only to hand Windows the template and
 * that data whenever the widget is added, comes back into view, or the app has just left something new.
 */

export interface WidgetLike {
  definition: { tag: string; msAcTemplate: string; data?: string }
}

export interface WidgetHost {
  matchAll(options?: { installed?: boolean; tag?: string }): Promise<WidgetLike[]>
  updateByTag(tag: string, payload: { template: string; data: string }): Promise<unknown>
}

export interface WidgetDeps {
  /** self.widgets: missing in a browser with no widgets. */
  widgets: WidgetHost | undefined
  fetchText(url: string): Promise<string>
  /** What the page last left for the widget, or null if it has not yet. */
  readSnapshot(): Promise<string | null>
}

/** Draws one widget: its template, with the latest data the page left, or the placeholder in the manifest before there is any. */
export async function renderWidget(widget: WidgetLike, deps: WidgetDeps): Promise<void> {
  if (!deps.widgets) return
  const template = await deps.fetchText(widget.definition.msAcTemplate)
  const data = (await deps.readSnapshot()) ?? (widget.definition.data ? await deps.fetchText(widget.definition.data) : '{}')
  await deps.widgets.updateByTag(widget.definition.tag, { template, data })
}

/** Draws every widget that has been added, and says how many there were. */
export async function refreshWidgets(deps: WidgetDeps): Promise<number> {
  if (!deps.widgets) return 0
  const installed = await deps.widgets.matchAll({ installed: true })
  for (const widget of installed) await renderWidget(widget, deps)
  return installed.length
}
