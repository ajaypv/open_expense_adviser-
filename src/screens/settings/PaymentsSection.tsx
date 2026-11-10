import { useCallback, useEffect, useState } from 'react'
import { isNativeApp } from '../../native/platform'
import { appName, DEFAULT_APP_IDS, idsFromNative, PAYMENT_APPS, toNativeApps } from '../../payments/apps'
import { clearUnread, openAppSettings, openListenerSettings, readStatus, saveApps, type PaymentStatus } from '../../payments/native'
import { requestNotificationPermission } from '../../reminders/notify'
import { card, Group, secondaryButton, Status, Switch } from './parts'

/**
 * After you pay in a payment app, a pop-up offers to add the payment. That works by reading the notifications of the apps chosen
 * here, which the person allows by hand under Notification access. This is where they allow it, choose the apps, and see what
 * could not be read. Only in the Android app: a web page cannot read another app's notifications.
 */
export function PaymentsSection() {
  const native = isNativeApp()
  const [status, setStatus] = useState<PaymentStatus | null>(null)

  const refresh = useCallback(async () => {
    const next = await readStatus()
    setStatus(next)
    // Until the person has chosen, the usual payment apps are on (the messages app stays off until they ask for it).
    if (next && !next.configured) {
      if (await saveApps(toNativeApps(DEFAULT_APP_IDS))) setStatus(await readStatus())
    }
  }, [])

  useEffect(() => {
    if (!native) return
    void refresh()
    // Back from the phone's own Settings screens, where the permission is given.
    const onVisible = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [native, refresh])

  if (!native) {
    return (
      <Group id="payments-h" title="Payment pop-ups" status={<Status on={false}>Not on this device</Status>}>
        <div className={`${card} space-y-3 p-4`}>
          <p>In the Android app, a pop-up appears after you pay in PhonePe, Google Pay, CRED and other payment apps, offering to add the payment.</p>
          <p className="text-ink-2">A web page cannot read another app’s notifications, so this needs the Android app.</p>
        </div>
      </Group>
    )
  }

  const on = status?.listening === true && status.apps.length > 0
  const chosen = idsFromNative(status?.apps ?? [])

  async function choose(id: string, checked: boolean) {
    const ids = checked ? [...chosen, id] : chosen.filter((x) => x !== id)
    if (await saveApps(toNativeApps(ids))) setStatus(await readStatus())
  }

  async function allowNotifications() {
    await requestNotificationPermission()
    setStatus(await readStatus())
  }

  async function clear() {
    await clearUnread()
    setStatus(await readStatus())
  }

  return (
    <Group id="payments-h" title="Payment pop-ups" status={<Status on={on}>{on ? 'On' : 'Off'}</Status>}>
      <div className={`${card} space-y-4 p-4`}>
        <p>After you pay in a payment app, a pop-up offers to add it: “Add ₹250 to Swiggy?”. Add saves it; touch the pop-up to check it first.</p>
        <p className="text-sm text-ink-2">
          Only the apps you choose below are read, on this phone. Nothing is sent anywhere, and nothing is kept from other apps. You can take the
          permission away under Notification access at any time.
        </p>

        <div className="space-y-2 border-t border-line pt-3">
          <p role="status" className="font-medium">
            {status === null ? 'Checking…' : status.listening ? 'Notification access is on.' : 'Notification access is off.'}
          </p>
          {status && !status.listening && (
            <>
              <button type="button" onClick={() => void openListenerSettings()} className="min-h-12 rounded-full bg-btn px-5 font-semibold text-btn-ink">
                Turn on notification access
              </button>
              <p className="text-sm text-ink-2">
                Find Expense Tracker in the list and switch it on. If Android says it is a restricted setting, open App info, touch the three dots, choose
                Allow restricted settings, then try again.
              </p>
              <button type="button" onClick={() => void openAppSettings()} className={secondaryButton}>
                Open App info
              </button>
            </>
          )}
          {status && !status.notifications && (
            <>
              <p className="text-sm text-ink-2">The phone is not letting this app show notifications, which the pop-ups need.</p>
              <button type="button" onClick={() => void allowNotifications()} className="min-h-12 rounded-full bg-btn px-5 font-semibold text-btn-ink">
                Allow notifications
              </button>
            </>
          )}
        </div>

        <div className="space-y-1 border-t border-line pt-3">
          <p className="text-sm text-ink-2">Which apps to read</p>
          {PAYMENT_APPS.map((app) => (
            <Switch key={app.id} label={app.name} detail={app.detail} checked={chosen.includes(app.id)} disabled={status === null} onChange={(checked) => void choose(app.id, checked)} />
          ))}
        </div>

        {status && status.unread.length > 0 && (
          <div className="border-t border-line pt-3">
            <details>
              <summary className="min-h-11 cursor-pointer font-medium">
                {status.unread.length === 1 ? '1 notification' : `${status.unread.length} notifications`} could not be read
              </summary>
              <p className="mt-2 text-sm text-ink-2">These had an amount but were not worded in a way this understands. They stay on this phone until you clear them.</p>
              <ul className="mt-2 space-y-2">
                {status.unread.map((u) => (
                  <li key={`${u.package}-${u.at}`} className="rounded-xl bg-surface-2 p-3 text-sm">
                    <span className="block font-medium">{appName(u.package)}</span>
                    <span className="block break-words text-ink-2">{u.text}</span>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => void clear()} className={`mt-3 ${secondaryButton}`}>
                Clear
              </button>
            </details>
          </div>
        )}
      </div>
    </Group>
  )
}
