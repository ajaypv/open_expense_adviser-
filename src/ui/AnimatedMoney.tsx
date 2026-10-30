import { formatMoney, formatMoneyCompact } from '../db/money'
import { useCountUp } from './motion'

interface Props {
  minor: number
  currency: string
  /** Names the figure, so it counts from what it last showed rather than from zero. */
  id: string
  /** The short form, such as ₹12.5K. */
  compact?: boolean
}

/** An amount that counts up to its value. While it counts it shows whole units, so no decimals flicker. */
export function AnimatedMoney({ minor, currency, id, compact }: Props) {
  const value = useCountUp(minor, id)
  const shown = value === minor ? minor : Math.round(value / 100) * 100
  return <>{compact ? formatMoneyCompact(shown, currency) : formatMoney(shown, currency)}</>
}
