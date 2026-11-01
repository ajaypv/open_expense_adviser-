import type { Category, Transaction } from '../db/schema'
import { monthOf, type MonthKey } from './aggregates'

export interface Spot {
  /** Stable for the same place, so a list can keep its rows when the amounts change. */
  key: string
  lat: number
  lon: number
  count: number
  totalMinor: number
  /** What was bought there most often, or the category when nothing was named. */
  name: string
  /** The colour of the category that most was spent on there. */
  color: string
}

/** Fixes this close (in metres) are the same place: a phone's reading wobbles by a few tens of metres. */
const SAME_PLACE_M = 75
const METRES_PER_DEGREE = 111_320

interface Cluster {
  lat: number
  lon: number
  items: Transaction[]
}

function metresBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dy = (aLat - bLat) * METRES_PER_DEGREE
  const dx = (aLon - bLon) * METRES_PER_DEGREE * Math.cos((((aLat + bLat) / 2) * Math.PI) / 180)
  return Math.hypot(dx, dy)
}

/**
 * Where the spending of a month was recorded, one spot for each place. Entries whose fixes are within about
 * 75 m of each other are one place, so a café you go to often is one spot with a count, not a heap of pins.
 * Biggest first. Entries with no location, trashed entries and anything that is not spending are left out.
 */
export function placesIn(expenses: Transaction[], month: MonthKey, categoryById: Map<number, Category>): Spot[] {
  const clusters: Cluster[] = []
  for (const t of expenses) {
    if (t.kind !== 'expense' || t.deletedAt !== undefined || !t.location || monthOf(t.date) !== month) continue
    const { lat, lon } = t.location
    const near = clusters.find((c) => metresBetween(c.lat, c.lon, lat, lon) <= SAME_PLACE_M)
    if (near) {
      near.items.push(t)
      // The spot sits in the middle of the fixes it gathered.
      near.lat = near.items.reduce((s, i) => s + i.location!.lat, 0) / near.items.length
      near.lon = near.items.reduce((s, i) => s + i.location!.lon, 0) / near.items.length
    } else {
      clusters.push({ lat, lon, items: [t] })
    }
  }

  return clusters
    .map((c): Spot => {
      const byName = new Map<string, number>()
      const byCategory = new Map<number, number>()
      let totalMinor = 0
      for (const t of c.items) {
        totalMinor += t.amountMinor
        const name = t.merchant.trim()
        if (name) byName.set(name, (byName.get(name) ?? 0) + 1)
        byCategory.set(t.categoryId, (byCategory.get(t.categoryId) ?? 0) + t.amountMinor)
      }
      const topCategory = [...byCategory].sort((a, b) => b[1] - a[1])[0][0]
      const category = categoryById.get(topCategory)
      const topName = [...byName].sort((a, b) => b[1] - a[1])[0]?.[0]
      return {
        key: `${c.lat.toFixed(4)},${c.lon.toFixed(4)}`,
        lat: c.lat,
        lon: c.lon,
        count: c.items.length,
        totalMinor,
        name: topName ?? category?.name ?? 'Spending',
        color: category?.color ?? 'var(--other)',
      }
    })
    .sort((a, b) => b.totalMinor - a.totalMinor)
}
