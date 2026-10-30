import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PickerField, type PickerOption } from './PickerField'
import { TimeField } from './TimeField'

const noop = () => {}
const few: PickerOption<string>[] = [
  { value: 'USD', label: 'USD', detail: 'US Dollar' },
  { value: 'EUR', label: 'EUR', detail: 'Euro' },
]
const many: PickerOption<string>[] = Array.from({ length: 12 }, (_, i) => ({ value: `C${i}`, label: `C${i}` }))

const picker = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(PickerField as never, { id: 'cur', title: 'Choose a currency', value: 'EUR', options: few, onChange: noop, className: 'x', ...props }))

describe('PickerField', () => {
  it('is a button that shows the choice and says it opens a list', () => {
    const html = picker()
    expect(html).toMatch(/<button[^>]*id="cur"[^>]*aria-haspopup="dialog"/)
    expect(html).toContain('>EUR<')
  })

  it('shows a placeholder when nothing is chosen yet', () => {
    expect(picker({ value: null, placeholder: 'Choose…' })).toContain('Choose…')
  })

  it('lists the options as a group of radios, with the chosen one marked and its detail shown', () => {
    const html = picker()
    expect(html).toContain('Choose a currency')
    expect(html).toContain('role="radiogroup"')
    expect(html).toMatch(/role="radio"[^>]*aria-checked="true"[^>]*>[^]*?EUR/)
    expect(html).toMatch(/aria-checked="false"[^>]*>[^]*?USD/)
    expect(html).toContain('US Dollar')
    expect((html.match(/aria-checked="true"/g) ?? []).length).toBe(1)
  })

  it('adds a search box when there are many options, and not for a few', () => {
    expect(picker({ options: many, value: 'C1' })).toContain('type="search"')
    expect(picker()).not.toContain('type="search"')
  })

  it('can be switched off', () => {
    expect(picker({ disabled: true })).toMatch(/<button[^>]*disabled=""/)
  })
})

describe('TimeField', () => {
  const time = (props: Record<string, unknown> = {}) =>
    renderToStaticMarkup(createElement(TimeField, { id: 'remind', title: 'Remind me at', value: '21:00', onChange: noop, hour12: true, ...props }))

  it('shows the time on a button that opens the picker', () => {
    const html = time()
    expect(html).toMatch(/<button[^>]*id="remind"[^>]*aria-haspopup="dialog"/)
    expect(html).toContain('9:00 PM')
  })

  it('offers hours 1 to 12, minutes in fives and AM or PM on a 12-hour clock', () => {
    const html = time()
    for (const h of ['1', '9', '12']) expect(html).toContain(`aria-label="${h} o’clock"`)
    expect(html).not.toContain('aria-label="13 o’clock"')
    expect(html).toContain('aria-label="45 minutes"')
    expect(html).toContain('>AM<')
    expect(html).toContain('>PM<')
  })

  it('marks the chosen hour, minute and half of the day', () => {
    const html = time()
    expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="9 o’clock"/)
    expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="0 minutes"/)
    expect(html).toMatch(/aria-checked="true"[^>]*>PM</)
  })

  it('uses 0 to 23 and no AM or PM on a 24-hour clock', () => {
    const html = time({ hour12: false })
    expect(html).toContain('21:00')
    expect(html).toContain('aria-label="23 o’clock"')
    expect(html).toContain('aria-label="0 o’clock"')
    expect(html).not.toContain('>AM<')
  })

  it('has a button to set the time', () => {
    expect(time()).toContain('Set time')
  })
})
