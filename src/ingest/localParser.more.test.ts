import { describe, expect, it } from 'vitest'
import { describeDay, parseExpense, parseMany } from './localParser'

// Friday, 30 Oct 2026
const today = new Date(2026, 9, 30)
const parse = (text: string) => parseExpense(text, today)

describe('amounts written the Indian way', () => {
  it.each([
    ['2 lakh rent', 20_000_000, 'Rent'],
    ['rent 1.5 lakh', 15_000_000, 'Rent'],
    ['car 10 lac', 100_000_000, 'Car'],
    ['rent 1 crore', 1_000_000_000, 'Rent'],
    ['2L rent', 20_000_000, 'Rent'],
    ['1cr rent', 1_000_000_000, 'Rent'],
    ['1.5m rent', 150_000_000, 'Rent'],
    ['1.5 k petrol', 150_000, 'Petrol'],
    ['12,34,567 rent', 123_456_700, 'Rent'],
  ])('reads %s', (text, amountMinor, merchant) => {
    expect(parse(text)).toMatchObject({ amountMinor, merchant })
  })
})

describe('amounts with a currency mark', () => {
  it.each([
    ['Rs.99 chai', 9_900, 'Chai'],
    ['450/- lunch', 45_000, 'Lunch'],
    ['450rs lunch', 45_000, 'Lunch'],
    ['rs450 lunch', 45_000, 'Lunch'],
    ['₹450lunch', 45_000, 'Lunch'],
    ['coffee .5', 50, 'Coffee'],
  ])('reads %s', (text, amountMinor, merchant) => {
    expect(parse(text)).toMatchObject({ amountMinor, merchant })
  })
})

describe('commas in numbers', () => {
  it('treats a comma before one or two digits as a decimal comma', () => {
    expect(parse('1,5 lunch')?.amountMinor).toBe(150)
    expect(parse('coffee 1,20')?.amountMinor).toBe(120)
  })

  it('refuses a number that is not any known way of writing one', () => {
    expect(parse('1,2,3 x')).toBeNull()
  })
})

describe('more than one number in a line', () => {
  it('takes the price, not the quantity or the model name', () => {
    expect(parse('2 coffees 100')).toMatchObject({ amountMinor: 10_000, merchant: '2 Coffees' })
    expect(parse('dinner for 4 1200')?.amountMinor).toBe(120_000)
    expect(parse('iphone 12 pro 79900')).toMatchObject({ amountMinor: 7_990_000, merchant: 'Iphone 12 Pro' })
    expect(parse('lunch 450 for 2')?.amountMinor).toBe(45_000)
  })

  it('prefers a number that carries a currency mark', () => {
    expect(parse('2 pizzas ₹300')?.amountMinor).toBe(30_000)
    expect(parse('table for 8 rs 2500')?.amountMinor).toBe(250_000)
  })

  it('splits "coffee 120 and lunch 340" into two entries', () => {
    const entries = parseMany('coffee 120 and lunch 340', today)
    expect(entries.map((e) => e.amountMinor)).toEqual([12_000, 34_000])
    expect(entries.map((e) => e.merchant)).toEqual(['Coffee', 'Lunch'])
  })
})

describe('amounts it must refuse', () => {
  it('has no amount beyond what a backup can hold', () => {
    expect(parse('99999999999999999999 x')).toBeNull()
  })

  it('has no amount that rounds to nothing', () => {
    expect(parse('coffee 0.004')).toBeNull()
  })
})

