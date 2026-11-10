import { useEffect, useMemo, useRef, useState } from 'react'
import type { useLedger } from '../data/useLedger'
import { localDateString } from '../db/money'
import { inMonth, sum } from '../insights/aggregates'
import { dueRules } from '../insights/recurring'
import {
  budgetMessage,
  logReminderDue,
  newBudgetAlerts,
  pruneSent,
  shouldNotifyLog,
  strongestAlert,
} from './logic'
import { isNativeApp } from '../native/platform'
import { nativePermission, reminderTimes, setLogReminders } from './native'
import { notify, onPermissionChange, setBadge } from './notify'
import { getReminderState, saveReminderState, useReminderPrefs } from './store'

type Ledger = ReturnType<typeof useLedger>

/** Today counts as logged if something was dated today or added today. Recurring ones added for you don't count. */
function loggedOn(txs: Ledger['txs'], today: string): boolean {
  return txs.some((t) => t.source !== 'recurring' && (t.date === today || localDateString(new Date(t.createdAt)) === today))
}

/**
 * Keeps the reminders going while the app is open: the "log today" nudge, budget alerts as spending
 * crosses 80% and 100%, and the number on the app icon. Returns whether to show the nudge in the app.
 * The same rules run in the service worker for when the app is closed (Android only). Inside the Android app the phone itself
 * is asked to show the daily reminder at the chosen time, on each of the next days, which it does with the app closed.
 */
export function useReminders(ledger: Ledger, onMessage: (text: string) => void): { logNudge: boolean; dueCount: number } {
  const prefs = useReminderPrefs()
  const [now, setNow] = useState(() => new Date())
  const today = localDateString(now)

  // Re-check every minute, and straight away when the app comes back to the front.
  useEffect(() => {
    const tick = () => setNow(new Date())
    const timer = setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  // Scanned once per change to the data or the day, not on every redraw of the screen.
  const logged = useMemo(() => loggedOn(ledger.txs, today), [ledger.txs, today])
  const logNudge = prefs.loaded && logReminderDue(now, prefs, logged)
  const dueCount = dueRules(ledger.recurring, today).length

  // In the Android app: the next days' reminders, set with the phone. Planned again whenever the app is opened, something is logged
  // (which takes back today's), the time or the switch changes, or the person allows notifications.
  const [answered, setAnswered] = useState(0)
  useEffect(() => onPermissionChange(() => setAnswered((n) => n + 1)), [])
  useEffect(() => {
    if (!isNativeApp() || !prefs.loaded || ledger.loading) return
    void (async () => {
      const allowed = (await nativePermission()) === 'granted'
      await setLogReminders(prefs.logReminder && allowed ? reminderTimes(new Date(), prefs.logTime, logged) : [])
    })()
  }, [prefs.loaded, prefs.logReminder, prefs.logTime, ledger.loading, today, logged, answered])

  // System notification for the nudge, once a day. (In the Android app the one set above does this.)
  useEffect(() => {
    if (isNativeApp() || !prefs.loaded || ledger.loading || !shouldNotifyLog(now, today, prefs, logged, { lastLogNudge: null, budgetAlerts: [] })) return
    void (async () => {
      const state = await getReminderState()
      if (!shouldNotifyLog(now, today, prefs, logged, state)) return
      if (await notify('Log today’s spending', 'Nothing added today yet. It only takes a few seconds.', 'daily-reminder')) {
        await saveReminderState({ lastLogNudge: today })
      }
    })()
  }, [prefs, ledger.loading, now, today, logged])

  // The number on the app icon: things waiting for you.
  useEffect(() => {
    if (!ledger.loading) void setBadge(dueCount + (logNudge ? 1 : 0))
  }, [ledger.loading, dueCount, logNudge])

  // Budget alerts. The first pass after loading only records what is already past a threshold, so
  // opening the app never greets you with a pile of old warnings; later changes alert normally.
  const seeded = useRef(false)
  useEffect(() => {
    if (!prefs.loaded || ledger.loading) return
    void (async () => {
      const month = today.slice(0, 7)
      const state = await getReminderState()
      const sent = pruneSent(state.budgetAlerts, month)
      const monthExpenses = inMonth(ledger.expenses, month)
      const checks: { scope: string; name: string; spentMinor: number; limitMinor: number }[] = []
      if (ledger.budgetMinor !== null) checks.push({ scope: 'overall', name: 'monthly', spentMinor: sum(monthExpenses), limitMinor: ledger.budgetMinor })
      for (const [categoryId, limitMinor] of ledger.categoryBudgets) {
        const spentMinor = sum(monthExpenses.filter((t) => t.categoryId === categoryId))
        checks.push({ scope: `cat:${categoryId}`, name: ledger.categoryById.get(categoryId)?.name ?? 'category', spentMinor, limitMinor })
      }

      const fresh = checks.map((c) => ({ c, alerts: newBudgetAlerts({ month, scope: c.scope, spentMinor: c.spentMinor, limitMinor: c.limitMinor, sent }) }))
      const keys = fresh.flatMap((f) => f.alerts.map((a) => a.key))
      if (keys.length === 0 && sent.length === state.budgetAlerts.length) {
        seeded.current = true
        return
      }
      if (prefs.budgetAlerts && seeded.current) {
        for (const { c, alerts } of fresh) {
          const strongest = strongestAlert(alerts)
          if (!strongest) continue
          const msg = budgetMessage(c.name, strongest.threshold)
          onMessage(`${msg.title}: ${msg.body}`)
          void notify(msg.title, msg.body, `budget-${c.scope}`)
        }
      }
      seeded.current = true
      await saveReminderState({ budgetAlerts: [...sent, ...keys] })
    })()
  }, [prefs, ledger.loading, ledger.expenses, ledger.budgetMinor, ledger.categoryBudgets, ledger.categoryById, today, onMessage])

  return { logNudge, dueCount }
}
