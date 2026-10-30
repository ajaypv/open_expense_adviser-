import { useState } from 'react'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { formatTime, from12, joinTime, minuteChoices, prefers12Hour, splitTime, to12 } from './timeParts'

interface Props {
  /** Goes on the button, so a <label htmlFor> can point at it. */
  id: string
  /** The heading of the picker that opens. */
  title: string
  /** "HH:MM" on a 24-hour clock. */
  value: string
  onChange: (value: string) => void
  /** Defaults to what this device uses. */
  hour12?: boolean
  className?: string
}

const pad = (n: number) => String(n).padStart(2, '0')

const cell =
  'flex min-h-11 items-center justify-center rounded-xl bg-surface-2 font-medium tabular-nums aria-pressed:bg-btn aria-pressed:text-btn-ink'

/**
 * A time chosen with taps on hours and minutes, in a sheet that matches the app, instead of the
 * browser's own clock popup. Nothing changes until "Set time" is pressed.
 */
export function TimeField({ id, title, value, onChange, hour12 = prefers12Hour(), className = 'min-h-12 w-40 rounded-xl bg-surface-2 px-3.5' }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => splitTime(value))
  const t = to12(draft.hour)
  const hours = hour12 ? Array.from({ length: 12 }, (_, i) => i + 1) : Array.from({ length: 24 }, (_, i) => i)

  return (
    <>
      <button
        type="button"
        id={id}
        aria-haspopup="dialog"
        onClick={() => {
          setDraft(splitTime(value))
          setOpen(true)
        }}
        className={`${className} flex items-center justify-between gap-2 text-left`}
      >
        <span className="tabular-nums">{formatTime(value, hour12)}</span>
        <span aria-hidden="true" className="shrink-0 opacity-60">
          <Icon name="chevDown" size={16} />
        </span>
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} labelledBy={`${id}-title`}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id={`${id}-title`} className="min-w-0 text-xl font-semibold">
            {title}
          </h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-surface-2">
            <Icon name="close" />
          </button>
        </div>

        <p aria-live="polite" className="py-3 text-center text-5xl font-semibold tracking-tight tabular-nums">
          {formatTime(joinTime(draft.hour, draft.minute), hour12)}
        </p>

        <p className="mb-2 mt-2 text-sm text-ink-2">Hour</p>
        <div className="grid grid-cols-6 gap-2">
          {hours.map((h) => {
            const on = hour12 ? t.hour === h : draft.hour === h
            return (
              <button
                key={h}
                type="button"
                aria-pressed={on}
                aria-label={`${h} o’clock`}
                onClick={() => setDraft((d) => ({ ...d, hour: hour12 ? from12(h, to12(d.hour).pm) : h }))}
                className={cell}
              >
                {hour12 ? h : pad(h)}
              </button>
            )
          })}
        </div>

        <p className="mb-2 mt-4 text-sm text-ink-2">Minute</p>
        <div className="grid grid-cols-6 gap-2">
          {minuteChoices(draft.minute).map((m) => (
            <button key={m} type="button" aria-pressed={draft.minute === m} aria-label={`${m} minutes`} onClick={() => setDraft((d) => ({ ...d, minute: m }))} className={cell}>
              {pad(m)}
            </button>
          ))}
        </div>

        {hour12 && (
          <div role="radiogroup" aria-label="AM or PM" className="mt-4 grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1">
            {[false, true].map((pm) => (
              <button
                key={String(pm)}
                type="button"
                role="radio"
                aria-checked={t.pm === pm}
                onClick={() => setDraft((d) => ({ ...d, hour: from12(to12(d.hour).hour, pm) }))}
                className="min-h-11 rounded-full font-medium aria-checked:bg-btn aria-checked:text-btn-ink"
              >
                {pm ? 'PM' : 'AM'}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            onChange(joinTime(draft.hour, draft.minute))
            setOpen(false)
          }}
          className="mt-5 min-h-12 w-full rounded-full bg-btn font-semibold text-btn-ink"
        >
          Set time
        </button>
      </Dialog>
    </>
  )
}
