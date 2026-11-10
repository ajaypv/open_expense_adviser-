import { useEffect } from 'react'
import { useDisplay } from '../data/display'
import type { useLedger } from '../data/useLedger'
import { formatMoney, localDateString } from '../db/money'
import { buildAiSummary } from '../insights/ai'
import { buildWidgetData, type WidgetData } from './data'
import { publishWidgetData } from './publish'
import { widgetsSupported } from './support'

type Ledger = ReturnType<typeof useLedger>

/** How long after the last change to wait before working it out, so a burst of changes is worked out once. */
export const WIDGET_DELAY_MS = 800

/** The widget's words and figures for the month in progress, in the amounts the app shows (hidden ones stay hidden). */
export function widgetDataFor(ledger: Ledger, now: Date): WidgetData {
  const money = (minor: number) => formatMoney(minor, ledger.currency)
  const summary = buildAiSummary({
    expenses: ledger.expenses, income: ledger.income, categoryById: ledger.categoryById, month: localDateString(now).slice(0, 7), today: now,
    budgetMinor: ledger.budgetMinor, recurring: ledger.recurring, currency: ledger.currency, rates: ledger.rates,
    balance: { set: ledger.balanceSet, minor: ledger.estimatedBalanceMinor }, money, dayLabel: (date) => date,
  })
  return buildWidgetData(summary, money, now)
}

/** Works out the widget's data and leaves it for the widget now. */
export const updateWidgetNow = (ledger: Ledger, now: Date = new Date()) => publishWidgetData(widgetDataFor(ledger, now))

/**
 * Keeps the widget's figures current: whenever what they come from changes (or amounts are hidden or shown), the data is
 * worked out again a moment later and left for the widget (through the service worker on Windows, straight to the home screen in the
 * Android app). Only where a widget can exist; in a phone browser it does nothing at all, so it costs nothing there.
 */
export function useWidgetSnapshot(ledger: Ledger): void {
  const { privacy } = useDisplay()
  useEffect(() => {
    if (ledger.loading || !widgetsSupported()) return
    const timer = setTimeout(() => void updateWidgetNow(ledger), WIDGET_DELAY_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the parts of the ledger it reads, not the object, which is new every time
  }, [ledger.loading, ledger.expenses, ledger.income, ledger.categoryById, ledger.budgetMinor, ledger.recurring, ledger.currency, ledger.rates, ledger.balanceSet, ledger.estimatedBalanceMinor, privacy])
}
