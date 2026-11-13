import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { backUpNow } from '../../data/backupNow'
import { describeAge, getLastBackup } from '../../data/backupState'
import type { Backup, ImportSummary } from '../../data/importBackup'
import type { UpdateCheck } from '../../pwa/checkForUpdate'
import { APP_VERSION } from '../../pwa/version'
import { Icon, type IconName } from '../../ui/Icon'
import { useToast } from '../../ui/toast'
import { card, secondaryButton, Status, type Ledger } from './parts'

const MAX_BACKUP_BYTES = 25 * 1024 * 1024

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

/**
 * The one thing that matters most here, kept at the top: when the data was last copied off this device, a button to do it,
 * and the way back, restoring from a file saved earlier. Backup and restore live here and nowhere else in Settings.
 */
export function BackupCard({ ledger }: { ledger: Ledger }) {
  const toast = useToast()
  const picker = useRef<HTMLInputElement>(null)
  const last = useLiveQuery(getLastBackup, [])
  const empty = ledger.txs.length === 0
  const [pending, setPending] = useState<{ name: string; backup: Backup; summary: ImportSummary } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function choose(file: File | undefined) {
    setError(null)
    setPending(null)
    if (!file) return
    if (file.size > MAX_BACKUP_BYTES) {
      setError('That file is too large to be a backup.')
      return
    }
    // Loaded on demand: the validation library is only needed here, so it stays out of the main bundle.
    const { parseBackup, summarizeImport } = await import('../../data/importBackup')
    const parsed = parseBackup(await file.text())
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setPending({ name: file.name, backup: parsed.backup, summary: await summarizeImport(parsed.backup) })
  }

  async function restore(mode: 'merge' | 'replace') {
    if (!pending) return
    if (mode === 'replace' && !window.confirm('Replace everything in the app with this backup? Your current transactions will be removed.')) return
    setBusy(true)
    try {
      const { importBackup } = await import('../../data/importBackup')
      const { added, skipped } = await importBackup(pending.backup, mode)
      toast({ message: `Restored ${added} transaction${added === 1 ? '' : 's'}${skipped ? `, ${skipped} already here` : ''}` })
      setPending(null)
    } catch {
      setError('Something went wrong while restoring. Nothing was changed.')
    } finally {
      setBusy(false)
      if (picker.current) picker.current.value = ''
    }
  }

  async function backUp() {
    const result = await backUpNow()
    if (result === 'cancelled') return
    toast({ message: result === 'shared' ? 'Backup shared' : 'Backup saved to your downloads' })
  }

  return (
    <section aria-label="Backup and restore" className={`${card} p-4`}>
      <CardHead
        icon="download"
        title="Backup and restore"
        detail={empty ? 'Nothing to back up yet' : last === undefined ? ' ' : last === null ? 'Never backed up' : `Last backup ${describeAge(last)}`}
      />
      <button type="button" onClick={() => void backUp()} disabled={empty} className="mt-3 min-h-12 w-full rounded-full bg-btn font-semibold text-btn-ink disabled:opacity-40">
        Back up now
      </button>
      <button type="button" onClick={() => picker.current?.click()} className={`mt-2 w-full ${secondaryButton}`}>
        Restore from a backup
      </button>
      <input ref={picker} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-label="Backup file" onChange={(e) => void choose(e.target.files?.[0])} />

      {error && (
        <p role="alert" className="mt-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-critical">
          {error}
        </p>
      )}

      {pending && (
        <div className="mt-3 rounded-2xl bg-surface-2 p-4">
          <p className="font-semibold">{pending.name}</p>
          <p className="mt-1 text-ink-2">
            {pending.summary.total} transaction{pending.summary.total === 1 ? '' : 's'} in this file,{' '}
            {pending.summary.newCount === 0 ? 'none of them new' : `${pending.summary.newCount} new`}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void restore('merge')} className="min-h-12 rounded-full bg-btn px-5 font-semibold text-btn-ink disabled:opacity-50">
              Add what’s missing
            </button>
            <button type="button" disabled={busy} onClick={() => void restore('replace')} className="min-h-12 rounded-full bg-surface px-5 font-medium disabled:opacity-50">
              Replace everything
            </button>
            <button type="button" disabled={busy} onClick={() => setPending(null)} className="min-h-12 rounded-full px-4 font-medium">
              Cancel
            </button>
          </div>
          <p className="mt-2 text-sm text-ink-2">“Add what’s missing” keeps what you have and skips anything already here.</p>
        </div>
      )}
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
