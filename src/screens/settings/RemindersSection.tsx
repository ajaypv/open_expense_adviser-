import { useState } from 'react'
import { notificationPermission, requestNotificationPermission, schedulePeriodicReminder, type Permission } from '../../reminders/notify'
import { setReminderPrefs, useReminderPrefs } from '../../reminders/store'
import { TimeField } from '../../ui/TimeField'
import { useToast } from '../../ui/toast'
import { card, field, Group, Status, Switch } from './parts'

const PERMISSION_TEXT: Record<Permission, string> = {
  granted: 'Notifications are allowed.',
  default: 'Notifications aren’t allowed yet. Allow them to be reminded when the app is closed.',
  denied: 'Notifications are blocked for this app. Allow them in your browser or phone settings.',
  unsupported: 'This browser can’t show notifications. Reminders will appear inside the app instead.',
}

/** Reminders to log, and alerts as a budget fills up. Both also show inside the app without any permission. */
export function RemindersSection() {
  const toast = useToast()
  const prefs = useReminderPrefs()
  const [permission, setPermission] = useState<Permission>(() => notificationPermission())
  const [scheduled, setScheduled] = useState<boolean | null>(null)
  const any = prefs.logReminder || prefs.budgetAlerts

  async function allow() {
    const result = await requestNotificationPermission()
    setPermission(result)
    if (result === 'granted') toast({ message: 'Notifications allowed' })
  }

  async function toggleLog(on: boolean) {
    await setReminderPrefs({ logReminder: on })
    // Where the browser allows it, also wake the app now and then so the reminder fires when it is closed.
    setScheduled(await schedulePeriodicReminder(on && permission === 'granted'))
  }

  return (
    <Group id="reminders-h" title="Reminders" status={<Status on={any}>{any ? 'On' : 'Off'}</Status>}>
      <div className={`${card} space-y-4 p-4`}>
        <div>
          <Switch
            label="Remind me to log"
            detail="Nudges you if nothing has been added by the time you choose."
            checked={prefs.logReminder}
            onChange={(on) => void toggleLog(on)}
          />
          {prefs.logReminder && (
            <div className="mt-2">
              <label htmlFor="remind-time" className="text-sm text-ink-2">
                Remind me at
              </label>
              <div className="mt-1.5">
                <TimeField
                  id="remind-time"
                  title="Remind me at"
                  value={prefs.logTime}
                  onChange={(logTime) => void setReminderPrefs({ logTime })}
                  className={`${field} w-44`}
                />
              </div>
            </div>
          )}
        </div>

        <Switch
          label="Budget alerts"
          detail="Tells you when you reach 80% and 100% of a budget."
          checked={prefs.budgetAlerts}
          onChange={(on) => void setReminderPrefs({ budgetAlerts: on })}
        />

        <div className="border-t border-line pt-3">
          <p className="text-sm text-ink-2">{PERMISSION_TEXT[permission]}</p>
          {permission === 'default' && (
            <button type="button" onClick={() => void allow()} className="mt-2 min-h-12 rounded-full bg-btn px-5 font-semibold text-btn-ink">
              Allow notifications
            </button>
          )}
          {prefs.logReminder && scheduled === false && permission === 'granted' && (
            <p className="mt-2 text-sm text-ink-2">
              This browser won’t wake the app while it’s closed, so the reminder shows when you open the app.
            </p>
          )}
          {any && (
            <p className="mt-2 text-sm text-ink-2">
              Phones decide when a closed app may run. If a notification doesn’t arrive, the reminder still appears on the
              Home screen, and a number shows on the app icon where supported.
            </p>
          )}
        </div>
      </div>
    </Group>
  )
}
