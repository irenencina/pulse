import { describe, expect, it } from 'vitest'
import {
  buildTree,
  categoryPath,
  descendantIds,
  effectiveCarryOver,
  flattenTree,
  moveError,
  nextOrder,
  reorder,
} from './categories'
import type { Category } from './types'

const cat = (id: string, parentId: string | null, order = 0, extra: Partial<Category> = {}): Category => ({
  id,
  block: 'expenses',
  parentId,
  name: id,
  order,
  archived: false,
  ...extra,
})

// sports > football > boots, sports > gym, rent; plus an income category
const categories: Category[] = [
  cat('rent', null, 1),
  cat('sports', null, 0),
  cat('football', 'sports', 0),
  cat('gym', 'sports', 1),
  cat('boots', 'football', 0),
  cat('job', null, 0, { block: 'income' }),
]

describe('buildTree', () => {
  it('nests categories without a depth limit and keeps sibling order', () => {
    const flat = flattenTree(buildTree(categories, 'expenses')).map((n) => [n.category.id, n.depth])
    expect(flat).toEqual([
      ['sports', 0],
      ['football', 1],
      ['boots', 2],
      ['gym', 1],
      ['rent', 0],
    ])
  })

  it('only includes the requested block', () => {
    expect(buildTree(categories, 'income').map((n) => n.category.id)).toEqual(['job'])
  })

  it('hides archived categories and their subtree unless asked', () => {
    const withArchived = categories.map((c) => (c.id === 'football' ? { ...c, archived: true } : c))
    const ids = flattenTree(buildTree(withArchived, 'expenses')).map((n) => n.category.id)
    expect(ids).not.toContain('football')
    expect(ids).toContain('boots') // shown at top level so it isn't lost
    expect(flattenTree(buildTree(withArchived, 'expenses', true)).map((n) => n.category.id)).toContain('football')
  })
})

describe('moving categories', () => {
  it('collects all descendants', () => {
    expect([...descendantIds(categories, 'sports')].sort()).toEqual(['boots', 'football', 'gym', 'sports'])
  })

  it('refuses to move a category inside itself or its children', () => {
    expect(moveError(categories, 'sports', 'sports')).toMatch(/inside itself/)
    expect(moveError(categories, 'sports', 'boots')).toMatch(/inside itself/)
  })

  it('refuses to move a category into another block', () => {
    expect(moveError(categories, 'rent', 'job')).toMatch(/own block/)
  })

  it('allows valid moves, including to the top level', () => {
    expect(moveError(categories, 'boots', 'gym')).toBeNull()
    expect(moveError(categories, 'boots', null)).toBeNull()
  })
})

describe('ordering', () => {
  it('appends new categories after their siblings', () => {
    expect(nextOrder(categories, 'expenses', 'sports')).toBe(2)
    expect(nextOrder(categories, 'expenses', 'boots')).toBe(0)
  })

  it('swaps a category with its neighbour', () => {
    expect(reorder(categories, 'rent', -1)).toEqual([
      { id: 'rent', order: 0 },
      { id: 'sports', order: 1 },
    ])
  })

  it('does nothing at the edges', () => {
    expect(reorder(categories, 'sports', -1)).toEqual([])
    expect(reorder(categories, 'rent', 1)).toEqual([])
  })
})

it('builds a readable path', () => {
  expect(categoryPath(categories, 'boots')).toBe('sports / football / boots')
})

it('falls back to the settings default for carry-over', () => {
  expect(effectiveCarryOver(cat('a', null), { carryOverDefault: 'toMainPot' })).toBe('toMainPot')
  expect(effectiveCarryOver(cat('a', null, 0, { carryOver: 'carry' }), { carryOverDefault: 'toMainPot' })).toBe('carry')
})

it('places a dragged category at a new position among its siblings', async () => {
  const { reorderTo } = await import('./categories')
  const list = ['a', 'b', 'c', 'd'].map((id, order) => ({ id, block: 'expenses' as const, parentId: null, name: id, order, archived: false }))
  const apply = (changes: Array<{ id: string; order: number }>) =>
    list
      .map((c) => ({ ...c, order: changes.find((x) => x.id === c.id)?.order ?? c.order }))
      .sort((x, y) => x.order - y.order)
      .map((c) => c.id)
      .join('')
  expect(apply(reorderTo(list, 'a', 2))).toBe('bcad')
  expect(apply(reorderTo(list, 'd', 0))).toBe('dabc')
  expect(apply(reorderTo(list, 'b', 9))).toBe('acdb')
})
