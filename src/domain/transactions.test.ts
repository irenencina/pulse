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
  expect(suggestCategory('Decathlon Madrid', null, history)).toEqual({ block: 'expenses', categoryId: 'sports' })
  expect(suggestCategory('Mercadona', null, history)).toBeNull()
})

it('uses pockets: their only category, or the merchant within the pocket', () => {
  const pockets = [
    { name: 'Household', categoryIds: ['groceries'] },
    { name: 'Mind & Fun', categoryIds: ['fun', 'education'] },
    { name: 'Bills', categoryIds: ['rent', 'subscriptions'] },
  ]
  const history = [
    tx('2026-01-01', 'expenses', 1, { details: 'Albert Heijn', categoryId: 'groceries', pocket: 'Household', createdAt: 1 }),
    tx('2026-01-02', 'expenses', 1, { details: 'Basic Fit', categoryId: 'sports', pocket: 'Bills', createdAt: 2 }),
  ]
  // Household is linked to one category.
  expect(suggestCategory('Lidl', 'Household', history, pockets)?.categoryId).toBe('groceries')
  // A gym fee from Bills goes where it went before, even outside the pocket's categories.
  expect(suggestCategory('Basic Fit', 'Bills', history, pockets)?.categoryId).toBe('sports')
  // Groceries bought from Mind & Fun don't become Groceries: that's not one of its categories.
  expect(suggestCategory('Albert Heijn', 'Mind & Fun', history, pockets)).toBeNull()
  // Without a pocket, the merchant decides.
  expect(suggestCategory('Albert Heijn', null, history, pockets)?.categoryId).toBe('groceries')
})

it('lets a merchant rule win over everything learned', () => {
  const history = [tx('2026-09-01', 'expenses', 3499, { details: 'Basic Fit', categoryId: 'bills', pocket: 'Bills', createdAt: 5 })]
  const rules = [{ merchant: 'basic fit', categoryId: 'sport' }]
  const categories = [{ id: 'sport', block: 'expenses' as const }]
  expect(suggestCategory('BASIC FIT 123', 'Bills', history, [], rules, categories)).toEqual({ block: 'expenses', categoryId: 'sport' })
  // A rule pointing at a deleted category is ignored.
  expect(suggestCategory('BASIC FIT 123', 'Bills', history, [], rules, [])?.categoryId).toBe('bills')
})

it('waits for enough uses, honours a block and applies your own rules', () => {
  const lidl = (createdAt: number) => tx('2026-09-01', 'expenses', 100, { details: 'Lidl', categoryId: 'groceries', createdAt })
  const categories = [
    { id: 'groceries', block: 'expenses' as const },
    { id: 'music', block: 'expenses' as const },
  ]
  expect(suggestCategory('Lidl', null, [lidl(1)], [], [], categories, 2)).toBeNull()
  expect(suggestCategory('Lidl', null, [lidl(1), lidl(2)], [], [], categories, 2)?.categoryId).toBe('groceries')
  expect(suggestCategory('Lidl', null, [lidl(1)], [], [{ merchant: 'lidl', blocked: true }], categories)).toBeNull()
  const pattern = [{ merchant: 'contains:spotify', contains: 'Spotify', categoryId: 'music' }]
  expect(suggestCategory('SPOTIFY P1234 Stockholm', null, [], [], pattern, categories)?.categoryId).toBe('music')
})
