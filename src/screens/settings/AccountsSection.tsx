import { useState, type FormEvent } from 'react'
import { formatMoney, toMinor } from '../../db/money'
import { addAccount, addCreditCard, deleteAccount, renameAccount, setAccountArchived, setAccountOpening, updateCardDetails } from '../../db/repo'
import type { Account } from '../../db/schema'
import { isCard } from '../../insights/cards'
import { useToast } from '../../ui/toast'
import { BalanceTrail } from './BalanceTrail'
import { card as card_, cardTitle, dangerLink, field, Group, IconCircle, saveButton, secondaryButton, Status, type Ledger } from './parts'

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
  const card = isCard(account)
  // A card's limit and its two days, kept as typed until saved.
  const [limit, setLimit] = useState(account.creditLimitMinor !== undefined ? String(account.creditLimitMinor / 100) : '')
  const [statementDay, setStatementDay] = useState(account.statementDay !== undefined ? String(account.statementDay) : '')
  const [dueDay, setDueDay] = useState(account.dueDay !== undefined ? String(account.dueDay) : '')

  async function saveBalance(e: FormEvent) {
    e.preventDefault()
    const value = Number(balance.replace(/,/g, ''))
    if (balance.trim() === '' || !Number.isFinite(value)) {
      setError(card ? 'Enter what you owe as a number.' : 'Enter the balance as a number. A negative number is fine.')
      return
    }
    setError(null)
    // The user states what the account holds today (for a card, what is owed, which is minus its balance); store the opening balance that makes the estimate match.
    await setAccountOpening(account.id, toMinor(card ? -value : value) - net)
    setBalance('')
    toast({ message: card ? `${account.name}: amount owed saved` : `${account.name} balance saved` })
  }

  async function saveCard(e: FormEvent) {
    e.preventDefault()
    const number = (s: string) => (s.trim() === '' ? null : Number(s.replace(/,/g, '')))
    const limitValue = number(limit)
    const statement = number(statementDay)
    const due = number(dueDay)
    if ([limitValue, statement, due].some((n) => n !== null && !Number.isFinite(n))) {
      setError('Enter the limit and the days as numbers.')
      return
    }
    try {
      await updateCardDetails(account.id, { creditLimitMinor: limitValue === null ? null : toMinor(limitValue), statementDay: statement, dueDay: due })
      setError(null)
      toast({ message: `${account.name} saved` })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the card')
    }
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
        className="flex min-h-11 w-full items-center gap-3 text-left"
      >
        <IconCircle icon={card ? 'card' : 'bank'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{account.name}</span>
          <span className="block text-sm text-ink-2">
            {card ? 'Credit card. ' : ''}
            {account.archived ? 'Archived' : card ? (set ? 'Amount owed set' : 'Amount owed not set') : set ? 'Balance set' : 'Balance not set'}
          </span>
        </span>
        <span className="shrink-0 text-sm font-medium underline underline-offset-2">{open ? 'Close' : 'Edit'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          <form onSubmit={(e) => void saveBalance(e)}>
            <label htmlFor={`bal-${account.id}`} className="text-sm text-ink-2">
              {card ? 'Amount you owe today' : 'Balance today'} ({ledger.currency})
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id={`bal-${account.id}`}
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="done"
                placeholder={set ? (card ? 'Enter a new amount to update it' : 'Enter a new balance to update it') : 'Not set'}
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
                {card ? 'Clear amount owed' : 'Clear balance'}
              </button>
            )}
          </form>

          {card && (
            <form onSubmit={(e) => void saveCard(e)} aria-label={`${account.name} card details`}>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-3">
                  <label htmlFor={`limit-${account.id}`} className="text-sm text-ink-2">
                    Credit limit ({ledger.currency})
                  </label>
                  <input id={`limit-${account.id}`} inputMode="decimal" autoComplete="off" placeholder="Optional" value={limit} onChange={(e) => setLimit(e.target.value)} className={`${field} mt-1.5`} />
                </div>
                <div className="col-span-3 min-[26rem]:col-span-1">
                  <label htmlFor={`stmt-${account.id}`} className="text-sm text-ink-2">
                    Statement day
                  </label>
                  <input id={`stmt-${account.id}`} inputMode="numeric" autoComplete="off" placeholder="1 to 28" value={statementDay} onChange={(e) => setStatementDay(e.target.value)} className={`${field} mt-1.5`} />
                </div>
                <div className="col-span-3 min-[26rem]:col-span-1">
                  <label htmlFor={`due-${account.id}`} className="text-sm text-ink-2">
                    Due day
                  </label>
                  <input id={`due-${account.id}`} inputMode="numeric" autoComplete="off" placeholder="1 to 28" value={dueDay} onChange={(e) => setDueDay(e.target.value)} className={`${field} mt-1.5`} />
                </div>
                <div className="col-span-3 flex items-end min-[26rem]:col-span-1">
                  <button type="submit" className={`${saveButton} w-full`}>
                    Save card
                  </button>
                </div>
              </div>
              <p className="mt-1.5 text-sm text-ink-2">
                {account.creditLimitMinor !== undefined ? `Limit ${formatMoney(account.creditLimitMinor, ledger.currency)}. ` : ''}
                The statement day is when your bill is made; the due day is when it must be paid.
              </p>
            </form>
          )}

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
  // The card being added: its name, limit, the two days and what is owed already, kept as typed.
  const [card, setCard] = useState({ name: '', limit: '', statement: '', due: '', owed: '' })
  const [cardError, setCardError] = useState<string | null>(null)

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

  async function addCard(e: FormEvent) {
    e.preventDefault()
    const number = (s: string) => (s.trim() === '' ? null : Number(s.replace(/,/g, '')))
    const [limit, statement, due, owed] = [number(card.limit), number(card.statement), number(card.due), number(card.owed)]
    if ([limit, statement, due, owed].some((n) => n !== null && !Number.isFinite(n))) {
      setCardError('Enter the amounts and the days as numbers.')
      return
    }
    try {
      await addCreditCard(card.name, { creditLimitMinor: limit === null ? null : toMinor(limit), statementDay: statement, dueDay: due }, owed === null ? null : toMinor(owed))
      setCard({ name: '', limit: '', statement: '', due: '', owed: '' })
      setCardError(null)
      toast({ message: 'Credit card added' })
    } catch (err) {
      setCardError(err instanceof Error ? err.message : 'Could not add the card')
    }
  }

  return (
    <Group
      id="accounts-h"
      title="Accounts and balance"
      hint="What each account holds today. The total stays hidden on Home until you tap Show balance."
      more={<p>Tell the app what each account holds today. It then adds money you receive and subtracts money you send to estimate your balance.</p>}
      status={<Status on={ledger.balanceSet}>{ledger.balanceSet ? 'Set' : 'Not set'}</Status>}
    >
      <ul className={`${card_} divide-y divide-line`}>
        {ledger.accounts.map((a) => (
          <AccountRow key={a.id} account={a} ledger={ledger} />
        ))}
      </ul>
      <BalanceTrail ledger={ledger} />
      <form onSubmit={(e) => void add(e)} className={`${card_} mt-3 p-4`}>
        <label htmlFor="new-account" className={cardTitle}>
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

      <form onSubmit={(e) => void addCard(e)} aria-label="Add a credit card" className={`${card_} mt-3 p-4`}>
        <p className={cardTitle}>Add a credit card</p>
        <p className="mt-0.5 text-sm text-ink-2">What you spend on a card is owed until you pay the bill, so it stays out of your balance.</p>
        <label htmlFor="new-card" className="mt-3 block text-sm text-ink-2">
          Card name
        </label>
        <input id="new-card" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} autoComplete="off" placeholder="HDFC card" className={`${field} mt-1.5`} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="new-card-limit" className="text-sm text-ink-2">
              Credit limit
            </label>
            <input id="new-card-limit" inputMode="decimal" autoComplete="off" placeholder="Optional" value={card.limit} onChange={(e) => setCard({ ...card, limit: e.target.value })} className={`${field} mt-1.5`} />
          </div>
          <div>
            <label htmlFor="new-card-owed" className="text-sm text-ink-2">
              You owe now
            </label>
            <input id="new-card-owed" inputMode="decimal" autoComplete="off" placeholder="Optional" value={card.owed} onChange={(e) => setCard({ ...card, owed: e.target.value })} className={`${field} mt-1.5`} />
          </div>
          <div>
            <label htmlFor="new-card-statement" className="text-sm text-ink-2">
              Statement day
            </label>
            <input id="new-card-statement" inputMode="numeric" autoComplete="off" placeholder="1 to 28" value={card.statement} onChange={(e) => setCard({ ...card, statement: e.target.value })} className={`${field} mt-1.5`} />
          </div>
          <div>
            <label htmlFor="new-card-due" className="text-sm text-ink-2">
              Due day
            </label>
            <input id="new-card-due" inputMode="numeric" autoComplete="off" placeholder="1 to 28" value={card.due} onChange={(e) => setCard({ ...card, due: e.target.value })} className={`${field} mt-1.5`} />
          </div>
        </div>
        <button type="submit" className={`${saveButton} mt-3`}>
          Add card
        </button>
        {cardError && (
          <p role="alert" className="mt-1.5 text-sm text-critical">
            {cardError}
          </p>
        )}
      </form>
    </Group>
  )
}
