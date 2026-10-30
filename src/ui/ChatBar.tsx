import { memo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Icon } from './Icon'

interface Props {
  /** Text to start with. Give the bar a new `key` to fill it from outside (e.g. an example chip). */
  initialText?: string
  /** Resolves true when the text was turned into an expense (the bar then clears). */
  onSubmit: (text: string) => Promise<boolean>
  onOpenForm: () => void
}

/**
 * Owns the text being typed. Keeping it here, rather than in App, means a keystroke re-renders
 * only this bar and not the whole screen behind it.
 */
export const ChatBar = memo(function ChatBar({ initialText = '', onSubmit, onOpenForm }: Props) {
  const form = useRef<HTMLFormElement>(null)
  const [value, setValue] = useState(initialText)
  const [busy, setBusy] = useState(false)
  const canSend = value.trim().length > 0 && !busy

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

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    // Enter confirms a candidate for IME users (Japanese, Chinese, Korean); don't send mid-composition.
    // keyCode 229 catches Safari, which reports isComposing=false for that confirming keydown.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    form.current?.requestSubmit()
  }

  return (
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
        id="chat-input"
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
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
  )
})
