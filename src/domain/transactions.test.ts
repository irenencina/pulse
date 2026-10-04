import { expect, it } from 'vitest'
import { countsFor, merchantKey, parseTagList, suggestCategory, trackedTotals, type Transaction } from './transactions'

const settings = { shiftLateIncome: true, lateIncomeDay: 20 }
const tx = (date: string, block: Transaction['block'], cents: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: `${date}-${cents}`,
  date,
  block,
  categoryId: 'c',
  cents,
  details: '',
  tagIds: [],
  source: 'manual',
  createdAt: 0,
  ...extra,
})

it('counts a salary paid on or after the cut-off day for the next month', () => {
  expect(countsFor(tx('2026-09-25', 'income', 1), settings)).toBe('2026-10')
  expect(countsFor(tx('2026-12-20', 'income', 1), settings)).toBe('2027-01')
  expect(countsFor(tx('2026-09-25', 'expenses', 1), settings)).toBe('2026-09')
  expect(countsFor(tx('2026-09-25', 'income', 1), { ...settings, shiftLateIncome: false })).toBe('2026-09')
})

it('adds up a month by block', () => {
  const list = [tx('2026-09-25', 'income', 300000), tx('2026-10-02', 'expenses', 4999), tx('2026-10-05', 'savings', 50000)]
  expect(trackedTotals(list, '2026-10', settings)).toEqual({ income: 300000, expenses: 4999, savings: 50000, count: 3 })
  expect(trackedTotals(list, '2026-09', settings).count).toBe(0)
  expect(trackedTotals(list, null, settings).count).toBe(3)
})

it('reads tags as typed', () => {
  expect(parseTagList('#football, #kids  club')).toEqual(['football', 'kids', 'club'])
})

it('suggests the category last used for the same merchant', () => {
  expect(merchantKey('DECATHLON Madrid 0123*')).toBe('decathlon madrid')
  const history = [
    tx('2026-01-01', 'expenses', 1, { details: 'Decathlon Madrid', categoryId: 'shopping', createdAt: 1 }),
    tx('2026-02-01', 'expenses', 1, { details: 'DECATHLON MADRID 77', categoryId: 'sports', createdAt: 2 }),
  ]
  expect(suggestCategory('Decathlon Madrid', history)).toEqual({ block: 'expenses', categoryId: 'sports' })
  expect(suggestCategory('Mercadona', history)).toBeNull()
})
