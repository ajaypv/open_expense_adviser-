// @vitest-environment jsdom
import '../test/dom'
import { readFileSync } from 'node:fs'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Profiler } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { HomePager } from './HomePager'
import { openHomeOn, showHomeView, takeWaitingHomeView } from './homeView'

/** A touch (or mouse) pointer event with the fields the pager reads. */
function pointer(type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', x: number, y: number, pointerType = 'touch') {
  const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })
  Object.defineProperty(e, 'pointerType', { value: pointerType })
  Object.defineProperty(e, 'pointerId', { value: 1 })
  return e
}

/** Puts a finger down on `target` at (0, 0), moves it to (dx, dy) in a few steps, and lifts it. */
function drag(target: Element, dx: number, dy = 0, pointerType = 'touch') {
  fireEvent(target, pointer('pointerdown', 0, 0, pointerType))
  for (const f of [0.25, 0.5, 0.75, 1]) fireEvent(target, pointer('pointermove', dx * f, dy * f, pointerType))
  fireEvent(target, pointer('pointerup', dx, dy, pointerType))
}

const onPress = vi.fn()

function setup() {
  onPress.mockClear()
  render(
    <HomePager
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
      timeline={<p data-testid="timeline">Timeline content</p>}
    />,
  )
}

const tab = (name: string) => screen.getByRole('button', { name })
const panel = (id: 'overview' | 'timeline') => document.querySelector(`[data-page="${id}"]`) as HTMLElement
const track = () => document.querySelector('.pager-track') as HTMLElement
const pill = () => document.querySelector('.pager-pill') as HTMLElement

/** Where the pages are for a given page and drag, as the component writes it. */
const at = (index: number, px = 0) => `translate3d(calc(${-index * 100}% + ${px}px), 0, 0)`

describe('HomePager: the tabs', () => {
  it('starts on the overview, with the timeline not built yet', () => {
    setup()
    expect(tab('Overview')).toHaveAttribute('aria-pressed', 'true')
    expect(tab('Timeline')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('overview')).toBeInTheDocument()
    expect(screen.queryByTestId('timeline')).toBeNull()
  })

  it('builds the timeline behind the scenes shortly after, so opening it does not stall the slide', async () => {
    setup()
    expect(screen.queryByTestId('timeline')).toBeNull()
    await waitFor(() => expect(screen.getByTestId('timeline')).toBeInTheDocument())
    // Built, but the overview is still the page in view.
    expect(tab('Overview')).toHaveAttribute('aria-pressed', 'true')
    expect(panel('timeline')).toHaveAttribute('data-rest', 'true')
  })

  it('moves to the timeline when its tab is pressed, and back', () => {
    setup()
    fireEvent.click(tab('Timeline'))
    expect(tab('Timeline')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('timeline')).toBeInTheDocument()
    expect(track().style.transform).toBe(at(1))
    fireEvent.click(tab('Overview'))
    expect(tab('Overview')).toHaveAttribute('aria-pressed', 'true')
    expect(track().style.transform).toBe(at(0))
  })

  it('folds away the page that is not in view once the slide is over, so the screen is as long as the one you are on', async () => {
    setup()
    expect(panel('timeline')).toHaveAttribute('data-rest', 'true')
    expect(panel('overview')).toHaveAttribute('data-rest', 'false')
    fireEvent.click(tab('Timeline'))
    // Both keep their height while it slides.
    expect(panel('overview')).toHaveAttribute('data-rest', 'false')
    await waitFor(() => expect(panel('overview')).toHaveAttribute('data-rest', 'true'))
    expect(panel('overview')).toHaveAttribute('inert')
    expect(panel('timeline')).toHaveAttribute('data-rest', 'false')
    expect(panel('timeline')).not.toHaveAttribute('inert')
  })

  it('has a marker that slides to the chosen tab', () => {
    setup()
    expect(pill().style.transform).toBe('translate3d(0%, 0, 0)')
    fireEvent.click(tab('Timeline'))
    expect(pill().style.transform).toBe('translate3d(100%, 0, 0)')
  })
})