describe('dates', () => {
  it.each([
    ['on 5th dinner 400', '2026-10-05', 'Dinner'],
    ['rent 18000 on 1st', '2026-10-01', 'Rent'],
    ['coffee 120 on 28 oct', '2026-10-28', 'Coffee'],
    ['coffee 120 Oct 5', '2026-10-05', 'Coffee'],
    ['coffee 120 5 october', '2026-10-05', 'Coffee'],
    ['paid rs 1,200 to Amazon on 5th', '2026-10-05', 'Amazon'],
    ['lunch 450 01/10/2026', '2026-10-01', 'Lunch'],
    ['12/03 dinner 800', '2026-03-12', 'Dinner'],
    ['lunch 450 05-10-2026', '2026-10-05', 'Lunch'],
    ['lunch 450 2026-10-01', '2026-10-01', 'Lunch'],
  ])('reads the date in %s', (text, date, merchant) => {
    expect(parse(text)).toMatchObject({ date, merchant })
  })

  it.each([
    ['uber 230 monday', '2026-10-26', 'Uber'],
    ['uber 230 mon', '2026-10-26', 'Uber'],
    ['uber 230 yest', '2026-10-29', 'Uber'],
    ['uber 230 yday', '2026-10-29', 'Uber'],
    ['dinner 400 last night', '2026-10-29', 'Dinner'],
    ['uber 230 3 days back', '2026-10-27', 'Uber'],
    ['coffee 120 this morning', '2026-10-30', 'Coffee'],
    ['groceries 900 last week', '2026-10-23', 'Groceries'],
    ['18k rent last month', '2026-09-30', 'Rent'],
    ['tomorrow 100 food', '2026-10-31', 'Food'],
    ['friday movie 600', '2026-10-30', 'Movie'],
  ])('reads the relative date in %s', (text, date, merchant) => {
    expect(parse(text)).toMatchObject({ date, merchant })
  })

  it('keeps today when the date it finds is not a real day', () => {
    expect(parse('dinner 400 on 31 feb')?.date).toBe('2026-10-30')
  })

  it('never produces a broken date, whatever is typed', () => {
    expect(parse('100 9999999999 days ago')?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(parse('100 99999 days ago')?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('does not mistake a number that is not a date for one', () => {
    expect(parse('450 lunch')?.date).toBe('2026-10-30')
    expect(parse('iphone 12 pro 79900')?.date).toBe('2026-10-30')
    expect(parse('rent 18000 may')?.date).toBe('2026-10-30') // "may" alone is a word, not a month
  })

  it('gives the date typed at the end to every entry in the line', () => {
    const entries = parseMany('coffee 120, lunch 340 yesterday', today)
    expect(entries.map((e) => e.date)).toEqual(['2026-10-29', '2026-10-29'])
  })

  it('keeps each entry on its own date when each names one', () => {
    const entries = parseMany('coffee 120 today, lunch 340 yesterday', today)
    expect(entries.map((e) => e.date)).toEqual(['2026-10-30', '2026-10-29'])
  })
})

describe('money in or out', () => {
  it.each([
    ['got 500 from Ravi', 'income', 'Ravi'],
    ['Salary 80,000', 'income', 'Salary'],
    ['salary credited 80000', 'income', 'Salary'],
    ['rahul sent me 1200 yesterday', 'income', 'Rahul'],
    ['sent 500 to ravi', 'expense', 'Ravi'],
    ['maid salary 8000', 'expense', 'Maid Salary'],
    ['paid salary to driver 12000', 'expense', 'Salary Driver'],
    ['income tax 5000 paid', 'expense', 'Income Tax'],
    ['security deposit 20000 paid', 'expense', 'Security Deposit'],
    ['paid interest 500 on loan', 'expense', 'Interest Loan'],
  ])('reads %s as %s', (text, kind, merchant) => {
    expect(parse(text)).toMatchObject({ kind, merchant })
  })
})

describe('currency words and symbols', () => {
  it.each([
    ['$5 coffee', 'USD', 500],
    ['€12 lunch', 'EUR', 1_200],
    ['£3.50 tea', 'GBP', 350],
    ['USD 12 lunch', 'USD', 1_200],
    ['paid $12 for netflix', 'USD', 1_200],
    ['12 usd netflix', 'USD', 1_200],
    ['₹99 chai', 'INR', 9_900],
  ])('knows %s is in %s', (text, currency, amountMinor) => {
    expect(parse(text)).toMatchObject({ currency, amountMinor })
  })

  it('says nothing about the currency when none was typed', () => {
    expect(parse('450 lunch')).not.toHaveProperty('currency')
  })
})

describe('categories', () => {
  it('files a petrol station under Transport, not Bills', () => {
    expect(parse('gas station 500')?.categoryName).toBe('Transport')
  })
})

describe('describeDay', () => {
  it('says nothing for today, so the usual message stays short', () => {
    expect(describeDay('2026-10-30', today)).toBe('')
  })

  it('says yesterday, and tomorrow', () => {
    expect(describeDay('2026-10-29', today)).toBe('yesterday')
    expect(describeDay('2026-10-31', today)).toBe('tomorrow')
  })

  it('names any other day, with the year only when it is not this year', () => {
    expect(describeDay('2026-10-05', today)).toMatch(/^(5 Oct|Oct 5)$/)
    expect(describeDay('2025-03-12', today)).toMatch(/2025/)
  })
})
