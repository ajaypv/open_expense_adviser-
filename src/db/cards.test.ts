import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(async () => {
  await Dexie.delete('expense-tracker')
  vi.resetModules()
})

async function load() {
  const [{ db }, repo, { buildLedger }] = await Promise.all([import('./schema'), import('./repo'), import('../data/buildLedger')])
  await db.open()
  return { db, buildLedger, ...repo }
}

describe('addCreditCard', () => {
  it('makes an account of kind credit, with its limit and days, owing nothing to begin with', async () => {
    const { db, addCreditCard } = await load()
    const id = await addCreditCard('  HDFC card ', { creditLimitMinor: 500_000, statementDay: 15, dueDay: 3 })
    expect(await db.accounts.get(id)).toMatchObject({ name: 'HDFC card', type: 'credit', creditLimitMinor: 500_000, statementDay: 15, dueDay: 3, openingMinor: null })
  })

  it('stores what is owed already as a negative opening balance, so the balance is minus what is owed', async () => {
    const { db, addCreditCard } = await load()
    const id = await addCreditCard('Amex', {}, 123_400)
    const card = (await db.accounts.get(id))!
    expect(card.openingMinor).toBe(-123_400)
    expect(card.creditLimitMinor).toBeUndefined()
    expect('statementDay' in card).toBe(false)
  })

  it('refuses an empty name, a day outside 1 to 28, a bad limit and a negative amount owed', async () => {
    const { addCreditCard } = await load()
    await expect(addCreditCard('   ')).rejects.toThrow('Give the card a name')
    await expect(addCreditCard('A', { statementDay: 0 })).rejects.toThrow('Choose a statement day from 1 to 28')
    await expect(addCreditCard('A', { dueDay: 29 })).rejects.toThrow('Choose a due day from 1 to 28')
    await expect(addCreditCard('A', { dueDay: 2.5 })).rejects.toThrow('Choose a due day from 1 to 28')
    await expect(addCreditCard('A', { creditLimitMinor: 0 })).rejects.toThrow()
    await expect(addCreditCard('A', {}, -5)).rejects.toThrow('can’t be negative')
  })
})

describe('updateCardDetails', () => {
  it('changes what is named and leaves the rest', async () => {
    const { db, addCreditCard, updateCardDetails } = await load()
    const id = await addCreditCard('Amex', { creditLimitMinor: 100_000, statementDay: 10, dueDay: 2 })
    await updateCardDetails(id, { creditLimitMinor: 250_000, dueDay: 5 })
    expect(await db.accounts.get(id)).toMatchObject({ creditLimitMinor: 250_000, statementDay: 10, dueDay: 5 })
  })

  it('takes a limit or a day away with null', async () => {
    const { db, addCreditCard, updateCardDetails } = await load()
    const id = await addCreditCard('Amex', { creditLimitMinor: 100_000, statementDay: 10, dueDay: 2 })
    await updateCardDetails(id, { creditLimitMinor: null, statementDay: null })
    const card = (await db.accounts.get(id))!
    expect(card.creditLimitMinor).toBeUndefined()
    expect(card.statementDay).toBeUndefined()
    expect(card.dueDay).toBe(2)
  })

  it('refuses a day that is not 1 to 28, and an account that is not a card', async () => {
    const { db, addCreditCard, updateCardDetails } = await load()
    const id = await addCreditCard('Amex')
    await expect(updateCardDetails(id, { statementDay: 31 })).rejects.toThrow('1 to 28')
    const main = (await db.accounts.toArray())[0]
    await expect(updateCardDetails(main.id, { dueDay: 5 })).rejects.toThrow('That is not a credit card')
  })
})

describe('a credit card in the ledger', () => {
  const base = { kind: 'expense', currency: 'INR', categoryId: 1, merchant: 'x', note: '', paymentMethod: '', source: 'manual', createdAt: 1 } as const

  it('keeps spending on the card out of the cash balance, which a bill paid from the bank then lowers', async () => {
    const { db, addCreditCard, buildLedger } = await load()
    const cardId = await addCreditCard('HDFC', {}, 100_000)
    const main = (await db.accounts.toArray()).find((a) => a.type === undefined)!
    await db.accounts.update(main.id, { openingMinor: 1_000_000 })
    const rows = (over: object[]) => over.map((o, i) => ({ ...base, id: i + 1, date: '2026-11-02', amountMinor: 0, ...o })) as never[]
    const ledgerFor = async (txs: object[]) =>
      buildLedger({ transactions: rows(txs), categories: [], accounts: await db.accounts.toArray(), budgets: [], recurring: [], currency: 'INR', rates: {} })

    const before = await ledgerFor([])
    expect(before.estimatedBalanceMinor).toBe(1_000_000) // the card's opening amount owed is not in it
    expect(before.cards.map((c) => c.id)).toEqual([cardId])

    const spent = await ledgerFor([{ amountMinor: 250_000, accountId: cardId }])
    expect(spent.estimatedBalanceMinor).toBe(1_000_000) // spent on the card, so still in the bank
    expect(spent.netMinor).toBe(0)
    expect(spent.balances.get(cardId)?.estimatedMinor).toBe(-350_000) // owes 100,000 + 250,000
    expect(spent.expenses).toHaveLength(1) // and it is spending, for the charts

    const paid = await ledgerFor([{ amountMinor: 250_000, accountId: cardId }, { kind: 'transfer', amountMinor: 300_000, accountId: main.id, toAccountId: cardId }])
    expect(paid.estimatedBalanceMinor).toBe(700_000) // the bill came out of the bank
    expect(paid.balances.get(cardId)?.estimatedMinor).toBe(-50_000) // and is owed less
    expect(paid.expenses).toHaveLength(1) // paying the bill is not spending
  })

  it('does not count a card’s amount owed as the balance having been set', async () => {
    const { db, addCreditCard, buildLedger } = await load()
    await addCreditCard('HDFC', {}, 50_000)
    const ledger = buildLedger({ transactions: [], categories: [], accounts: await db.accounts.toArray(), budgets: [], recurring: [], currency: 'INR', rates: {} })
    expect(ledger.balanceSet).toBe(false)
  })
})
