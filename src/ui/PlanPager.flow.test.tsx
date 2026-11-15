// @vitest-environment jsdom
import '../test/dom'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlanPager } from './PlanPager'

afterEach(cleanup)

/** A touch (or mouse) pointer event with the fields the pager reads. */
function pointer(type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', x: number, y: number, pointerType = 'touch') {
  const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })
  Object.defineProperty(e, 'pointerType', { value: pointerType })
  Object.defineProperty(e, 'pointerId', { value: 1 })
  return e
}
function drag(target: Element, dx: number, dy = 0) {
  fireEvent(target, pointer('pointerdown', 0, 0))
  for (const f of [0.25, 0.5, 0.75, 1]) fireEvent(target, pointer('pointermove', dx * f, dy * f))
  fireEvent(target, pointer('pointerup', dx, dy))
}

const onPress = vi.fn()
function setup() {
  onPress.mockClear()
  render(
    <PlanPager
      overview={
        <div>
          <p data-testid="overview">Overview content</p>
          <button type="button" onClick={onPress}>
            A button
          </button>
          <div className="touch-pan-y" data-testid="chart">
            chart
          </div>
        </div>
      }
      calendar={<p data-testid="calendar">Calendar content</p>}
    />,
  )
}

const tab = (name: string) => screen.getByRole('button', { name })
const panel = (id: 'overview' | 'calendar') => document.querySelector(`[data-page="plan-${id}"]`) as HTMLElement
const track = () => document.querySelector('.pager-track') as HTMLElement
const pill = () => document.querySelector('.pager-pill') as HTMLElement
const at = (index: number, px = 0) => `translate3d(calc(${-index * 100}% + ${px - index * 3}px), 0, 0)`

describe('PlanPager', () => {
  it('opens on the overview, with the calendar beside it on the right, and two tabs in that order', () => {
    setup()
    expect(screen.getAllByRole('button', { name: /^(Overview|Calendar)$/ }).map((b) => b.textContent)).toEqual(['Overview', 'Calendar'])
    expect(tab('Overview')).toHaveAttribute('aria-pressed', 'true')
    expect(tab('Calendar')).toHaveAttribute('aria-pressed', 'false')
    expect([...document.querySelectorAll('[data-page]')].map((p) => (p as HTMLElement).dataset.page)).toEqual(['plan-overview', 'plan-calendar'])
    expect(track().style.transform).toBe(at(0))
    expect(panel('calendar')).toHaveAttribute('data-rest', 'true')
    expect(panel('overview')).toHaveAttribute('data-rest', 'false')
  })

  it('moves to the calendar when its tab is pressed, and back, the marker with it', () => {
    setup()
    fireEvent.click(tab('Calendar'))
    expect(tab('Calendar')).toHaveAttribute('aria-pressed', 'true')
    expect(track().style.transform).toBe(at(1))
    expect(pill().style.transform).toBe('translate3d(100%, 0, 0)')
    fireEvent.click(tab('Overview'))
    expect(track().style.transform).toBe(at(0))
    expect(pill().style.transform).toBe('translate3d(0%, 0, 0)')
  })

  it('swiping to the left brings the calendar in, and swiping to the right brings the overview back', () => {
    setup()
    drag(screen.getByTestId('overview'), -160)
    expect(tab('Calendar')).toHaveAttribute('aria-pressed', 'true')
    expect(track().style.transform).toBe(at(1))
    drag(screen.getByTestId('calendar'), 160)
    expect(tab('Overview')).toHaveAttribute('aria-pressed', 'true')
    expect(track().style.transform).toBe(at(0))
  })

  it('stays put for a short movement, or a swipe the wrong way past either end', () => {
    setup()
    drag(screen.getByTestId('overview'), -20)
    drag(screen.getByTestId('overview'), 160)
    expect(tab('Overview')).toHaveAttribute('aria-pressed', 'true')
    expect(track().style.transform).toBe(at(0))
  })

  it('gives only a little past either end, and the finger is followed the whole way between them', () => {
    setup()
    const o = screen.getByTestId('overview')
    fireEvent(o, pointer('pointerdown', 0, 0))
    fireEvent(o, pointer('pointermove', 40, 0))
    fireEvent(o, pointer('pointermove', 120, 0))
    expect(track().style.transform).toBe(at(0, 30)) // past the first page: a quarter of it
    fireEvent(o, pointer('pointercancel', 120, 0))
    fireEvent(o, pointer('pointerdown', 0, 0))
    fireEvent(o, pointer('pointermove', -40, 0))
    fireEvent(o, pointer('pointermove', -120, 0))
    expect(track().style.transform).toBe(at(0, -120))
    expect(track()).toHaveAttribute('data-dragging', 'true')
  })

  it('leaves a mostly up-and-down movement to the page, and a drag that starts on a chart to the chart', () => {
    setup()
    drag(screen.getByTestId('overview'), -70, 160)
    drag(screen.getByTestId('chart'), -200)
    expect(tab('Overview')).toHaveAttribute('aria-pressed', 'true')
  })

  it('does not press the button the finger lets go over', () => {
    setup()
    const button = screen.getByRole('button', { name: 'A button' })
    drag(button, -140)
    fireEvent.click(button)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('starts the other page at its top: the dialog is scrolled back up', () => {
    const scrollTo = vi.fn()
    render(
      <dialog open>
        <PlanPager overview={<p>Overview content</p>} calendar={<p>Calendar content</p>} />
      </dialog>,
    )
    const dialog = document.querySelector('dialog') as HTMLDialogElement
    dialog.scrollTo = scrollTo as typeof dialog.scrollTo
    Object.defineProperty(dialog, 'scrollTop', { value: 300, configurable: true })
    fireEvent.click(screen.getByRole('button', { name: 'Calendar' }))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
  })

  it('moves the pages with a transform, never a custom property, which everything inside would inherit', () => {
    setup()
    fireEvent.click(tab('Calendar'))
    expect(track().style.transform).toContain('translate3d')
    expect(track().getAttribute('style')).not.toContain('--')
  })
})
