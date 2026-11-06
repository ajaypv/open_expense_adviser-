// @vitest-environment jsdom
import '../test/dom'
import { act, render, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLineScroll } from './useLineScroll'

/*
 * A list in a scrolling area 1000 tall, whose top is at "listTop" on screen. Three stretches of 100 each follow one another from
 * 30 down the list, with a date at the top of each and one at the foot of the last. The line is drawn as far as 62% down the area.
 */
let listTop = 100
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
            <span data-seg data-dir={i % 2 ? '-1' : '1'} data-top={30 + i * 200} data-height="100" />
          </li>
        ))}
        <li>
          <span data-dot data-at={630} />
        </li>
      </ol>
    </main>
  )
}

function layout() {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const el = this as HTMLElement
    if (el.tagName === 'MAIN') return rect(0, 1000)
    if (el.tagName === 'OL') return rect(listTop, 700)
    if (el.dataset.seg !== undefined) return rect(listTop + Number(el.dataset.top), Number(el.dataset.height))
    if (el.dataset.dot !== undefined) return rect(listTop + Number(el.dataset.at) - 10, 20)
    return rect(0, 0)
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  listTop = 100
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

  it('sets the bead sideways with the sway, so it rides the river and not a straight line', () => {
    layout()
    render(<List />)
    const x = (i: number) => parseFloat(segs()[i].style.getPropertyValue('--hx'))
    expect(x(0)).toBeCloseTo(0, 5)
    expect(Math.abs(x(2))).toBeGreaterThan(0)
    expect(x(2)).toBeGreaterThan(0) // the third sways to the right
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
    // Scroll the page up by 300: the list moves up, so the line reaches 300 further down it.
    listTop = -200
    await act(async () => {
      document.querySelector('main')!.dispatchEvent(new Event('scroll'))
    })
    await waitFor(() => expect(progress()).toEqual([1, 1, 1]))
    await waitFor(() => expect(lit()).toEqual(['true', 'true', 'true', 'true']))
    // And back down: they un-draw, again with some delay and no jump.
    listTop = 700
    await act(async () => {
      document.querySelector('main')!.dispatchEvent(new Event('scroll'))
    })
    await waitFor(() => expect(progress()).toEqual([0, 0, 0]))
    await waitFor(() => expect(lit()).toEqual(['false', 'false', 'false', 'false']))
  })

  it('measures again when the list is given a new key, as when a day is opened', () => {
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
