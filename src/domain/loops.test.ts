/**
 * Data with a loop in it (a category inside itself, or A inside B inside A) must never hang
 * or crash Pulse. Such data can't be made in the app, but a damaged or hand-edited backup
 * could hold it.
 */
import { describe, expect, it } from 'vitest'
import type { BudgetCell } from './budget'
import { computePlan } from './budget'
import { brokenParents, buildTree, categoryPath, descendantIds, flattenTree } from './categories'
import { categoryProgress } from './progress'
import { safetyNet } from './safetyNet'
import { tagStats } from './tagStats'
import type { Transaction } from './transactions'
import { DEFAULT_SETTINGS, type Category } from './types'
import { upcomingEvents } from './upcoming'

const cat = (id: string, parentId: string | null, block: Category['block'] = 'expenses'): Category => ({ id, block, parentId, name: id, order: 0, archived: false })
// a ⇄ b loop, c inside itself, d inside a missing category, e under an income line, f fine.
const categories = [cat('a', 'b'), cat('b', 'a'), cat('c', 'c'), cat('d', 'gone'), cat('e', 'job'), cat('job', null, 'income'), cat('f', 'a')]
const cells: BudgetCell[] = categories.map((c) => ({ id: `${c.id}|2026-10`, categoryId: c.id, month: '2026-10', kind: 'fixed', cents: 1000 }))
const transactions: Transaction[] = categories.map((c, i) => ({ id: `t${i}`, date: '2026-10-02', block: c.block, categoryId: c.id, cents: 500, details: c.id, tagIds: ['trip'], source: 'manual', createdAt: 0 }))
const settings = { ...DEFAULT_SETTINGS, startingYear: 2026, startingMonth: 1 }

describe('data with loops', () => {
  it('finds every broken parent link, cutting each loop once', () => {
    const broken = brokenParents(categories)
    expect(broken).toEqual(expect.arrayContaining(['c', 'd', 'e']))
    expect(broken.filter((id) => id === 'a' || id === 'b')).toHaveLength(1)
    expect(broken).not.toContain('f')
    // Once repaired, nothing is broken any more and every category shows in the tree.
    const repaired = categories.map((c) => (broken.includes(c.id) ? { ...c, parentId: null } : c))
    expect(brokenParents(repaired)).toEqual([])
    expect(flattenTree(buildTree(repaired, 'expenses')).map((n) => n.category.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('never hangs on the loop, even before it is repaired', () => {
    expect(() => buildTree(categories, 'expenses')).not.toThrow()
    expect(descendantIds(categories, 'a').size).toBeGreaterThan(0)
    expect(categoryPath(categories, 'a')).toBeTruthy()
    expect(() => computePlan(categories, cells, settings, 2026)).not.toThrow()
    expect(() => categoryProgress(categories, cells, transactions, settings, '2026-10')).not.toThrow()
    expect(() => safetyNet(categories, cells, transactions, settings, '2026-10-09')).not.toThrow()
    expect(() => tagStats(transactions, [{ id: 'trip', name: 'trip' }], categories, ['2026-10'], settings)).not.toThrow()
    expect(() =>
      upcomingEvents({ categories, cells, transactions, wishes: [], items: [], overrides: [], settings }, '2026-10-09'),
    ).not.toThrow()
  })
})
