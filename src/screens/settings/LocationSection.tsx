import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { clearAllLocations, getPlace, permissionState, setRecordLocation } from '../../data/location'
import { db } from '../../db/schema'
import { useToast } from '../../ui/toast'
import { card, dangerLink, Group, Status, Switch, type Ledger } from './parts'

const LOCATION_PROBLEMS = {
  denied: 'Location is blocked for this app. Allow it in your browser or phone settings, then try again.',
  unavailable: 'Your device could not find its location. Check that location is turned on, then try again.',
  timeout: 'Finding your location took too long. Try again in a moment.',
  unsupported: 'This browser can’t share its location.',
} as const

export function LocationSection({ ledger }: { ledger: Ledger }) {
  const toast = useToast()
  const on = useLiveQuery(async () => (await db.settings.get('recordLocation'))?.value === true, []) ?? false
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)
  const withLocation = ledger.txs.filter((t) => t.location).length

  // The user can switch location off in the browser later; say so instead of silently saving nothing.
  useEffect(() => {
    if (!on) return
    void permissionState().then((s) => setBlocked(s === 'denied'))
  }, [on])

  async function toggle(next: boolean) {
    setError(null)
    if (!next) {
      await setRecordLocation(false)
      return
    }
    // Asking from this tap is what makes the browser show its permission prompt.
    setLocating(true)
    const result = await getPlace(10_000)
    setLocating(false)
    if (!result.ok) {
      setError(LOCATION_PROBLEMS[result.reason])
      return
    }
    setBlocked(false)
    await setRecordLocation(true)
    toast({ message: 'Location will be saved with new transactions' })
  }

  async function remove() {
    if (!window.confirm(`Remove the saved location from ${withLocation} transaction${withLocation === 1 ? '' : 's'}?`)) return
    const n = await clearAllLocations()
    toast({ message: `Removed location from ${n} transaction${n === 1 ? '' : 's'}` })
  }

  return (
    <Group id="location-h" title="Location" status={<Status on={on}>{on ? 'On' : 'Off'}</Status>}>
      <div className={`${card} p-4`}>
        <Switch
          label="Save where I add transactions"
          checked={on}
          disabled={locating}
          describedBy="location-note"
          onChange={(v) => void toggle(v)}
        />
        <p id="location-note" className="mt-2 text-sm text-ink-2">
          {locating
            ? 'Asking for your location…'
            : 'Off by default. When on, new transactions get your approximate position, rounded to about 10 metres. It stays on this device and is never sent anywhere. It also lets suggestions favour places you are near.'}
        </p>
        {error && (
          <p role="alert" className="mt-2 text-sm text-critical">
            {error}
          </p>
        )}
        {on && blocked && (
          <p role="alert" className="mt-2 text-sm text-critical">
            {LOCATION_PROBLEMS.denied} Nothing is being saved until then.
          </p>
        )}
        {withLocation > 0 && (
          <button type="button" onClick={() => void remove()} className={dangerLink}>
            Remove location from {withLocation} transaction{withLocation === 1 ? '' : 's'}
          </button>
        )}
      </div>
    </Group>
  )
}
