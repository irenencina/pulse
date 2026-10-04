import { expect, it } from 'vitest'
import { expectedPayments, findDuplicate, nextMonthDate, previousMonth } from './recurring'
import type { Transaction } from './transactions'

const settings = { shiftLateIncome: true, lateIncomeDay: 20 }
let n = 0
const tx = (date: string, cents: number, details: string, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${n++}`,
  date,
  block: 'expenses',
  categoryId: 'rent',
  cents,
  details,
  tagIds: [],
  source: 'manual',
  createdAt: 0,
  ...extra,
})

it('steps months and dates', () => {
  expect(previousMonth('2026-01')).toBe('2025-12')
  expect(previousMonth('2026-03', 2)).toBe('2026-01')
  expect(nextMonthDate('2026-01-31')).toBe('2026-02-28')
  expect(nextMonthDate('2026-12-05')).toBe('2027-01-05')
})

it('expects payments that came once in each of the last two months', () => {
  const history = [
    tx('2026-08-01', 80000, 'Landlord'),
    tx('2026-09-01', 80000, 'Landlord'),
    // Several times a month: not a monthly payment.
    tx('2026-08-03', 4000, 'Mercadona', { categoryId: 'food' }),
    tx('2026-08-12', 3500, 'Mercadona', { categoryId: 'food' }),
    tx('2026-09-04', 4100, 'Mercadona', { categoryId: 'food' }),
    // The amount changes a lot.
    tx('2026-08-10', 1000, 'Shop', { categoryId: 'fun' }),
    tx('2026-09-10', 5000, 'Shop', { categoryId: 'fun' }),
    // Already paid this month.
    tx('2026-08-14', 3499, 'Basic Fit', { categoryId: 'sport' }),
    tx('2026-09-14', 3499, 'Basic Fit', { categoryId: 'sport' }),
    tx('2026-10-14', 3499, 'Basic Fit', { categoryId: 'sport' }),
  ]
  const expected = expectedPayments(history, '2026-10', settings)
  expect(expected.map((e) => [e.details, e.date, e.cents])).toEqual([['Landlord', '2026-10-01', 80000]])
  expect(expectedPayments(history, '2026-10', settings, new Set([`${expected[0]!.key}|2026-10`]))).toEqual([])
})

it('follows the late-income shift for a salary', () => {
  const salary = (date: string) => tx(date, 250000, 'Employer', { block: 'income', categoryId: 'salary' })
  const expected = expectedPayments([salary('2026-08-25'), salary('2026-09-25')], '2026-11', settings)
  expect(expected.map((e) => e.date)).toEqual(['2026-10-25'])
})

it('finds the closest same payment a few days apart', () => {
  const list = [tx('2026-09-01', 80000, 'a'), tx('2026-09-03', 80000, 'b'), tx('2026-09-02', 5000, 'c')]
  expect(findDuplicate({ date: '2026-09-04', block: 'expenses', cents: 80000 }, list)?.details).toBe('b')
  expect(findDuplicate({ date: '2026-09-10', block: 'expenses', cents: 80000 }, list)).toBeNull()
  expect(findDuplicate({ date: '2026-09-02', block: 'income', cents: 5000 }, list)).toBeNull()
  expect(findDuplicate({ date: '2026-09-04', block: 'expenses', cents: 80000 }, list, { exclude: new Set([list[1]!.id]) })?.details).toBe('a')
})
