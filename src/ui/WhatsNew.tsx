import { CHANGELOG } from '../pwa/changelog'
import { Dialog } from './Dialog'

/** What changed in the newest version, in plain sentences. */
export function WhatsNew({ open, onClose }: { open: boolean; onClose: () => void }) {
  const entry = CHANGELOG[0]
  return (
    <Dialog open={open} onClose={onClose} labelledBy="whatsnew-title">
      <h2 id="whatsnew-title" className="text-xl font-semibold">
        What’s new in {entry.version}
      </h2>
      <ul className="mt-3 space-y-2.5">
        {entry.items.map((item) => (
          <li key={item} className="flex gap-2.5">
            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-2" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onClose} className="mt-5 min-h-12 w-full rounded-full bg-btn font-semibold text-btn-ink">
        Got it
      </button>
    </Dialog>
  )
}
