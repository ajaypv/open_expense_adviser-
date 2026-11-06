import { useState, type FormEvent } from 'react'
import { contactsSupported, pickContacts } from '../../data/contacts'
import { formatMoney, parseLocalDate } from '../../db/money'
import { addPeople, addPerson, deletePerson, setDelivery } from '../../db/repo'
import { pendingTotal, type PersonStat } from '../../insights/people'
import { Icon } from '../../ui/Icon'
import { useToast } from '../../ui/toast'
import { card, field, Group, saveButton, secondaryButton, Status, type Ledger } from './parts'

let dayFormat: Intl.DateTimeFormat | undefined
const shortDay = (date: string) => (dayFormat ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })).format(parseLocalDate(date))

function PersonRow({ stat, currency }: { stat: PersonStat; currency: string }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const { person } = stat
  const money = (minor: number) => formatMoney(minor, currency)

  function markReceived(ids: number[]) {
    void Promise.all(ids.map((id) => setDelivery(id, 'received'))).then(() =>
      toast({
        message: ids.length === 1 ? `Marked received by ${person.name}` : `Marked ${ids.length} payments received by ${person.name}`,
        actionLabel: 'Undo',
        onAction: () => void Promise.all(ids.map((id) => setDelivery(id, 'sent'))),
        icon: 'check',
      }),
    )
  }

  async function remove() {
    if (!window.confirm(`Remove ${person.name} from your people? Payments already sent to them stay in your history.`)) return
    await deletePerson(person.id)
    toast({ message: `${person.name} removed` })
  }

  return (
    <li className="px-4 py-3">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-12 w-full items-center gap-3 text-left">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
          <Icon name="person" size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{person.name}</span>
          <span className="block text-sm text-ink-2">
            {stat.count === 0 ? 'Nothing sent yet' : `${money(stat.sentMinor)} sent in ${stat.count} ${stat.count === 1 ? 'payment' : 'payments'}`}
          </span>
        </span>
        {stat.pendingCount > 0 && (
          <span className="shrink-0 rounded-full px-2.5 py-1 text-sm font-medium shadow-[inset_0_0_0_1px_var(--warn-ui)]">{`${money(stat.pendingMinor)} not received`}</span>
        )}
        <span aria-hidden="true" className={`shrink-0 text-ink-2 transition-transform ${open ? 'rotate-180' : ''}`}>
          <Icon name="chevDown" size={18} />
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {person.phone && <p className="text-sm text-ink-2">{person.phone}</p>}
          {stat.pending.length > 0 ? (
            <ul aria-label={`Payments to ${person.name} not received yet`} className="divide-y divide-line rounded-2xl bg-surface-2 px-3">
              {stat.pending.map((t) => (
                <li key={t.id} className="flex min-h-12 items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium tabular-nums">{money(t.amountMinor)}</span>
                    <span className="block text-sm text-ink-2">{`Sent ${shortDay(t.date)}`}</span>
                  </span>
                  <button type="button" onClick={() => markReceived([t.id])} className="min-h-11 shrink-0 rounded-full bg-btn px-4 text-sm font-semibold text-btn-ink">
                    Mark received
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            stat.count > 0 && <p className="text-sm text-ink-2">Everything sent to {person.name} has been received.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {stat.pending.length > 1 && (
              <button type="button" onClick={() => markReceived(stat.pending.map((t) => t.id))} className={secondaryButton}>
                Mark all received
              </button>
            )}
            <button type="button" onClick={() => void remove()} className="min-h-12 rounded-full px-4 font-medium text-critical">
              Remove
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

/**
 * The people money is sent to: what has gone to each, and which payments have not been received yet, each with a button to
 * say it has. People are added here from the phone's contacts (where the browser lets the person choose them), by typing a
 * name, or just by sending someone money, and are then offered as the name is typed.
 */
export function PeopleSection({ ledger }: { ledger: Ledger }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const canPick = contactsSupported()
  const waiting = pendingTotal(ledger.personStats)

  async function add(e: FormEvent) {
    e.preventDefault()
    try {
      const person = await addPerson(name)
      setName('')
      setError(null)
      toast({ message: `${person.name} added`, icon: 'person' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add them')
    }
  }

  async function fromContacts() {
    setError(null)
    try {
      const picked = await pickContacts(true)
      if (picked.length === 0) return
      const added = await addPeople(picked)
      toast({ message: added === 0 ? 'They are already in your people' : `Added ${added} ${added === 1 ? 'person' : 'people'}`, icon: 'person' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t open your contacts')
    }
  }

  return (
    <Group
      id="people-h"
      title="People"
      hint="Everyone you send money to. When you add a payment to a person, their name shows up as you type. Mark a payment Received once they have it."
      status={<Status on={waiting.count === 0 && ledger.personStats.some((s) => s.count > 0)}>{waiting.count > 0 ? `${waiting.count} not received` : 'All received'}</Status>}
    >
      {waiting.count > 0 && (
        <p className={`${card} mb-3 px-4 py-3`}>
          <span className="font-semibold tabular-nums">{formatMoney(waiting.minor, ledger.currency)}</span>
          <span className="text-ink-2">{` sent across ${waiting.count} ${waiting.count === 1 ? 'payment' : 'payments'} and not received yet.`}</span>
        </p>
      )}

      {ledger.personStats.length > 0 && (
        <ul className={`${card} divide-y divide-line`}>
          {ledger.personStats.map((s) => (
            <PersonRow key={s.person.id} stat={s} currency={ledger.currency} />
          ))}
        </ul>
      )}

      <form onSubmit={(e) => void add(e)} className={`${card} mt-3 p-4`}>
        <label htmlFor="new-person" className="text-sm text-ink-2">
          Add a person
        </label>
        <div className="mt-1.5 flex gap-2">
          <input id="new-person" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoCapitalize="words" placeholder="Name" aria-invalid={error ? true : undefined} className={field} />
          <button type="submit" className={saveButton}>
            Add
          </button>
        </div>
        {canPick ? (
          <button type="button" onClick={() => void fromContacts()} className={`${secondaryButton} mt-3 inline-flex items-center gap-2`}>
            <Icon name="person" size={18} />
            Add from contacts
          </button>
        ) : (
          <p className="mt-2 text-sm text-ink-2">This browser can’t open your contacts. Type a name here, or when you send money; they are remembered.</p>
        )}
        {canPick && <p className="mt-2 text-sm text-ink-2">You choose who to add. The app never reads your contacts on its own, and keeps only the names and numbers you pick, on this device.</p>}
        {error && (
          <p role="alert" className="mt-1.5 text-sm text-critical">
            {error}
          </p>
        )}
      </form>
    </Group>
  )
}
