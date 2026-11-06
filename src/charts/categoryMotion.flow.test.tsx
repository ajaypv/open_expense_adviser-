// @vitest-environment jsdom
import '../test/dom'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Category } from '../db/schema'
import type { CategoryTotal } from '../insights/aggregates'
import { useCountWhen } from '../ui/motion'
import { CategoryBars } from './CategoryBars'
import { CategoryBubbles } from './CategoryBubbles'
import { CategoryDonut } from './CategoryDonut'

const names = ['Groceries', 'Shopping', 'Food & Dining', 'Health', 'Travel', 'Bills', 'Fun', 'Gifts', 'Pets', 'Fuel', 'Rent', 'Tax']
const categoryById = new Map<number, Category>(names.map((name, i) => [i + 1, { id: i + 1, name, color: `var(--s${(i % 8) + 1})` }]))
const make = (count: number): CategoryTotal[] => Array.from({ length: count }, (_, i) => ({ categoryId: i + 1, totalMinor: (count - i) * 10_000 }))

const delay = (el: Element) => parseInt((el as HTMLElement).style.getPropertyValue('--d'), 10)

describe('Bubbles: how they arrive and move', () => {
  const mount = (totals: CategoryTotal[]) => render(<CategoryBubbles totals={totals} categoryById={categoryById} currency="INR" onPick={() => {}} />)

  it('brings the biggest bubble in first and the rest a beat apart', () => {
    mount(make(4))
    const bubbles = Array.from(document.querySelectorAll('.bubble'))
    expect(bubbles.map(delay)).toEqual([0, 70, 140, 210])
  })

  it('lets a bubble glide to its new place when the month changes, rather than replacing it', () => {
    const { rerender } = mount(make(4))
    const before = screen.getByRole('button', { name: /^Groceries/ }).closest('li')!
    expect(before.className).toContain('transition-[left,top,width,height]')
    rerender(<CategoryBubbles totals={[...make(4)].reverse()} categoryById={categoryById} currency="INR" onPick={() => {}} />)
    expect(screen.getByRole('button', { name: /^Groceries/ }).closest('li')).toBe(before)
  })

  it('shrinks a bubble a little under a finger', () => {
    mount(make(3))
    expect(screen.getByRole('button', { name: /^Groceries/ }).className).toContain('active:scale-95')
  })
})

describe('Donut: how it arrives and responds', () => {
  const mount = () => render(<CategoryDonut totals={make(4)} categoryById={categoryById} currency="INR" />)

  it('draws the segments round one after another, in the order they sit on the ring', () => {
    mount()
    const segs = Array.from(document.querySelectorAll('circle[data-segment]'))
    expect(segs.every((s) => s.classList.contains('donut-seg'))).toBe(true)
    expect(segs.map(delay)).toEqual([0, 110, 220, 330])
  })

  it('raises the legend rows and the sentence once the ring is under way', () => {
    mount()
    const rows = Array.from(screen.getByRole('list', { name: 'Spending by category' }).querySelectorAll(':scope > li'))
    expect(rows.every((r) => r.classList.contains('row-in'))).toBe(true)
    expect(rows.map(delay)).toEqual([300, 360, 420, 480])
    const sentence = screen.getByText(/Most of it went on/)
    expect(sentence.classList.contains('row-in')).toBe(true)
    // After the last row.
    expect(delay(sentence)).toBe(540)
  })

  it('pops a new reading into the middle when a different category is chosen', () => {
    mount()
    const popped = () => screen.getByTestId('donut-centre').querySelector('.donut-pop')!
    const total = popped()
    fireEvent.click(document.querySelector('circle[data-segment="2"]')!)
    expect(popped()).not.toBe(total)
    expect(popped()).toHaveTextContent('Shopping')
  })

  it('does not restart the drawing when only the selection changes', () => {
    mount()
    const first = document.querySelector('circle[data-segment="1"]')!
    fireEvent.click(document.querySelector('circle[data-segment="3"]')!)
    expect(document.querySelector('circle[data-segment="1"]')).toBe(first)
  })
})

describe('List: how it arrives and responds', () => {
  const mount = (count: number, totals = make(count)) =>
    render(<CategoryBars totals={totals} categoryById={categoryById} currency="INR" onPick={() => {}} />)
  const rowsOf = () => Array.from(document.querySelectorAll('ul > li'))

  it('brings the rows in one after another, each with its bar growing from the left', () => {
    mount(4)
    expect(rowsOf().map(delay)).toEqual([0, 50, 100, 150])
    expect(rowsOf().every((r) => r.classList.contains('row-in'))).toBe(true)
    expect(document.querySelectorAll('.bar-grow')).toHaveLength(4)
  })

  it('stops the stagger after ten rows so a long list is not slow to finish', () => {
    mount(12)
    const delays = rowsOf().map(delay)
    expect(Math.max(...delays)).toBe(450)
    expect(delays.slice(9)).toEqual([450, 450, 450])
  })

  it('lets a bar change length smoothly when the figures change, without drawing it again', () => {
    const { rerender } = mount(3)
    const bar = document.querySelector('.bar-grow')!
    expect(bar.className).toContain('transition-[width]')
    rerender(<CategoryBars totals={make(3).map((t) => ({ ...t, totalMinor: t.totalMinor / 2 }))} categoryById={categoryById} currency="INR" onPick={() => {}} />)
    expect(document.querySelector('.bar-grow')).toBe(bar)
  })

  it('presses in a little under a finger', () => {
    mount(2)
    expect(screen.getAllByRole('button')[0].className).toContain('active:scale-[0.985]')
  })
})

