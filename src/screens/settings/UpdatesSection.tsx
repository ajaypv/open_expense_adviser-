import { useState } from 'react'
import type { UpdateCheck } from '../../pwa/checkForUpdate'
import { APP_BUILD, APP_BUILD_DATE, APP_VERSION } from '../../pwa/version'
import { card, Group, Status } from './parts'

const UPDATE_MESSAGES: Record<UpdateCheck | 'idle' | 'checking', string> = {
  idle: 'New versions download in the background. Check now to get the latest one.',
  checking: 'Checking for updates…',
  latest: 'You’re on the latest version.',
  available: 'A new version is ready. Updating reloads the app, and your data stays on this device.',
  offline: 'You’re offline. Connect to the internet and try again.',
  unsupported: 'Updates apply when you reload. This browser isn’t running the installed app, so there is nothing to update here.',
  error: 'Couldn’t check for updates. Try again in a moment.',
}

interface Props {
  /** A newer version has already downloaded and is waiting to take over. */
  updateReady: boolean
  onApplyUpdate: (() => void) | null
  onCheckUpdate: () => Promise<UpdateCheck>
  onShowWhatsNew: () => void
}

export function UpdatesSection({ updateReady, onApplyUpdate, onCheckUpdate, onShowWhatsNew }: Props) {
  const [update, setUpdate] = useState<UpdateCheck | 'idle' | 'checking'>('idle')
  const waiting = updateReady || update === 'available'

  async function check() {
    setUpdate('checking')
    setUpdate(await onCheckUpdate())
  }

  return (
    <Group id="update-h" title="App updates" status={waiting ? <Status on>Update ready</Status> : undefined}>
      <div className={`${card} p-4`}>
        <p className="font-medium">Version {APP_VERSION}</p>
        <p className="text-sm text-ink-2">
          Build {APP_BUILD}
          {APP_BUILD_DATE && `, ${APP_BUILD_DATE}`}
        </p>
        <p role="status" aria-live="polite" className="mt-3 text-sm text-ink-2">
          {UPDATE_MESSAGES[waiting ? 'available' : update]}
        </p>
        {waiting ? (
          <button
            type="button"
            onClick={() => (onApplyUpdate ? onApplyUpdate() : window.location.reload())}
            className="mt-3 min-h-12 w-full rounded-full bg-btn font-semibold text-btn-ink"
          >
            Update now
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void check()}
            disabled={update === 'checking'}
            className="mt-3 min-h-12 w-full rounded-full bg-surface-2 font-medium disabled:opacity-50"
          >
            {update === 'checking' ? 'Checking…' : 'Check for updates'}
          </button>
        )}
        <button type="button" onClick={onShowWhatsNew} className="mt-2 min-h-11 w-full rounded-full font-medium underline underline-offset-2">
          What’s new in this version
        </button>
      </div>
    </Group>
  )
}
