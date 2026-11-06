/** The colour of the part of a budget meter that is not used. */
export const BUDGET_SKY = 'color-mix(in oklab, var(--accent) 16%, var(--surface))'

/** How a budget reads at a given share spent: the blue accent while fine, amber near the limit (80%), red once it is passed. */
export function budgetTone(ratio: number): { over: boolean; close: boolean; fill: string } {
  const over = ratio >= 1
  const close = ratio >= 0.8 && !over
  return { over, close, fill: over ? 'var(--critical)' : close ? 'var(--warn-ui)' : 'var(--accent)' }
}