describe('the category views: their motion in the style sheet', () => {
  const sheet = readFileSync('src/index.css', 'utf8').replace(/\r/g, '')
  const block = sheet.slice(sheet.indexOf('/* ---------- The category views arriving'), sheet.indexOf('/* ---------- Pins on the places map'))

  it('defines each of the movements', () => {
    for (const name of ['bubble-glint', 'donut-draw', 'donut-pop', 'row-in', 'bar-grow']) {
      expect(sheet, name).toContain(`@keyframes ${name} {`)
    }
  })

  it('leaves nothing holding a value after it has played', () => {
    for (const rule of ['.donut-seg {', '.donut-pop {', '.row-in {', '.bar-grow {']) {
      const at = block.indexOf(rule)
      expect(at, rule).toBeGreaterThan(-1)
      expect(block.slice(at, block.indexOf('}', at))).toContain('backwards;')
    }
  })

  it('stops all of it for someone who asked for less motion', () => {
    const reduced = block.slice(block.indexOf('@media (prefers-reduced-motion: reduce)'))
    for (const cls of ['.bubble::after', '.donut-seg', '.donut-pop', '.row-in', '.bar-grow']) {
      expect(reduced, cls).toContain(cls)
    }
    expect(reduced).toContain('animation: none')
  })
})

/** An IntersectionObserver the test can fire by hand. */
class FakeObserver {
  static all: FakeObserver[] = []
  disconnected = false
  constructor(private cb: IntersectionObserverCallback) {
    FakeObserver.all.push(this)
  }
  observe() {}
  unobserve() {}
  disconnect() {
    this.disconnected = true
  }
  fire(isIntersecting: boolean) {
    this.cb([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
}

describe('the category views wait until they are on screen', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    FakeObserver.all = []
  })

  const views: [string, () => ReturnType<typeof render>][] = [
    ['bubbles', () => render(<CategoryBubbles totals={make(4)} categoryById={categoryById} currency="INR" />)],
    ['donut', () => render(<CategoryDonut totals={make(4)} categoryById={categoryById} currency="INR" />)],
    ['list', () => render(<CategoryBars totals={make(4)} categoryById={categoryById} currency="INR" />)],
  ]

  it.each(views)('holds the %s back until they are in view, then lets them go and stops watching', (_name, mount) => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    mount()
    const box = document.querySelector('.when-seen')!
    expect(box).toHaveAttribute('data-seen', 'false')
    const watcher = FakeObserver.all.at(-1)!
    // Scrolled past the edge but not into view: still held.
    act(() => watcher.fire(false))
    expect(box).toHaveAttribute('data-seen', 'false')
    act(() => watcher.fire(true))
    expect(box).toHaveAttribute('data-seen', 'true')
    expect(watcher.disconnected).toBe(true)
  })

  it.each(views)('plays the %s at once where the browser cannot say what is in view', (_name, mount) => {
    mount()
    expect(document.querySelector('.when-seen')).toHaveAttribute('data-seen', 'true')
  })

  it('holds every animation inside at its first frame until then, in the style sheet', () => {
    const sheet = readFileSync('src/index.css', 'utf8').replace(/\r/g, '')
    expect(sheet).toMatch(/\.when-seen\[data-seen='false'\] \*,[\s\S]*?animation-play-state: paused/)
  })
})

describe('the bubble percentages counting up', () => {
  const frames: FrameRequestCallback[] = []
  const matchMedia = window.matchMedia
  const frame = (t: number) => act(() => void frames.shift()?.(t))

  afterEach(() => {
    window.matchMedia = matchMedia
    vi.unstubAllGlobals()
    frames.length = 0
  })

  const allowMotion = () => {
    window.matchMedia = ((query: string) => ({ matches: query.includes('no-preference'), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', () => {})
  }

  it('stays at nothing until it is told to run, then counts to the figure after its delay and lands exactly on it', () => {
    allowMotion()
    const { result, rerender } = renderHook(({ run }) => useCountWhen(0.5, run, 100), { initialProps: { run: false } })
    expect(result.current).toBe(0)
    expect(frames).toHaveLength(0)

    rerender({ run: true })
    expect(frames).toHaveLength(1)
    frame(0)
    expect(result.current).toBe(0) // still inside its delay
    frame(525)
    expect(result.current).toBeGreaterThan(0)
    expect(result.current).toBeLessThan(0.5)
    frame(5000)
    expect(result.current).toBe(0.5)
    expect(frames).toHaveLength(0)
  })

  it('shows the figure straight away for someone who asked for less motion', () => {
    const { result } = renderHook(() => useCountWhen(0.5, false, 100))
    expect(result.current).toBe(0.5)
  })
})
