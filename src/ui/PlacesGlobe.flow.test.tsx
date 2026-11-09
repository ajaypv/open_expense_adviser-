// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Spot } from '../insights/places'

const update = vi.fn()
const destroy = vi.fn()
const createGlobe = vi.fn((_canvas: HTMLCanvasElement, _opts: Record<string, unknown>) => ({ update, destroy }))
vi.mock('cobe', () => ({ default: createGlobe }))

import { dotSize, facing, PlacesGlobe } from './PlacesGlobe'
import { PlacesMap } from './PlacesMap'

const spot = (name: string, count: number, rupees: number, lat: number, lon: number): Spot => ({
  key: `${lat},${lon}`, lat, lon, count, totalMinor: rupees * 100, name, color: 'var(--s1)',
})
const cafe = spot('Cafe', 3, 1200, 12.97, 77.59) // Bengaluru
const paris = spot('Louvre', 1, 300, 48.86, 2.34)
const spots = [cafe, paris]

type Opts = { phi: number; theta: number; markers: { location: [number, number]; size: number; id: string }[] }
const options = () => createGlobe.mock.calls[0][1] as unknown as Opts
const made = () => vi.waitFor(() => expect(createGlobe).toHaveBeenCalled())
const caption = () => document.querySelector('[aria-live="polite"]') as HTMLElement
const lastMarkers = () => (update.mock.calls.map((c) => c[0]).filter((u) => u.markers).at(-1) as Pick<Opts, 'markers'>).markers

beforeEach(() => {
  createGlobe.mockClear()
  update.mockClear()
  destroy.mockClear()
  createGlobe.mockImplementation(() => ({ update, destroy }))
})

describe('facing: the angles that bring a place to the middle', () => {
  it('has the latitude as the tilt and the longitude, turned a quarter, as the spin', () => {
    expect(facing(20.59, 78.96).theta).toBeCloseTo(0.3594, 3)
    expect(facing(20.59, 78.96).phi).toBeCloseTo(-2.9488, 3)
    expect(facing(0, 0)).toEqual({ phi: -Math.PI / 2, theta: 0 })
  })

  it('has places on opposite sides of the world half a turn apart, and the west on the other side of the east', () => {
    expect(facing(0, 10).phi - facing(0, 190).phi).toBeCloseTo(Math.PI, 6)
    expect(facing(0, -30).phi).toBeGreaterThan(facing(0, 30).phi)
  })
})

describe('dotSize', () => {
  it('is biggest for the biggest spend, and never so small that a place is lost', () => {
    expect(dotSize(100, 100, false)).toBeCloseTo(0.09, 5)
    expect(dotSize(1, 100_000, false)).toBeGreaterThan(0.03)
    expect(dotSize(50, 100, false)).toBeLessThan(dotSize(100, 100, false))
  })

  it('makes the place picked bigger', () => {
    expect(dotSize(40, 100, true)).toBeCloseTo(dotSize(40, 100, false) * 1.45, 5)
  })

  it('copes with nothing spent and with nothing to compare with', () => {
    expect(Number.isFinite(dotSize(0, 0, false))).toBe(true)
  })
})

