// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Spot } from '../insights/places'

const cleanup = vi.fn()
const drawMap = vi.fn((_el: HTMLElement, _spots: Spot[], _currency: string) => cleanup)
vi.mock('./leafletMap', () => ({ drawMap }))

import { PlacesMap } from './PlacesMap'

const spot = (name: string, count: number, rupees: number, lat = 12.97): Spot => ({
  key: `${lat},77.59`, lat, lon: 77.59, count, totalMinor: rupees * 100, name, color: 'var(--s1)',
})
const spots = [spot('Cafe', 3, 1200), spot('Uber', 1, 230, 13.1)]

const mount = (list: Spot[] = spots) => render(<PlacesMap spots={list} currency="INR" monthName="October" />)
const regionName = 'Map of where you spent'
const pressShow = () => fireEvent.click(screen.getByRole('button', { name: 'Show map' }))
/** The map is drawn after its code has loaded, so give it a moment. */
const drawn = () => vi.waitFor(() => expect(drawMap).toHaveBeenCalled())

const online = (on: boolean) => Object.defineProperty(navigator, 'onLine', { value: on, configurable: true })

beforeEach(() => {
  drawMap.mockClear()
  cleanup.mockClear()
  sessionStorage.clear()
  online(true)
})
afterEach(() => online(true))

describe('PlacesMap: before the map is shown', () => {
  it('lists the places with how many times and what each came to, so the information does not depend on the picture', () => {
    mount()
    const list = screen.getByRole('list', { name: 'Places in October' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(list).toHaveTextContent('Cafe')
    expect(list).toHaveTextContent('3 times')
    expect(list).toHaveTextContent('₹1,200')
    expect(list).toHaveTextContent('1 time')
    expect(list).not.toHaveTextContent('1 times')
  })

  it('shows only the five biggest places', () => {
    mount(Array.from({ length: 8 }, (_, i) => spot(`Place ${i}`, 1, 100 - i, 12 + i / 10)))
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
  })

  it('says what showing the map tells OpenStreetMap, before anything is loaded', () => {
    mount()
    expect(screen.getByText(/OpenStreetMap/)).toBeInTheDocument()
    expect(screen.getByText(/roughly which area/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: regionName })).toBeNull()
    expect(drawMap).not.toHaveBeenCalled()
  })
})

describe('PlacesMap: showing the map', () => {
  it('draws the places on a map when asked, and not before', async () => {
    mount()
    pressShow()
    await drawn()
    const region = screen.getByRole('region', { name: regionName })
    expect(drawMap).toHaveBeenCalledWith(region, spots, 'INR')
    expect(screen.queryByRole('button', { name: 'Show map' })).toBeNull()
  })

  it('tidies the map away when the screen goes', async () => {
    const { unmount } = mount()
    pressShow()
    await drawn()
    unmount()
    expect(cleanup).toHaveBeenCalled()
  })

  it('draws again, from scratch, when the places change', async () => {
    const { rerender } = mount()
    pressShow()
    await drawn()
    rerender(<PlacesMap spots={[spot('Tea', 2, 40)]} currency="INR" monthName="September" />)
    await vi.waitFor(() => expect(drawMap).toHaveBeenCalledTimes(2))
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(drawMap.mock.calls[1][1]).toEqual([spot('Tea', 2, 40)])
  })

  it('shows it straight away on the next visit in the same session', async () => {
    const first = mount()
    pressShow()
    await drawn()
    first.unmount()
    drawMap.mockClear()
    mount()
    await drawn()
    expect(screen.queryByRole('button', { name: 'Show map' })).toBeNull()
  })

  it('says the map needs a connection, rather than showing grey, when offline', () => {
    online(false)
    mount()
    pressShow()
    expect(screen.getByText('The map needs an internet connection.')).toBeInTheDocument()
    expect(drawMap).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: regionName })).toBeNull()
  })

  it('lets you try again once back online', async () => {
    online(false)
    mount()
    pressShow()
    online(true)
    pressShow()
    await drawn()
    expect(screen.queryByText('The map needs an internet connection.')).toBeNull()
  })
})
