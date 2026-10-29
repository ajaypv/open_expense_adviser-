import { useState } from 'react'
import { usePwa } from '../pwa/usePwa'

/** One slim line at the top for: a waiting update, the install offer, or the iOS install hint. */
export function PwaBanner({ pwa }: { pwa: ReturnType<typeof usePwa> }) {
  const [dismissed, setDismissed] = useState(false)

  let message: string | null = null
  let action: { label: string; run: () => void } | null = null
  if (pwa.updateReady) {
    message = 'A new version is ready.'
    action = { label: 'Reload', run: () => pwa.applyUpdate?.() }
  } else if (!dismissed && pwa.canInstall) {
    message = 'Install the app to use it offline from your home screen.'
    action = { label: 'Install', run: () => void pwa.install() }
  } else if (!dismissed && pwa.showIosHint) {
    message = 'To install, tap Share, then Add to Home Screen.'
  }
  if (!message) return null

  return (
    <div className="mx-3 mt-2 flex items-center gap-2 rounded-2xl bg-surface-2 py-1 pl-4 pr-1 text-[0.9375rem]">
      <p className="flex-1 py-2">{message}</p>
      {action && (
        <button type="button" onClick={action.run} className="min-h-11 rounded-xl px-3 font-semibold underline underline-offset-2">
          {action.label}
        </button>
      )}
      {!pwa.updateReady && (
        <button type="button" onClick={() => setDismissed(true)} className="min-h-11 rounded-xl px-3 text-ink-2">
          Not now
        </button>
      )}
    </div>
  )
}
