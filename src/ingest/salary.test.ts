import { describe, expect, it } from 'vitest'
import { isIncomeCategory, isSalaryName } from '../db/defaultCategories'
import { parseExpense } from './localParser'

const today = new Date(2026, 10, 17)

describe('Salary category', () => {
  it('files a salary that came in under Salary', () => {
    for (const text of ['salary 80000', 'salary credited 80000', 'october payroll 75000', 'stipend 15000', 'received wages 9000']) {
      expect(parseExpense(text, today), text).toMatchObject({ kind: 'income', categoryName: 'Salary' })
    }
  })

  it('files other money in under Income', () => {
    for (const text of ['received 500 from Rahul', 'cashback 120', 'bonus 5000', 'refund 800']) {
      expect(parseExpense(text, today), text).toMatchObject({ kind: 'income', categoryName: 'Income' })
    }
  })

  it('leaves a salary that was paid out as spending', () => {
    expect(parseExpense('maid salary 8000', today)).toMatchObject({ kind: 'expense' })
    expect(parseExpense('paid salary to driver 12000', today)).toMatchObject({ kind: 'expense' })
  })

  it('knows a salary by its name, and both categories as received money', () => {
    expect(isSalaryName('Salary')).toBe(true)
    expect(isSalaryName('Nov Payroll')).toBe(true)
    expect(isSalaryName('Swiggy')).toBe(false)
    expect(isIncomeCategory('Salary')).toBe(true)
    expect(isIncomeCategory('Income')).toBe(true)
    expect(isIncomeCategory('Food & Dining')).toBe(false)
  })
})
