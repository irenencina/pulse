import { expect, it } from 'vitest'
import { ledgerMatcher, MAIN_ACCOUNT, NO_CATEGORY, NO_FILTER } from './ledgerFilter'
import type { Transaction } from './transactions'
import type { Category, Tag } from './types'

const cat = (id: string, name: string, parentId: string | null = null): Category => ({
  id,
  block: 'expenses',
  parentId,
  name,
  order: 0,
  archived: false,
})
const categories = [cat('sport', 'Sports'), cat('gym', 'Gym', 'sport'), cat('food', 'Groceries')]
const tags: Tag[] = [{ id: 'tf', name: 'football' }]
const tx = (id: string, extra: Partial<Transaction>): Transaction => ({
  id,
  date: '2026-09-01',
  block: 'expenses',
  categoryId: null,
  cents: 1250,
  details: '',
  tagIds: [],
  source: 'manual',
  createdAt: 0,
  ...extra,
})
const list = [
  tx('a', { categoryId: 'gym', details: 'Basic Fit', pocket: 'Bills', cents: 3499 }),
  tx('b', { categoryId: 'food', details: 'Mercadona', tagIds: ['tf'] }),
  tx('c', { details: 'Unknown shop' }),
]
const ids = (filter: Partial<typeof NO_FILTER>) => list.filter(ledgerMatcher({ ...NO_FILTER, ...filter }, categories, tags)).map((t) => t.id)

it('keeps everything without a filter', () => expect(ids({})).toEqual(['a', 'b', 'c']))
it('searches details, category, pocket, tags and amounts', () => {
  expect(ids({ text: 'basic' })).toEqual(['a'])
  expect(ids({ text: 'sports' })).toEqual(['a'])
  expect(ids({ text: 'bills' })).toEqual(['a'])
  expect(ids({ text: '#football' })).toEqual(['b'])
  expect(ids({ text: '34,99' })).toEqual(['a'])
  expect(ids({ text: '12.5' })).toEqual(['b', 'c'])
  expect(ids({ text: 'mercadona football' })).toEqual(['b'])
})
it('filters by category with its subcategories, by missing category, pocket and tag', () => {
  expect(ids({ category: 'sport' })).toEqual(['a'])
  expect(ids({ category: NO_CATEGORY })).toEqual(['c'])
  expect(ids({ pocket: 'Bills' })).toEqual(['a'])
  expect(ids({ pocket: MAIN_ACCOUNT })).toEqual(['b', 'c'])
  expect(ids({ tag: 'tf' })).toEqual(['b'])
  expect(ids({ day: '2026-09-01' })).toEqual(['a', 'b', 'c'])
  expect(ids({ day: '2026-09-02' })).toEqual([])
})
