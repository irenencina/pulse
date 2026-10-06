import { expect, it } from 'vitest'
import { categoryProgress } from './progress'
import type { Transaction } from './transactions'
import { DEFAULT_SETTINGS, type Category } from './types'

const cat = (id: string, name: string, parentId: string | null = null): Category => ({
  id,
  block: 'expenses',
  parentId,
  name,
  order: 0,
  archived: false,
})

it('compares planned and tracked per category, rolled up into parents', () => {
  const categories = [cat('sport', 'Sports'), cat('gym', 'Gym', 'sport'), cat('food', 'Groceries'), cat('fun', 'Fun')]
  const cells = [
    { id: 'gym|2026-09', categoryId: 'gym', month: '2026-09', kind: 'fixed' as const, cents: 4000 },
    { id: 'food|2026-09', categoryId: 'food', month: '2026-09', kind: 'fixed' as const, cents: 30000 },
  ]
  const t = (categoryId: string, cents: number, date = '2026-09-10'): Transaction => ({
    id: `${categoryId}${cents}`,
    date,
    block: 'expenses',
    categoryId,
    cents,
    details: '',
    tagIds: [],
    source: 'manual',
    createdAt: 0,
  })
  const settings = { ...DEFAULT_SETTINGS, startingYear: 2026 }
  const rows = categoryProgress(categories, cells, [t('gym', 3499), t('food', 32000), t('food', 100, '2026-08-01')], settings, '2026-09')
  expect(rows.expenses.map((r) => [r.category.name, r.depth, r.planned, r.tracked, r.left])).toEqual([
    ['Groceries', 0, 30000, 32000, -2000],
    ['Sports', 0, 4000, 3499, 501],
    ['Gym', 1, 4000, 3499, 501],
  ])
  expect(rows.income).toEqual([])
  // Several months add up.
  const both = categoryProgress(categories, cells, [t('food', 32000), t('food', 100, '2026-08-01')], settings, ['2026-08', '2026-09'])
  expect(both.expenses.find((r) => r.category.id === 'food')).toMatchObject({ planned: 30000, tracked: 32100 })
})

it('turns the Year and Period pickers into months', async () => {
  const { scopeMonths } = await import('./scope')
  expect(scopeMonths({ year: 'current', period: 'current' }, '2026-10')).toEqual(['2026-10'])
  expect(scopeMonths({ year: 2025, period: 3 }, '2026-10')).toEqual(['2025-03'])
  expect(scopeMonths({ year: 2025, period: 'current' }, '2026-10')).toEqual(['2025-10'])
  expect(scopeMonths({ year: 'current', period: 'year' }, '2026-10')).toHaveLength(12)
})

it('shows a parent’s own budget and spending as an Other row after its subcategories', () => {
  const categories = [cat('sport', 'Sports'), cat('fee', 'Club fee', 'sport'), cat('food', 'Groceries')]
  const cells = [
    { id: 'sport|2026-09', categoryId: 'sport', month: '2026-09', kind: 'fixed' as const, cents: 7500 },
    { id: 'fee|2026-09', categoryId: 'fee', month: '2026-09', kind: 'fixed' as const, cents: 24000 },
  ]
  const t: Transaction = { id: 'x', date: '2026-09-03', block: 'expenses', categoryId: 'sport', cents: 2000, details: '', tagIds: [], source: 'manual', createdAt: 0 }
  const rows = categoryProgress(categories, cells, [t], { ...DEFAULT_SETTINGS, startingYear: 2026 }, '2026-09')
  expect(rows.expenses.map((r) => [r.category.name, r.depth, r.other ?? false, r.planned, r.tracked])).toEqual([
    ['Sports', 0, false, 31500, 2000],
    ['Club fee', 1, false, 24000, 0],
    ['Sports', 1, true, 7500, 2000],
  ])
})
