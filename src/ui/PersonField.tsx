import { useId, useState, type KeyboardEvent } from 'react'
import { contactsSupported, pickContacts } from '../data/contacts'
import { addPerson } from '../db/repo'
import type { Person } from '../db/schema'
import { matchPeople, personNamed } from '../insights/people'
import { Icon } from './Icon'

interface Props {
  id: string
  /** What is typed. */
  value: string
  onChange: (name: string) => void
  /** Everyone sent to before or picked from contacts, the most recent first. */
  people: Person[]
  /** A person was chosen from the list, or from the phone's contacts. */
  onPick: (person: Person) => void
  invalid?: boolean
  describedBy?: string
}

const input = 'min-h-12 w-full min-w-0 flex-1 rounded-xl bg-surface-2 shadow-[inset_0_0_0_1px_var(--edge)] px-3.5'

/**
 * The name of the person money is sent to. As it is typed, the people already known are listed under it (the ones sent to most
 * recently first when it is empty), and a tap fills the name in. Where the browser allows it, a button opens the phone's own
 * contact picker; the person chosen there is remembered, so next time typing the first letters finds them. A name that is
 * not known yet is simply new: it is remembered when the payment is saved.
 */
export function PersonField({ id, value, onChange, people, onPick, invalid, describedBy }: Props) {
  const list = useId()
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(-1)
  const [problem, setProblem] = useState<string | null>(null)
  const exact = personNamed(people, value)
  const matches = matchPeople(people, value).filter((p) => p !== exact)
  const open = focused && matches.length > 0
  const canPick = contactsSupported()

  function pick(person: Person) {
    onPick(person)
    setActive(-1)
    setProblem(null)
  }

  async function fromContacts() {
    setProblem(null)
    try {
      const [first] = await pickContacts(false)
      if (first) pick(await addPerson(first.name, first.phone))
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Couldn’t open your contacts.')
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!open) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % matches.length : (a <= 0 ? matches.length : a) - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault() // choosing a name must not also submit the form
      pick(matches[active])
    } else if (e.key === 'Escape') {
      e.stopPropagation() // closes the list, not the whole form
      setFocused(false)
    }
  }

  return (
    <div>
      <label htmlFor={id} className="text-sm text-ink-2">
        Sent to
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={list}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${list}-${active}` : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="next"
          placeholder="Start typing a name"
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setActive(-1)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          className={input}
        />
        {canPick && (
          <button
            type="button"
            onClick={() => void fromContacts()}
            aria-label="Choose from your contacts"
            className="flex min-h-12 shrink-0 items-center gap-1.5 rounded-xl bg-surface-2 px-3.5 font-medium shadow-[inset_0_0_0_1px_var(--edge)]"
          >
            <Icon name="person" size={18} />
            Contacts
          </button>
        )}
      </div>

      {open && (
        // Held back from the input's blur, so a tap on a name lands before the list closes.
        <ul id={list} role="listbox" aria-label="People" onPointerDown={(e) => e.preventDefault()} className="mt-1.5 overflow-hidden rounded-2xl bg-surface-2 shadow-[inset_0_0_0_1px_var(--edge)]">
          {matches.map((p, i) => (
            <li key={p.id} id={`${list}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => pick(p)}
                className={`flex min-h-12 w-full items-center gap-3 px-3.5 text-left ${i === active ? 'bg-line/60' : 'active:bg-line/60'}`}
              >
                <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-ink-2">
                  <Icon name="person" size={16} />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                {p.phone && <span className="shrink-0 text-sm text-ink-2">{p.phone}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {value.trim() !== '' && !exact && !open && <p className="mt-1 text-sm text-ink-2">New person. They are remembered when you save, so next time they show up as you type.</p>}
      {problem && (
        <p role="alert" className="mt-1 text-sm text-critical">
          {problem}
        </p>
      )}
    </div>
  )
}
