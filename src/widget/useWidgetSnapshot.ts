import { useEffect } from 'react'
import { useDisplay } from '../data/display'
import type { useLedger } from '../data/useLedger'
import { formatMoney, localDateString } from '../db/money'
import { buildAiSummary } from '../insights/ai'
import { buildWidgetData, type WidgetData } from './data'
import { publishTimelineData, publishWidgetData } from './publish'
import { isAndroidApp } from './native'
import { buildSpendingArc, type AndroidSpendingData } from './spendingArc'
import { buildTimelineWidgetData, type TimelineWidgetData } from './timelineData'
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

/** The Timeline widget's last days, in the amounts the app shows (hidden ones stay hidden). */
export function timelineWidgetFor(ledger: Ledger, now: Date): TimelineWidgetData {
  return buildTimelineWidgetData(ledger.expenses, (minor) => formatMoney(minor, ledger.currency), now)
}

/** The Android Spending widget's data: the Windows widget's words, and the month's day bars for its second page. */
export function androidSpendingFor(ledger: Ledger, now: Date): AndroidSpendingData {
  const money = (minor: number) => formatMoney(minor, ledger.currency)
  return { ...widgetDataFor(ledger, now), arc: buildSpendingArc(ledger.expenses, localDateString(now).slice(0, 7), now, ledger.budgetMinor, money) }
}

/** Works out the widgets' data and leaves it for them now. Returns whether the Spending widget got its figures. */
export async function updateWidgetNow(ledger: Ledger, now: Date = new Date()): Promise<boolean> {
  // The Android widgets have more to show than the Windows one, and are handed it too; Windows gets what it always did.
  const spending = isAndroidApp() ? androidSpendingFor(ledger, now) : widgetDataFor(ledger, now)
  const [published] = await Promise.all([publishWidgetData(spending), publishTimelineData(timelineWidgetFor(ledger, now))])
  return published
}

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
