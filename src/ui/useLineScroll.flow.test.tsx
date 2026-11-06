// @vitest-environment jsdom
import '../test/dom'
import { act, render, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLineScroll } from './useLineScroll'

/*
 * A list in a scrolling area 1000 tall, scrolled by "scrollTop". The list begins 100 down the area's content ("listTop"). Three
 * stretches of 100 each follow one another from 30 down the list, with a date at the top of each and one at the foot of the last. The
 * line is drawn as far as 62% down the area.
 */
let listTop = 100
let scrollTop = 0
const rect = (top: number, height: number): DOMRect => ({ top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect

function List({ k = 0 }: { k?: number }) {
  const ref = useRef<HTMLOListElement>(null)
  useLineScroll(ref, k)
  return (
    <main data-testid="main">
      <ol ref={ref} data-testid="list">
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <span data-dot data-at={30 + i * 200} />
            <span data-seg data-top={30 + i * 200} data-height="100" />
          </li>
        ))}
        <li>
          <span data-dot data-at={630} />
        </li>
      </ol>
    </main>
  )
}

/** Where everything is on screen, given how far the area is scrolled: what is in it moves up as it is scrolled. */
function layout() {
  vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(() => scrollTop)
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) {
    return this.tagName === 'MAIN' ? 1000 : 0
  })
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const el = this as HTMLElement
    const up = scrollTop
    if (el.tagName === 'MAIN') return rect(0, 1000)
    if (el.tagName === 'OL') return rect(listTop - up, 700)
    if (el.dataset.seg !== undefined) return rect(listTop - up + Number(el.dataset.top), Number(el.dataset.height))
    if (el.dataset.dot !== undefined) return rect(listTop - up + Number(el.dataset.at) - 10, 20)
    return rect(0, 0)
  })
}

const scrollTo = async (to: number) => {
  scrollTop = to
  await act(async () => {
    document.querySelector('main')!.dispatchEvent(new Event('scroll'))
  })
}

const realMatchMedia = window.matchMedia

afterEach(() => {
  window.matchMedia = realMatchMedia
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  listTop = 100
  scrollTop = 0
})

const segs = () => [...document.querySelectorAll<HTMLElement>('[data-seg]')]
const dots = () => [...document.querySelectorAll<HTMLElement>('[data-dot]')]
const progress = () => segs().map((s) => Number(s.style.getPropertyValue('--p')))
const lit = () => dots().map((d) => d.dataset.lit)

describe('useLineScroll', () => {
  it('draws each stretch as far as the line has reached, and lights the dates it has passed', () => {
    layout()
    render(<List />)
    // The line has reached 620 - 100 = 520 down the list: the first two stretches are drawn, the third nine tenths.
    expect(progress()).toEqual([1, 1, 0.9])
    expect(lit()).toEqual(['true', 'true', 'true', 'false'])
  })

  it('marks only the stretch being drawn as live, for the bead of light', () => {
    layout()
    render(<List />)
    expect(segs().map((s) => s.dataset.live)).toEqual(['false', 'false', 'true'])
  })

  it('leaves what is below the line undrawn and dark', () => {
    listTop = 700 // the list begins at the foot of the screen
    layout()
    render(<List />)
    // 620 - 700 is above the list: nothing reached.
    expect(progress()).toEqual([0, 0, 0])
    expect(lit()).toEqual(['false', 'false', 'false', 'false'])
  })

  it('follows the scrolling, a little behind, and settles exactly on the line', async () => {
    layout()
    render(<List />)
    expect(progress()).toEqual([1, 1, 0.9])
    // Scroll the area down by 300: the line reaches 300 further down the list.
    await scrollTo(300)
    await waitFor(() => expect(progress()).toEqual([1, 1, 1]))
    await waitFor(() => expect(lit()).toEqual(['true', 'true', 'true', 'true']))
    // And back up: it un-draws, again with some delay and no jump.
    await scrollTo(0)
    await waitFor(() => expect(progress()).toEqual([1, 1, 0.9]))
    await waitFor(() => expect(lit()).toEqual(['true', 'true', 'true', 'false']))
  })

  it('measures again when the list is given a new key, as when a day is added', () => {
    layout()
    const { rerender } = render(<List k={0} />)
    expect(progress()).toEqual([1, 1, 0.9])
    listTop = 700
    rerender(<List k={1} />)
    expect(progress()).toEqual([0, 0, 0])
  })

  it('draws it all at once when motion is reduced, and does not follow the scrolling', async () => {
    layout()
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia
    listTop = 700
    render(<List />)
    expect(progress()).toEqual([1, 1, 1])
    expect(lit()).toEqual(['true', 'true', 'true', 'true'])
    await act(async () => {
      document.querySelector('main')!.dispatchEvent(new Event('scroll'))
      await new Promise((r) => setTimeout(r, 80))
    })
    expect(progress()).toEqual([1, 1, 1])
  })
})

describe('useLineScroll: what it costs', () => {
  /** An IntersectionObserver the test can speak for. */
  function sight() {
    const seen: { callback: (entries: { isIntersecting: boolean }[]) => void } = { callback: () => {} }
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
          seen.callback = callback
        }
        observe() {}
        disconnect() {}
      },
    )
    return (on: boolean) => act(async () => seen.callback([{ isIntersecting: on }]))
  }

  it('does nothing while the list is out of sight, though the area it sits in is scrolling', async () => {
    layout()
    const show = sight()
    render(<List />)
    expect(progress()).toEqual([1, 1, 0.9])
    await show(false) // the other page of Home is in view
    await scrollTo(300)
    await act(async () => new Promise((r) => setTimeout(r, 80)))
    expect(progress()).toEqual([1, 1, 0.9]) // untouched
  })

  it('catches up at once on coming back into sight', async () => {
    layout()
    const show = sight()
    render(<List />)
    await show(false)
    await scrollTo(300)
    await show(true)
    expect(progress()).toEqual([1, 1, 1])
    expect(lit()).toEqual(['true', 'true', 'true', 'true'])
  })

  it('does not look at where anything is while the page scrolls: it measures once, and reads only how far it has been scrolled', async () => {
    const spy = layout()
    render(<List />)
    const afterMount = spy.mock.calls.length
    for (const y of [40, 120, 300, 500]) await scrollTo(y)
    await waitFor(() => expect(progress()).toEqual([1, 1, 1]))
    expect(spy.mock.calls.length).toBe(afterMount)
  })

  it('writes only the stretches and dates that have changed', async () => {
    layout()
    render(<List />)
    const writes = segs().map((s) => vi.spyOn(s.style, 'setProperty'))
    await scrollTo(10) // the line moves 10 further: only the third stretch is still being drawn
    await waitFor(() => expect(progress()).toEqual([1, 1, 1]))
    expect(writes[0]).not.toHaveBeenCalled()
    expect(writes[1]).not.toHaveBeenCalled()
    expect(writes[2]).toHaveBeenCalled()
  })

  it('stops asking for frames once the line has settled', async () => {
    layout()
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    render(<List />)
    await scrollTo(300)
    // It eases towards the line over some forty frames; give it the time, and then it must be quiet.
    await act(async () => new Promise((r) => setTimeout(r, 1400)))
    const settled = raf.mock.calls.length
    await act(async () => new Promise((r) => setTimeout(r, 120)))
    expect(raf.mock.calls.length).toBe(settled)
  })
})
