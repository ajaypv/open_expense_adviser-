// Building an Intl formatter is slow, so it is made once, the first time a chart needs it.
let percentFormat: Intl.NumberFormat | undefined

/** A share of the whole as a percentage to one decimal: 0.328 becomes "32.8%". */
export const formatShare = (share: number): string =>
  (percentFormat ??= new Intl.NumberFormat(undefined, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })).format(share)