describe('PlacesGlobe', () => {
  it('draws a globe with a dot at each place, bigger where more was spent, and says so for a screen reader', async () => {
    render(<PlacesGlobe spots={spots} currency="INR" focusKey={null} />)
    await made()
    expect(screen.getByRole('img', { name: 'Globe with 2 places where you spent' })).toBeInTheDocument()
    const { markers } = options()
    expect(markers.map((m) => m.location)).toEqual([[12.97, 77.59], [48.86, 2.34]])
    expect(markers[0].size).toBeGreaterThan(markers[1].size)
  })

  it('says place, not places, for one', async () => {
    render(<PlacesGlobe spots={[cafe]} currency="INR" focusKey={null} />)
    expect(await screen.findByRole('img', { name: 'Globe with 1 place where you spent' })).toBeInTheDocument()
  })

  it('starts turned to face the biggest place', async () => {
    render(<PlacesGlobe spots={spots} currency="INR" focusKey={null} />)
    await made()
    expect(options().phi).toBeCloseTo(facing(cafe.lat, cafe.lon).phi, 6)
  })

  it('starts turned to the place asked for', async () => {
    render(<PlacesGlobe spots={spots} currency="INR" focusKey={paris.key} />)
    await made()
    expect(options().phi).toBeCloseTo(facing(paris.lat, paris.lon).phi, 6)
    expect(caption()).toHaveTextContent('Louvre: 1 time, ₹300')
  })

  it('keeps the dots up to date when the places change, and makes the one picked bigger', async () => {
    const view = render(<PlacesGlobe spots={spots} currency="INR" focusKey={null} />)
    await made()
    const plain = options().markers[1].size
    view.rerender(<PlacesGlobe spots={spots} currency="INR" focusKey={paris.key} />)
    expect(lastMarkers()[1].size).toBeCloseTo(plain * 1.45, 5)
    view.rerender(<PlacesGlobe spots={[paris]} currency="INR" focusKey={null} />)
    expect(lastMarkers()).toHaveLength(1)
  })

  it('swings round to the place picked, and so the angle moves towards it', async () => {
    const view = render(<PlacesGlobe spots={spots} currency="INR" focusKey={null} />)
    await made()
    update.mockClear()
    view.rerender(<PlacesGlobe spots={spots} currency="INR" focusKey={paris.key} />)
    await vi.waitFor(() => expect(update.mock.calls.some((c) => c[0].phi !== undefined)).toBe(true))
    const goal = facing(paris.lat, paris.lon).phi
    const start = facing(cafe.lat, cafe.lon).phi
    const phis = update.mock.calls.map((c) => c[0].phi).filter((p) => p !== undefined) as number[]
    // The short way round, never further from the goal than the start was.
    const gap = (p: number) => Math.abs((((goal - p + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI)
    expect(gap(phis.at(-1)!)).toBeLessThan(gap(start))
  })

  it('names the place picked, with how often and how much, and gives a hint when none is picked', async () => {
    const view = render(<PlacesGlobe spots={spots} currency="INR" focusKey={null} />)
    expect(screen.getByText(/Drag to turn the globe/)).toBeInTheDocument()
    view.rerender(<PlacesGlobe spots={spots} currency="INR" focusKey={cafe.key} />)
    expect(caption()).toHaveTextContent('Cafe: 3 times, ₹1,200')
  })

  it('turns by hand when dragged sideways, and is taken down with the page', async () => {
    const view = render(<PlacesGlobe spots={spots} currency="INR" focusKey={null} />)
    await made()
    const canvas = screen.getByRole('img')
    update.mockClear()
    fireEvent.pointerDown(canvas, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 140, pointerId: 1 })
    const turned = update.mock.calls.map((c) => c[0]).find((u) => u.phi !== undefined)
    expect(turned.phi).toBeCloseTo(facing(cafe.lat, cafe.lon).phi + (40 / 320) * Math.PI, 1) // (a frame of spin may come first) right drags the surface to the right
    fireEvent.pointerUp(canvas, { pointerId: 1 })
    view.unmount()
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('lets the page scroll up and down with a finger on it', () => {
    render(<PlacesGlobe spots={spots} currency="INR" focusKey={null} />)
    expect(screen.getByRole('img')).toHaveClass('touch-pan-y')
  })

  it('shows nothing where the globe cannot be drawn, and does not break', async () => {
    createGlobe.mockImplementation(() => {
      throw new Error('WebGL is not supported')
    })
    const { container } = render(<PlacesGlobe spots={spots} currency="INR" focusKey={null} />)
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('sends nothing anywhere: no request is made to draw it', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch')
    render(<PlacesGlobe spots={spots} currency="INR" focusKey={null} />)
    await made()
    expect(fetcher).not.toHaveBeenCalled()
    fetcher.mockRestore()
  })
})

describe('PlacesMap with the globe', () => {
  const mount = () => render(<PlacesMap spots={spots} currency="INR" monthName="October" />)

  it('shows the globe with the list, before any map is asked for', async () => {
    mount()
    await made()
    expect(screen.getByRole('img', { name: /^Globe with 2 places/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show map' })).toBeInTheDocument()
  })

  it('turns the globe to a place when its row is tapped, and lets go when tapped again', async () => {
    mount()
    await made()
    const row = screen.getByRole('button', { name: /^Louvre, 1 time/ })
    expect(row).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-pressed', 'true')
    expect(caption()).toHaveTextContent('Louvre: 1 time, ₹300')
    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(/Drag to turn the globe/)).toBeInTheDocument()
  })

  it('still lists the places for someone who cannot see the globe', () => {
    mount()
    const list = screen.getByRole('list', { name: 'Places in October' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
  })
})
