import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Icon } from '../ui/Icon'
import { eraseEverything, getPinRecord, PIN_MAX, tryUnlock } from './lock'

/**
 * Covers the whole app until the right PIN is entered. Nothing behind it is rendered, so the
 * screen has nothing to show while locked.
 */
export function LockScreen() {
  const input = useRef<HTMLInputElement>(null)
  const [pin, setPin] = useState('')
  const [length, setLength] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [waitUntil, setWaitUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [confirmErase, setConfirmErase] = useState('')

  useEffect(() => {
    void getPinRecord().then((r) => setLength(r?.length ?? null))
    input.current?.focus()
  }, [])

  // Count down while a wait is in force.
  useEffect(() => {
    if (waitUntil <= Date.now()) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [waitUntil])

  const waitingMs = Math.max(0, waitUntil - now)

  async function submit(value: string) {
    if (busy || !value || waitingMs > 0) return
    setBusy(true)
    const result = await tryUnlock(value)
    setBusy(false)
    if (result.ok) return // the app takes over once the lock state changes
    setPin('')
    if (result.reason === 'wait') {
      setWaitUntil(Date.now() + result.retryInMs)
      setNow(Date.now())
      setMessage('Too many wrong tries.')
    } else {
      setMessage(
        result.attemptsLeftBeforeWait > 0
          ? `Wrong PIN. ${result.attemptsLeftBeforeWait} ${result.attemptsLeftBeforeWait === 1 ? 'try' : 'tries'} left before a short wait.`
          : 'Wrong PIN.',
      )
    }
    input.current?.focus()
  }

  function onChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, PIN_MAX)
    setPin(digits)
    if (length !== null && digits.length === length) void submit(digits)
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="mb-6 flex size-14 items-center justify-center rounded-full bg-surface-2">
        <Icon name="lock" size={26} />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">Enter your PIN</h1>
      <p className="mt-2 text-ink-2">Your expenses are locked.</p>

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          void submit(pin)
        }}
        className="mt-6"
      >
        <label htmlFor="pin" className="sr-only">
          PIN
        </label>
        <input
          ref={input}
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={PIN_MAX}
          value={pin}
          disabled={waitingMs > 0}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby="pin-message"
          aria-invalid={message ? true : undefined}
          placeholder="••••"
          className="min-h-14 w-full rounded-2xl bg-surface-2 px-4 text-center text-3xl tracking-[0.5em] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || pin.length === 0 || waitingMs > 0}
          className="mt-3 min-h-12 w-full rounded-full bg-btn font-semibold text-btn-ink disabled:opacity-40"
        >
          Unlock
        </button>
      </form>

      <p id="pin-message" role="alert" className="mt-3 min-h-6 text-critical">
        {waitingMs > 0 ? `${message} Try again in ${Math.ceil(waitingMs / 1000)} seconds.` : message}
      </p>

      <details className="mt-8">
        <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium underline underline-offset-2">Forgot your PIN?</summary>
        <p className="mt-1 text-sm text-ink-2">
          A forgotten PIN can’t be recovered. The only way back in is to erase everything on this device, then restore from a
          backup. Type ERASE to confirm.
        </p>
        <div className="mt-3 flex gap-2">
          <label htmlFor="erase" className="sr-only">
            Type ERASE to confirm
          </label>
          <input
            id="erase"
            value={confirmErase}
            onChange={(e) => setConfirmErase(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            className="min-h-12 w-full rounded-xl bg-surface-2 shadow-[inset_0_0_0_1px_var(--edge)] px-3.5"
          />
          <button
            type="button"
            disabled={confirmErase.trim().toUpperCase() !== 'ERASE'}
            onClick={() => void eraseEverything()}
            className="min-h-12 shrink-0 rounded-full px-4 font-semibold text-critical disabled:opacity-40"
          >
            Erase all
          </button>
        </div>
      </details>
    </div>
  )
}
