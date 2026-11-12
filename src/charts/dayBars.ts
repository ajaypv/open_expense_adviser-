/**
 * How a day's spending compares with its share of the budget (1 is exactly the share). The Android Spending widget draws a day as a bar
 * by this number (src/widget/spendingArc.ts).
 */
export function dayRatio(spentMinor: number, limitMinor: number, days: number): number {
  const share = limitMinor / Math.max(days, 1)
  return share > 0 ? spentMinor / share : 0
}
