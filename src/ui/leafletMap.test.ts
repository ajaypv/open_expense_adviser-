// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import type { Spot } from '../insights/places'
import { drawMap, TILE_URL } from './leafletMap'

const spot = (name: string, count: number, rupees: number, lat: number): Spot => ({
  key: `${lat},77.59`, lat, lon: 77.59, count, totalMinor: rupees * 100, name, color: 'var(--s1)',
})

let host: HTMLElement
const mount = () => {
  host = document.createElement('div')
  document.body.append(host)
  return host
}
afterEach(() => host?.remove())

describe('drawMap', () => {
  it('uses OpenStreetMap pictures and credits them', () => {
    expect(TILE_URL).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png')
    const stop = drawMap(mount(), [spot('Cafe', 3, 1200, 12.97)], 'INR')
    const credit = host.querySelector('.leaflet-control-attribution')!
    expect(credit.textContent).toContain('OpenStreetMap')
    const link = [...credit.querySelectorAll('a')].find((a) => a.textContent === 'OpenStreetMap')
    expect(link?.getAttribute('href')).toBe('https://www.openstreetmap.org/copyright')
    stop()
  })

  it('puts one pin on the map for each place, bigger for more visits', () => {
    const stop = drawMap(mount(), [spot('Cafe', 6, 1200, 12.97), spot('Uber', 1, 230, 13.1)], 'INR')
    const pins = [...host.querySelectorAll<HTMLElement>('.place-pin')]
    expect(pins).toHaveLength(2)
    const size = (el: HTMLElement) => parseInt(el.style.width, 10)
    expect(size(pins[0])).toBeGreaterThan(size(pins[1]))
    stop()
  })

  it('colours a pin with its category colour and labels the busy ones with a count', () => {
    const stop = drawMap(mount(), [spot('Cafe', 6, 1200, 12.97), spot('Uber', 1, 230, 13.1)], 'INR')
    const pins = [...host.querySelectorAll<HTMLElement>('.place-pin')]
    expect(pins[0].innerHTML).toContain('var(--s1)')
    expect(pins[0].textContent).toBe('6')
    expect(pins[1].textContent).toBe('')
    stop()
  })

  it('shows what was spent when a pin is tapped, as plain text', () => {
    const stop = drawMap(mount(), [spot('<img src=x onerror=alert(1)>', 2, 500, 12.97)], 'INR')
    host.querySelector<HTMLElement>('.place-pin')!.click()
    const popup = host.querySelector('.leaflet-popup-content')!
    expect(popup.textContent).toContain('<img src=x onerror=alert(1)>')
    expect(popup.textContent).toContain('2 times')
    expect(popup.textContent).toContain('₹500')
    expect(popup.querySelector('img')).toBeNull()
    stop()
  })

  it('copes with one place, many places and none', () => {
    expect(() => drawMap(mount(), [spot('Cafe', 1, 100, 12.97)], 'INR')()).not.toThrow()
    expect(() => drawMap(mount(), Array.from({ length: 30 }, (_, i) => spot(`P${i}`, 1, 10, 12 + i / 50)), 'INR')()).not.toThrow()
    expect(() => drawMap(mount(), [], 'INR')()).not.toThrow()
  })

  it('removes the map when stopped, so the same place can be drawn on again', () => {
    const stop = drawMap(mount(), [spot('Cafe', 1, 100, 12.97)], 'INR')
    expect(host.querySelectorAll('.place-pin')).toHaveLength(1)
    stop()
    expect(host.querySelector('.place-pin')).toBeNull()
    // Leaflet refuses a second map on an element that still holds the first.
    const again = drawMap(host, [spot('Cafe', 1, 100, 12.97), spot('Uber', 1, 50, 13.1)], 'INR')
    expect(host.querySelectorAll('.place-pin')).toHaveLength(2)
    again()
  })
})
