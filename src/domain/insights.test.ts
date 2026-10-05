import { expect, it } from 'vitest'
import { learnedMerchants, spendingCalendar } from './insights'
import type { Transaction } from './transactions'

let n = 0
const tx = (date: string, cents: number, details: string, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${n}`,
  date,
  block: 'expenses',
  categoryId: 'food',
  cents,
  details,
  tagIds: [],
  source: 'revolut',
  createdAt: n++,
  ...extra,
})

it('lists what was learned per merchant, with rules winning', () => {
  const list = [
    tx('2026-09-01', 100, 'MERCADONA 12'),
    tx('2026-09-02', 100, 'Mercadona', { categoryId: 'home' }),
    tx('2026-09-03', 100, 'Basic Fit', { categoryId: null }),
  ]
  const learned = learnedMerchants(list, [])
  expect(learned[0]).toMatchObject({ merchant: 'mercadona', name: 'Mercadona', categoryId: 'home', count: 2, differing: 1, rule: false })
  expect(learned[1]).toMatchObject({ merchant: 'basic fit', categoryId: null, differing: 0 })
  expect(learnedMerchants(list, [{ merchant: 'mercadona', categoryId: 'food' }])[0]).toMatchObject({ categoryId: 'food', rule: true, differing: 1 })
})

it('lays out a month in weeks from Monday with spending per day', () => {
  const settings = { shiftLateIncome: true, lateIncomeDay: 24 }
  const weeks = spendingCalendar([tx('2026-10-01', 500, 'a'), tx('2026-10-01', 250, 'b'), tx('2026-10-02', 100, 'c', { block: 'income' })], '2026-10', settings)
  // 1 October 2026 is a Thursday.
  expect(weeks[0]!.slice(0, 3)).toEqual([null, null, null])
  expect(weeks[0]![3]).toEqual({ date: '2026-10-01', spent: 750, count: 2 })
  expect(weeks[0]![4]).toEqual({ date: '2026-10-02', spent: 0, count: 0 })
  expect(weeks.flat().filter(Boolean)).toHaveLength(31)
  // With whole months shifted, October runs from 24 September.
  const shifted = spendingCalendar([], '2026-10', { ...settings, shiftWholeMonth: true })
  expect(shifted.flat().find(Boolean)!.date).toBe('2026-09-24')
  expect(shifted.flat().filter(Boolean)).toHaveLength(30)
})
