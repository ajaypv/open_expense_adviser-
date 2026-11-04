import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { backUpNow } from '../../data/backupNow'
import { describeAge, getLastBackup } from '../../data/backupState'
import type { UpdateCheck } from '../../pwa/checkForUpdate'
import { APP_VERSION } from '../../pwa/version'
import { Icon, type IconName } from '../../ui/Icon'
import { useToast } from '../../ui/toast'
import { card, Status, type Ledger } from './parts'

const UPDATE_MESSAGES: Record<UpdateCheck | 'idle' | 'checking', string> = {
  idle: 'New versions download in the background. Check now to get the latest one.',
  checking: 'Checking for updates…',
  latest: 'You’re on the latest version.',
  available: 'A new version is ready. Updating reloads the app, and your data stays on this device.',
  offline: 'You’re offline. Connect to the internet and try again.',
  unsupported: 'Updates apply when you reload. This browser isn’t running the installed app, so there is nothing to update here.',
  error: 'Couldn’t check for updates. Try again in a moment.',
}

function CardHead({ icon, title, detail, status }: { icon: IconName; title: string; detail: string; status?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2">
        <Icon name={icon} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">{title}</h2>
        <p className="truncate text-sm text-ink-2">{detail}</p>
      </div>
      {status}
    </div>
  )
}

/** The one thing that matters most here, kept at the top: when the data was last copied off this device, and a button to do it. */
export function BackupCard({ ledger }: { ledger: Ledger }) {
  const toast = useToast()
  const last = useLiveQuery(getLastBackup, [])
  const empty = ledger.txs.length === 0

  async function backUp() {
    const result = await backUpNow()
    if (result === 'cancelled') return
    toast({ message: result === 'shared' ? 'Backup shared' : 'Backup saved to your downloads' })
  }

  return (
    <section aria-label="Backup" className={`${card} p-4`}>
      <CardHead
        icon="download"
        title="Backup"
        detail={empty ? 'Nothing to back up yet' : last === undefined ? ' ' : last === null ? 'Never backed up' : `Last backup ${describeAge(last)}`}
      />
      <button type="button" onClick={() => void backUp()} disabled={empty} className="mt-3 min-h-12 w-full rounded-full bg-btn font-semibold text-btn-ink disabled:opacity-40">
        Back up now
      </button>
    </section>
  )
}

interface UpdateProps {
  /** A newer version has already downloaded and is waiting to take over. */
  updateReady: boolean
  onApplyUpdate: (() => void) | null
  onCheckUpdate: () => Promise<UpdateCheck>
  onShowWhatsNew: () => void
}

/** The running version, whether there is a newer one, and the button that gets it. What's new is one small link away. */
export function UpdateCard({ updateReady, onApplyUpdate, onCheckUpdate, onShowWhatsNew }: UpdateProps) {
  const [update, setUpdate] = useState<UpdateCheck | 'idle' | 'checking'>('idle')
  const waiting = updateReady || update === 'available'

  async function check() {
    setUpdate('checking')
    setUpdate(await onCheckUpdate())
  }

  return (
    <section aria-label="App update" className={`${card} p-4`}>
      <CardHead icon="arrowUp" title="App update" detail={`Version ${APP_VERSION}`} status={waiting ? <Status on>Update ready</Status> : undefined} />
      {/* Said only once there is something to say; the standing "new versions download in the background" is not news. */}
      {(waiting || update !== 'idle') && (
        <p role="status" aria-live="polite" className="mt-3 text-sm text-ink-2">
          {UPDATE_MESSAGES[waiting ? 'available' : update]}
        </p>
      )}
      {waiting ? (
        <button type="button" onClick={() => (onApplyUpdate ? onApplyUpdate() : window.location.reload())} className="mt-3 min-h-12 w-full rounded-full bg-btn font-semibold text-btn-ink">
          Update now
        </button>
      ) : (
        <button type="button" onClick={() => void check()} disabled={update === 'checking'} className="mt-3 min-h-12 w-full rounded-full bg-surface-2 font-medium disabled:opacity-50">
          {update === 'checking' ? 'Checking…' : 'Check for updates'}
        </button>
      )}
      <button type="button" onClick={onShowWhatsNew} className="mt-1 min-h-11 w-full rounded-full text-sm font-medium underline underline-offset-2">
        What’s new in this version
      </button>
    </section>
  )
}
