import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeLedger } from '../test/ledger'
import { Activity } from '../screens/Activity'
import { Home } from '../screens/Home'
import { Insights } from '../screens/Insights'
import { ScreenSkeleton } from './ScreenSkeleton'

const today = new Date(2026, 9, 28)
const loading = makeLedger({ loading: true })
const noop = () => {}

describe('ScreenSkeleton', () => {
  it('says it is loading, names the screen, and is not read out as content', () => {
    const html = renderToStaticMarkup(createElement(ScreenSkeleton, { label: 'Home' }))
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toMatch(/<h1 class="sr-only">Home<\/h1>/)
    expect(html).toContain('Loading')
    expect(html).toContain('aria-hidden="true"')
  })

  it('stops pulsing when the person asked for less motion', () => {
    expect(renderToStaticMarkup(createElement(ScreenSkeleton, { label: 'Home' }))).toContain('motion-reduce:animate-none')
  })
})

describe('screens while the data is still arriving', () => {
  it('Home shows the skeleton, not a blank page', () => {
    const html = renderToStaticMarkup(
      createElement(Home, {
        ledger: loading, month: '2026-10', onMonth: noop, today, onPickCategory: noop, onEdit: noop, onExample: noop, onOpenSettings: noop, onSeeAll: noop,
        balanceShown: false, onToggleBalance: noop, suggestions: [], onSuggestion: noop, logNudge: false, onAdd: noop, onOpenGoals: noop,
      }),
    )
    expect(html).toContain('aria-busy="true"')
    expect(html).toMatch(/<h1 class="sr-only">Home<\/h1>/)
  })

  it('Activity shows the skeleton instead of claiming there is nothing yet', () => {
    const html = renderToStaticMarkup(createElement(Activity, { ledger: loading, today, categoryFilter: null, onCategoryFilter: noop, onEdit: noop }))
    expect(html).toContain('aria-busy="true"')
    expect(html).not.toContain('Nothing here yet')
  })

  it('Insights shows the skeleton instead of claiming there is nothing to report', () => {
    const html = renderToStaticMarkup(createElement(Insights, { ledger: loading, month: '2026-10', onMonth: noop, today, onOpenSettings: noop }))
    expect(html).toContain('aria-busy="true"')
    expect(html).not.toContain('Nothing to report')
  })
})
