/** The shortest a day's bar is (a day with nothing spent, or a day still to come), as a share of the ring's depth. */
export const SHORTEST_BAR = 0.4

/** How a day's spending compares with its share of the budget (1 is exactly the share). */
export function dayRatio(spentMinor: number, limitMinor: number, days: number): number {
  const share = limitMinor / Math.max(days, 1)
  return share > 0 ? spentMinor / share : 0
}

/** Green for a quiet day, through amber as the day's share of the budget is used, to red beyond it (fully red from half as much again). */
export function dayColor(ratio: number): string {
  const r = Math.max(0, ratio)
  if (r <= 1) return `color-mix(in oklab, var(--warn-ui) ${Math.round(r * 100)}%, var(--good-text))`
  return `color-mix(in oklab, var(--critical) ${Math.round(Math.min((r - 1) / 0.5, 1) * 100)}%, var(--warn-ui))`
}

/** How far a bar reaches across the ring, as a share of its depth: short when little is spent, the whole depth at a day's share and beyond. */
export function dayReach(ratio: number): number {
  return SHORTEST_BAR + (1 - SHORTEST_BAR) * Math.min(Math.max(ratio, 0), 1)
}
