import { useState, type FormEvent } from 'react'
import { toMinor } from '../../db/money'
import { addAccount, deleteAccount, renameAccount, setAccountArchived, setAccountOpening } from '../../db/repo'
import type { Account } from '../../db/schema'
import { useToast } from '../../ui/toast'
import { card, dangerLink, field, Group, saveButton, secondaryButton, Status, type Ledger } from './parts'

/**
 * The balance field is deliberately never prefilled: showing the current estimate here would
 * reveal a balance the user has chosen to keep hidden on Home.
 */
function AccountRow({ account, ledger }: { account: Account; ledger: Ledger }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(account.name)
  const [balance, setBalance] = useState('')
  const [error, setError] = useState<string | null>(null)
  const set = account.openingMinor !== null
  const net = ledger.balances.get(account.id)?.netMinor ?? 0

  async function saveBalance(e: FormEvent) {
    e.preventDefault()
    const value = Number(balance.replace(/,/g, ''))
    if (balance.trim() === '' || !Number.isFinite(value)) {
      setError('Enter the balance as a number. A negative number is fine.')
      return
    }
    setError(null)
    // The user states what the account holds today; store the opening balance that makes the estimate match.
    await setAccountOpening(account.id, toMinor(value) - net)
    setBalance('')
    toast({ message: `${account.name} balance saved` })
  }

  async function saveName(e: FormEvent) {
    e.preventDefault()
    try {
      await renameAccount(account.id, name)
      toast({ message: 'Account renamed' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename')
    }
  }

  async function remove() {
    if (!window.confirm(`Delete the account “${account.name}”?`)) return
    if (!(await deleteAccount(account.id))) {
      toast({ message: 'An account with transactions can’t be deleted. Archive it instead.' })
      return
    }
    toast({ message: 'Account deleted' })
  }

  return (
    <li className="px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{account.name}</span>
          <span className="block text-sm text-ink-2">
            {account.archived ? 'Archived' : set ? 'Balance set' : 'Balance not set'}
          </span>
        </span>
        <span className="shrink-0 text-sm font-medium underline underline-offset-2">{open ? 'Close' : 'Edit'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          <form onSubmit={(e) => void saveBalance(e)}>
            <label htmlFor={`bal-${account.id}`} className="text-sm text-ink-2">
              Balance today ({ledger.currency})
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id={`bal-${account.id}`}
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="done"
                placeholder={set ? 'Enter a new balance to update it' : 'Not set'}
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                aria-invalid={error ? true : undefined}
                className={field}
              />
              <button type="submit" className={saveButton}>
                Save
              </button>
            </div>
            {set && <p className="mt-1.5 text-sm text-ink-2">Saved. For privacy it isn’t shown here.</p>}
            {set && (
              <button
                type="button"
                onClick={() => {
                  void setAccountOpening(account.id, null)
                  toast({ message: 'Balance cleared' })
                }}
                className={dangerLink}
              >
                Clear balance
              </button>
            )}
          </form>

          <form onSubmit={(e) => void saveName(e)}>
            <label htmlFor={`name-${account.id}`} className="text-sm text-ink-2">
              Name
            </label>
            <div className="mt-1.5 flex gap-2">
              <input id={`name-${account.id}`} value={name} onChange={(e) => setName(e.target.value)} className={field} />
              <button type="submit" className={saveButton}>
                Rename
              </button>
            </div>
          </form>

          {error && (
            <p role="alert" className="text-sm text-critical">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void setAccountArchived(account.id, !account.archived)}
              className={secondaryButton}
            >
              {account.archived ? 'Unarchive' : 'Archive'}
            </button>
            <button type="button" onClick={() => void remove()} className="min-h-12 rounded-full px-4 font-medium text-critical">
              Delete
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

/** Where money is kept (cash, bank, card) and what each holds today. */
export function AccountsSection({ ledger }: { ledger: Ledger }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function add(e: FormEvent) {
    e.preventDefault()
    try {
      await addAccount(name)
      setName('')
      setError(null)
      toast({ message: 'Account added' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the account')
    }
  }

  return (
    <Group
      id="accounts-h"
      title="Accounts and balance"
      hint="Tell the app what each account holds today. It then adds money you receive and subtracts money you send to estimate your balance. The total stays hidden on Home until you tap Show balance."
      status={<Status on={ledger.balanceSet}>{ledger.balanceSet ? 'Set' : 'Not set'}</Status>}
    >
      <ul className={`${card} divide-y divide-line`}>
        {ledger.accounts.map((a) => (
          <AccountRow key={a.id} account={a} ledger={ledger} />
        ))}
      </ul>
      <form onSubmit={(e) => void add(e)} className={`${card} mt-3 p-4`}>
        <label htmlFor="new-account" className="text-sm text-ink-2">
          Add an account
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="new-account"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            placeholder="Cash, HDFC card…"
            aria-invalid={error ? true : undefined}
            className={field}
          />
          <button type="submit" className={saveButton}>
            Add
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-1.5 text-sm text-critical">
            {error}
          </p>
        )}
      </form>
    </Group>
  )
}
