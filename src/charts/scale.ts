/** Rounds up to a tidy axis maximum (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10 × a power of ten). */
export function niceCeil(value: number): number {
  const power = 10 ** Math.floor(Math.log10(value))
  const m = value / power
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => m <= s) ?? 10
  return step * power
}
