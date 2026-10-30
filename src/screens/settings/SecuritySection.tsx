import { useState, type FormEvent } from 'react'
import {
  changePin,
  disableLock,
  enableLock,
  getPinRecord,
  lockNow,
  PIN_MAX,
  PIN_MIN,
  setAutoLockSeconds,
  useLockState,
  validPin,
  verifyPin,
} from '../../security/lock'
import { PickerField } from '../../ui/PickerField'
import { useToast } from '../../ui/toast'
import { card, dangerLink, field, Group, saveButton, secondaryButton, Status } from './parts'

const AUTO_LOCK_OPTIONS = [
  { value: 0, label: 'Right away', detail: 'As soon as you leave the app' },
  { value: 60, label: 'After 1 minute', detail: 'If you are away for a minute or more' },
  { value: 300, label: 'After 5 minutes', detail: 'If you are away for five minutes or more' },
]

type Mode = 'idle' | 'setup' | 'change' | 'disable'

const pinField = `${field} tracking-[0.3em]`
const pinProps = { type: 'password', inputMode: 'numeric', autoComplete: 'off', maxLength: PIN_MAX } as const

/** Turn the PIN lock on or off, change the PIN, and choose when it locks. */
export function SecuritySection() {
  const toast = useToast()
  const lock = useLockState()
  const [mode, setMode] = useState<Mode>('idle')
  const [current, setCurrent] = useState('')
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [after, setAfter] = useState(60)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setMode('idle')
    setCurrent('')
    setPin('')
    setAgain('')
    setError(null)
  }

  /** Changing or removing the lock needs the current PIN, so someone holding an unlocked phone can't. */
  async function checkCurrent(): Promise<boolean> {
    const record = await getPinRecord()
    if (record && (await verifyPin(current, record))) return true
    setError('That isn’t your current PIN.')
    return false
  }

  function checkNew(): boolean {
    if (!validPin(pin)) {
      setError(`Use ${PIN_MIN} to ${PIN_MAX} digits.`)
      return false
    }
    if (pin !== again) {
      setError('The two PINs don’t match.')
      return false
    }
    return true
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (mode === 'setup') {
      if (!checkNew()) return
      await enableLock(pin, after)
      toast({ message: 'App lock is on' })
    } else if (mode === 'change') {
      if (!(await checkCurrent()) || !checkNew()) return
      await changePin(pin)
      toast({ message: 'PIN changed' })
    } else if (mode === 'disable') {
      if (!(await checkCurrent())) return
      await disableLock()
      toast({ message: 'App lock is off' })
    }
    reset()
  }

  return (
    <Group
      id="security-h"
      title="App lock"
      status={<Status on={lock.enabled}>{lock.enabled ? 'On' : 'Off'}</Status>}
      hint="Asks for a PIN when the app opens or comes back from the background. It keeps other people out of the app, but it does not encrypt the data stored on this device."
    >
      <div className={`${card} p-4`}>
        {mode === 'idle' && !lock.enabled && (
          <button type="button" onClick={() => setMode('setup')} className={`${saveButton} w-full`}>
            Set a PIN
          </button>
        )}

        {mode === 'idle' && lock.enabled && (
          <div className="space-y-3">
            <div>
              <label htmlFor="auto-lock" className="text-sm text-ink-2">
                Lock when I’m away
              </label>
              <div className="mt-1.5">
                <PickerField
                  id="auto-lock"
                  title="Lock when I’m away"
                  value={lock.autoLockSeconds}
                  options={AUTO_LOCK_OPTIONS}
                  onChange={setAutoLockSeconds}
                  className={field}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={lockNow} className={secondaryButton}>
                Lock now
              </button>
              <button type="button" onClick={() => setMode('change')} className={secondaryButton}>
                Change PIN
              </button>
            </div>
            <button type="button" onClick={() => setMode('disable')} className={dangerLink}>
              Turn off app lock
            </button>
          </div>
        )}

        {mode !== 'idle' && (
          <form onSubmit={(e) => void submit(e)} className="space-y-3">
            {(mode === 'change' || mode === 'disable') && (
              <div>
                <label htmlFor="pin-current" className="text-sm text-ink-2">
                  Current PIN
                </label>
                <input id="pin-current" {...pinProps} value={current} onChange={(e) => setCurrent(e.target.value)} className={`${pinField} mt-1.5`} />
              </div>
            )}
            {mode !== 'disable' && (
              <>
                <div>
                  <label htmlFor="pin-new" className="text-sm text-ink-2">
                    {mode === 'change' ? 'New PIN' : 'Choose a PIN'} ({PIN_MIN} to {PIN_MAX} digits)
                  </label>
                  <input id="pin-new" {...pinProps} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} className={`${pinField} mt-1.5`} />
                </div>
                <div>
                  <label htmlFor="pin-again" className="text-sm text-ink-2">
                    Enter it again
                  </label>
                  <input id="pin-again" {...pinProps} value={again} onChange={(e) => setAgain(e.target.value.replace(/\D/g, ''))} className={`${pinField} mt-1.5`} />
                </div>
              </>
            )}
            {mode === 'setup' && (
              <div>
                <label htmlFor="pin-after" className="text-sm text-ink-2">
                  Lock when I’m away
                </label>
                <div className="mt-1.5">
                  <PickerField id="pin-after" title="Lock when I’m away" value={after} options={AUTO_LOCK_OPTIONS} onChange={setAfter} className={field} />
                </div>
              </div>
            )}
            {mode === 'setup' && (
              <p className="text-sm text-ink-2">
                A forgotten PIN can’t be recovered. The only way back in is to erase the app’s data and restore from a backup,
                so back up first.
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-critical">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button type="submit" className={`${saveButton} flex-1`}>
                {mode === 'disable' ? 'Turn off' : mode === 'change' ? 'Change PIN' : 'Turn on'}
              </button>
              <button type="button" onClick={reset} className={secondaryButton}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </Group>
  )
}