describe('HomePager: dragging the page', () => {
  it('goes to the timeline when dragged left, and back when dragged right', () => {
    setup()
    drag(screen.getByTestId('overview'), -140)
    expect(tab('Timeline')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('timeline')).toBeInTheDocument()
    drag(screen.getByTestId('timeline'), 140)
    expect(tab('Overview')).toHaveAttribute('aria-pressed', 'true')
  })

  it('sends the pages and the marker to where they belong when a drag lets go, so they glide there from the finger', () => {
    setup()
    drag(screen.getByTestId('overview'), -140)
    expect(track().style.transform).toBe(at(1))
    expect(pill().style.transform).toBe('translate3d(100%, 0, 0)')
    expect(track()).toHaveAttribute('data-dragging', 'false')
    drag(screen.getByTestId('timeline'), 140)
    expect(track().style.transform).toBe(at(0))
    expect(pill().style.transform).toBe('translate3d(0%, 0, 0)')
  })

  it('stays put for a short movement, a tap, or a drag the wrong way past either end', () => {
    setup()
    drag(screen.getByTestId('overview'), -30)
    drag(screen.getByTestId('overview'), 160)
    expect(tab('Overview')).toHaveAttribute('aria-pressed', 'true')
    expect(track().style.transform).toBe(at(0))
    fireEvent.click(tab('Timeline'))
    drag(screen.getByTestId('timeline'), -160)
    drag(screen.getByTestId('timeline'), 20)
    expect(tab('Timeline')).toHaveAttribute('aria-pressed', 'true')
    expect(track().style.transform).toBe(at(1))
  })

  it('leaves a mostly up-and-down movement to the page, which is scrolling', () => {
    setup()
    drag(screen.getByTestId('overview'), -70, 160)
    expect(tab('Overview')).toHaveAttribute('aria-pressed', 'true')
  })

  it('ignores a mouse, so dragging to select text still works', () => {
    setup()
    drag(screen.getByTestId('overview'), -200, 0, 'mouse')
    expect(tab('Overview')).toHaveAttribute('aria-pressed', 'true')
  })

  it('leaves a drag that starts on a chart, or anything else that uses sideways drags, to that', () => {
    setup()
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

  it('follows the finger while it is down, with no easing, and settles when it is lifted', () => {
    setup()
    const target = screen.getByTestId('overview')
    fireEvent(target, pointer('pointerdown', 0, 0))
    fireEvent(target, pointer('pointermove', -60, 0))
    fireEvent(target, pointer('pointermove', -90, 0))
    expect(track()).toHaveAttribute('data-dragging', 'true')
    expect(track().style.transform).toBe(at(0, -90))
    // The timeline is built as soon as it starts to come in, so there is something to see under the finger.
    expect(screen.getByTestId('timeline')).toBeInTheDocument()
    fireEvent(target, pointer('pointercancel', -90, 0))
    expect(track()).toHaveAttribute('data-dragging', 'false')
    expect(track().style.transform).toBe(at(0))
  })

  it('carries the marker along with the finger, by how far across the pages are', () => {
    setup()
    const target = screen.getByTestId('overview')
    fireEvent(target, pointer('pointerdown', 0, 0))
    fireEvent(target, pointer('pointermove', -40, 0))
    fireEvent(target, pointer('pointermove', -100, 0))
    // The jsdom page has no width, so a movement of 100 is taken as the whole of it: the marker is all the way across.
    expect(pill().style.transform).toBe('translate3d(100%, 0, 0)')
    expect(pill()).toHaveAttribute('data-dragging', 'true')
  })

  it('gives only a little past the first page, and springs back', () => {
    setup()
    const target = screen.getByTestId('overview')
    fireEvent(target, pointer('pointerdown', 0, 0))
    fireEvent(target, pointer('pointermove', 40, 0))
    fireEvent(target, pointer('pointermove', 120, 0))
    expect(track().style.transform).toBe(at(0, 30))
  })
})

describe('HomePager: it stays cheap while the finger moves', () => {
  it('does not draw the component again at every move of the finger, only when a drag starts and ends', () => {
    const commits = vi.fn()
    render(
      <Profiler id="pager" onRender={commits}>
        <HomePager overview={<p data-testid="overview">Overview content</p>} timeline={<p data-testid="timeline">Timeline content</p>} />
      </Profiler>,
    )
    const target = screen.getByTestId('overview')
    fireEvent(target, pointer('pointerdown', 0, 0))
    fireEvent(target, pointer('pointermove', -30, 0)) // the drag starts here
    const afterStart = commits.mock.calls.length
    for (let x = -35; x >= -140; x -= 5) fireEvent(target, pointer('pointermove', x, 0))
    expect(commits.mock.calls.length).toBe(afterStart) // twenty-two more moves, no more drawing
    expect(track().style.transform).toBe(at(0, -140))
    fireEvent(target, pointer('pointerup', -140, 0))
  })

  it('moves the pages with a transform on the track and the marker, never a custom property, which would be inherited by everything inside', () => {
    setup()
    const target = screen.getByTestId('overview')
    fireEvent(target, pointer('pointerdown', 0, 0))
    fireEvent(target, pointer('pointermove', -50, 0))
    fireEvent(target, pointer('pointermove', -90, 0))
    for (const el of [track(), pill(), screen.getByRole('group', { name: 'Home view' })]) {
      expect(el.getAttribute('style') ?? '').not.toMatch(/--(i|p|drag)\b/)
    }
    expect(track().style.transform).not.toBe('')
  })
})

describe('HomePager: the page beneath', () => {
  it('goes to the top of the other page, scrolling the main area it sits in (not the window)', () => {
    const scrollTo = vi.fn()
    render(
      <main>
        <HomePager overview={<p>Overview content</p>} timeline={<p>Timeline content</p>} />
      </main>,
    )
    const main = document.querySelector('main') as HTMLElement
    main.scrollTo = scrollTo as typeof main.scrollTo
    Object.defineProperty(main, 'scrollTop', { value: 480, configurable: true })
    fireEvent.click(screen.getByRole('button', { name: 'Timeline' }))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
  })

  it('does not scroll at all when it is already at the top', () => {
    const scrollTo = vi.fn()
    render(
      <main>
        <HomePager overview={<p>Overview content</p>} timeline={<p>Timeline content</p>} />
      </main>,
    )
    ;(document.querySelector('main') as HTMLElement).scrollTo = scrollTo as never
    fireEvent.click(screen.getByRole('button', { name: 'Timeline' }))
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('cuts the pages off at the screen’s edge, not at the content’s, so a ring beside the first column is not clipped on the left', () => {
    setup()
    const clip = track().parentElement!
    expect(clip).toHaveClass('overflow-x-clip', '-mx-5', 'px-5')
  })
})

describe('HomePager: motion', () => {
  const css = readFileSync('src/index.css', 'utf8').replace(/\r/g, '')

  it('slides with an easing, but follows the finger without one, and does not slide at all when motion is reduced', () => {
    expect(css).toMatch(/\.pager-track \{[^}]*transition: transform 380ms/)
    expect(css).toMatch(/\.pager-track\[data-dragging='true'\] \{[^}]*transition: none/)
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.pager-track,\s*\.pager-pill \{\s*transition: none/)
  })

  it('does not use a custom property to place the pages, since that is inherited and costs the whole page its style at every move', () => {
    expect(css).not.toMatch(/\.pager-track \{[^}]*var\(--(i|drag)/)
    expect(css).not.toMatch(/\.pager-pill \{[^}]*var\(--p/)
  })

  it('gives the track a layer of its own only while it is moving', () => {
    expect(css).toMatch(/\.pager-track\[data-dragging='true'\],\s*\.pager-track\[data-moving='true'\] \{\s*will-change: transform/)
    expect(css).not.toMatch(/\.pager-track \{[^}]*will-change/)
  })

  it('leaves the page out of view not laid out or drawn at all, and nothing in it animating', () => {
    expect(css).toMatch(/\.pager-panel\[data-rest='true'\] \{[^}]*content-visibility: hidden/)
    expect(css).toMatch(/\.pager-panel\[data-rest='true'\] \* \{\s*animation-play-state: paused/)
  })
})

describe('HomePager: asked from the bottom bar', () => {
  it('moves to the timeline and back when the bar is swiped, as a tap on the tabs would', () => {
    setup()
    act(() => showHomeView('timeline'))
    expect(tab('Timeline')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('timeline')).toBeInTheDocument()
    expect(track().style.transform).toBe(at(1))
    act(() => showHomeView('overview'))
    expect(tab('Overview')).toHaveAttribute('aria-pressed', 'true')
    expect(track().style.transform).toBe(at(0))
  })

  it('stays put when asked for the page it is already on', () => {
    setup()
    act(() => showHomeView('overview'))
    expect(tab('Overview')).toHaveAttribute('aria-pressed', 'true')
    expect(panel('overview')).toHaveAttribute('data-rest', 'false')
  })

  it('opens on the timeline, already built and in place, when Home was opened by a swipe towards it', () => {
    openHomeOn('timeline')
    setup()
    expect(tab('Timeline')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('timeline')).toBeInTheDocument()
    expect(track().style.transform).toBe(at(1))
    expect(pill().style.transform).toBe('translate3d(100%, 0, 0)')
  })

  it('opens on the overview, as always, when the swipe was towards it or there was none', () => {
    openHomeOn('overview')
    setup()
    expect(tab('Overview')).toHaveAttribute('aria-pressed', 'true')
    cleanup()
    setup()
    expect(tab('Overview')).toHaveAttribute('aria-pressed', 'true')
  })

  it('uses a request only once, so the next visit to Home starts on the overview again', () => {
    openHomeOn('timeline')
    setup()
    cleanup()
    setup()
    expect(tab('Overview')).toHaveAttribute('aria-pressed', 'true')
  })

  it('forgets a request that is no longer fresh, so a late-built pager does not jump to it', () => {
    vi.useFakeTimers()
    try {
      openHomeOn('timeline')
      vi.advanceTimersByTime(5000)
      expect(takeWaitingHomeView()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops listening when it goes away', () => {
    setup()
    cleanup()
    expect(() => act(() => showHomeView('timeline'))).not.toThrow()
  })
})
