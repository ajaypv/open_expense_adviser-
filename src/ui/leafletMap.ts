import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { formatMoney } from '../db/money'
import type { Spot } from '../insights/places'

/** OpenStreetMap's own pictures. Their usage policy asks for the credit below to be visible. */
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

/** Only a plain colour or one of the app's own colour variables goes into a pin's style. */
const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|var\(--[\w-]+\))$/

/** The pin for a place: 14 px for one visit, growing to 28 px, with the count inside once there are a few. */
const pinSize = (count: number) => 14 + Math.min(14, (count - 1) * 3)

/**
 * Draws the places on an OpenStreetMap inside `el`, and returns a function that removes it again. Leaflet is
 * only loaded when the map is asked for, so it costs nothing to anyone who never opens it. A phone is moved
 * with two fingers and the page scrolls with one, so the map never traps a scroll; the mouse wheel does not
 * zoom for the same reason, and the + and − buttons do.
 */
export function drawMap(el: HTMLElement, spots: Spot[], currency: string): () => void {
  const map = L.map(el, { dragging: !L.Browser.mobile, scrollWheelZoom: false })
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: CREDIT }).addTo(map)

  const bounds = L.latLngBounds([])
  for (const s of spots) {
    const size = pinSize(s.count)
    const color = SAFE_COLOR.test(s.color) ? s.color : 'var(--other)'
    const pin = L.divIcon({
      className: 'place-pin',
      iconSize: [size, size],
      html: `<span style="background:${color}">${s.count > 1 ? s.count : ''}</span>`,
    })

    // The popup is built from text nodes, never markup, because the name is whatever the person typed.
    const box = document.createElement('div')
    const title = document.createElement('strong')
    title.textContent = s.name
    const detail = document.createElement('div')
    detail.textContent = `${s.count} ${s.count === 1 ? 'time' : 'times'}, ${formatMoney(s.totalMinor, currency)}`
    box.append(title, detail)

    L.marker([s.lat, s.lon], { icon: pin, title: s.name, alt: s.name }).bindPopup(box).addTo(map)
    bounds.extend([s.lat, s.lon])
  }

  // Leaflet needs a view before anything else. With nothing to show, India; with one place, that street.
  if (spots.length === 0) map.setView([20.5937, 78.9629], 4)
  else if (spots.length === 1) map.setView([spots[0].lat, spots[0].lon], 16)
  else map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 })

  return () => {
    map.remove()
  }
}
