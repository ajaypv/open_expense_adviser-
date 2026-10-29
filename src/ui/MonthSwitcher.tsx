import { monthLabel, shiftMonth, type MonthKey } from '../insights/aggregates'
import { Icon } from './Icon'

interface Props {
  month: MonthKey
  currentMonth: MonthKey
  onChange: (month: MonthKey) => void
}

export function MonthSwitcher({ month, currentMonth, onChange }: Props) {
  const atCurrent = month >= currentMonth
  return (
    <div className="flex items-center justify-between py-1">
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, -1))}
        aria-label="Previous month"
        className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2"
      >
        <Icon name="chevLeft" />
      </button>
      <button
        type="button"
        onClick={() => onChange(currentMonth)}
        disabled={atCurrent}
        aria-label={atCurrent ? monthLabel(month) : `${monthLabel(month)}. Go to this month`}
        className="min-h-11 rounded-full px-3 font-medium disabled:cursor-default"
      >
        {monthLabel(month)}
      </button>
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, 1))}
        disabled={atCurrent}
        aria-label="Next month"
        className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2 disabled:opacity-30"
      >
        <Icon name="chevRight" />
      </button>
    </div>
  )
}
