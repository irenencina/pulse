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
})
