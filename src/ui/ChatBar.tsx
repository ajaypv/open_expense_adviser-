import { memo, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { Person } from '../db/schema'
import { mentionAt } from '../ingest/mention'
import { matchPeople, personNamed } from '../insights/people'
import { Icon } from './Icon'

interface Props {
  /** Text to start with. Give the bar a new `key` to fill it from outside (e.g. an example chip). */
  initialText?: string
  /** Resolves true when the text was turned into an expense (the bar then clears). */
  onSubmit: (text: string) => Promise<boolean>
  onOpenForm: () => void
  /** The people money has been sent to, the most recent first: offered when a name is started with @. */
  people?: Person[]
}

const NO_PEOPLE: Person[] = []

/**
 * Owns the text being typed. Keeping it here, rather than in App, means a keystroke re-renders
 * only this bar and not the whole screen behind it.
 *
 * Typing @ and the first letters of a name lists the people who fit above the bar ("@shw" finds Shweta Rao); a tap fills the whole
 * name in, and the line can then go on with the amount: "@Shweta Rao 500".
 */
export const ChatBar = memo(function ChatBar({ initialText = '', onSubmit, onOpenForm, people = NO_PEOPLE }: Props) {
  const form = useRef<HTMLFormElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState(initialText)
  const [caret, setCaret] = useState(initialText.length)
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(-1)
  const [busy, setBusy] = useState(false)
  const canSend = value.trim().length > 0 && !busy
  // Where the caret goes once a chosen name is in the box. Set as soon as the text is changed, and used as it is drawn, so it does not wait for a later frame.
  const pendingCaret = useRef<number | null>(null)
  useLayoutEffect(() => {
    const at = pendingCaret.current
    if (at === null) return
    pendingCaret.current = null
    box.current?.focus()
    box.current?.setSelectionRange(at, at)
  })

  const mention = focused ? mentionAt(value, caret) : null
  const matches = mention ? matchPeople(people, mention.query).filter((p) => p !== personNamed(people, mention.query)) : []
  const open = matches.length > 0

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    const text = value.trim()
    if (!text || busy) return
    setBusy(true)
    try {
      if (await onSubmit(text)) setValue('')
    } finally {
      setBusy(false)
    }
  }

  /** Replaces the @ and what was typed after it with the whole name, and leaves the caret after it, ready for the amount. */
  function pick(person: Person) {
    if (!mention) return
    const inserted = `@${person.name} `
    const next = value.slice(0, mention.start) + inserted + value.slice(caret)
    const at = mention.start + inserted.length
    pendingCaret.current = at
    setValue(next)
    setCaret(at)
    setActive(-1)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % matches.length : (a <= 0 ? matches.length : a) - 1))
      return
    }
    if (open && e.key === 'Escape') {
      e.preventDefault()
      setFocused(false)
      return
    }
    if (open && active >= 0 && (e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
      e.preventDefault() // choosing a name must not also send the line
      pick(matches[active])
      return
    }
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    // Enter confirms a candidate for IME users (Japanese, Chinese, Korean); don't send mid-composition.
    // keyCode 229 catches Safari, which reports isComposing=false for that confirming keydown.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    form.current?.requestSubmit()
  }

  return (
    <div className="relative">
      {open && (
        // Above the bar, since the keyboard is below it. Held back from the text box's blur, so a tap on a name lands first.
        <ul
          role="listbox"
          aria-label="People"
          onPointerDown={(e) => e.preventDefault()}
          className="absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden rounded-3xl bg-surface shadow-[0_0_0_1px_var(--ring),0_8px_24px_rgb(0_0_0/0.25)]"
        >
          {matches.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => pick(p)}
                className={`flex min-h-12 w-full items-center gap-3 px-4 text-left ${i === active ? 'bg-surface-2' : 'active:bg-surface-2'}`}
              >
                <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
                  <Icon name="person" size={16} />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                {p.phone && <span className="shrink-0 text-sm text-ink-2">{p.phone}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        ref={form}
        onSubmit={(e) => void submit(e)}
        // Focus is shown by the pill's own edge getting firmer: no outline, no blur, no glow.
        className="flex items-end gap-2 rounded-[1.75rem] bg-surface p-1.5 shadow-[0_0_0_1px_var(--ring)] transition-shadow focus-within:shadow-[0_0_0_1.5px_var(--muted)]"
      >
        <button
          type="button"
          onClick={onOpenForm}
          aria-label="Add with the full form"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2"
        >
          <Icon name="plus" />
        </button>
        <label htmlFor="chat-input" className="sr-only">
          Add a transaction
        </label>
        <textarea
          ref={box}
          id="chat-input"
          rows={1}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setCaret(e.target.selectionStart)
            setActive(-1)
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          enterKeyHint="send"
          autoComplete="off"
          autoCapitalize="sentences"
          placeholder="Try “450 lunch at Cafe”"
          className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-1 py-[0.6875rem] leading-snug outline-none focus-visible:outline-none [field-sizing:content]"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-btn text-btn-ink transition-opacity disabled:opacity-30"
        >
          <Icon name="send" />
        </button>
      </form>
    </div>
  )
})
