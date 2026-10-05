import { describe, expect, it } from 'vitest'
import { expensesBetween, tagStats } from './tagStats'
import type { Transaction } from './transactions'
import type { Category, Tag } from './types'

const rule = { shiftLateIncome: false, lateIncomeDay: 25 }
const cat = (id: string, name: string, parentId: string | null = null): Category =>
  ({ id, name, parentId, block: 'expenses', order: 0, archived: false }) as Category
const categories = [cat('sports', 'Sports'), cat('boots', 'Boots', 'sports'), cat('clothes', 'Clothing')]
let n = 0
const tx = (date: string, cents: number, categoryId: string | null, tagIds: string[], block: Transaction['block'] = 'expenses'): Transaction => ({
  id: String(n++),
  date,
  block,
  categoryId,
  cents,
  details: '',
  tagIds,
  source: 'manual',
  createdAt: n,
})

describe('tagStats', () => {
  const football: Tag = { id: 'f', name: 'football' }
  const trip: Tag = { id: 't', name: 'trip', budgetCents: 150000 }
  const unused: Tag = { id: 'u', name: 'unused' }
  const transactions = [
    tx('2026-03-01', 40000, 'sports', ['f']),
    tx('2026-04-02', 9000, 'boots', ['f']),
    tx('2026-04-03', 24000, 'clothes', ['f', 't']),
    tx('2025-08-10', 50000, null, ['t']),
    tx('2026-04-04', 300000, null, ['f'], 'income'),
  ]

  it('adds up expenses per tag in the months, split by top-level category', () => {
    const [first, ...rest] = tagStats(transactions, [football, trip, unused], categories, ['2026-03', '2026-04'], rule)
    expect(first).toMatchObject({ count: 4, spent: 73000 })
    expect(first!.byCategory).toEqual([
      { categoryId: 'sports', name: 'Sports', cents: 49000 },
      { categoryId: 'clothes', name: 'Clothing', cents: 24000 },
    ])
    // The trip's budget counts every expense with the tag, also outside the months.
    expect(rest).toEqual([expect.objectContaining({ tag: trip, spent: 24000, spentAllTime: 74000 })])
  })

  it('keeps a tag with a budget even when nothing is in the months', () => {
    const stats = tagStats(transactions, [football, trip], categories, ['2026-01'], rule)
    expect(stats.map((s) => s.tag.name)).toEqual(['trip'])
  })

  it('finds the expenses between two days, both included', () => {
    expect(expensesBetween(transactions, '2026-04-02', '2026-04-04').map((t) => t.date)).toEqual(['2026-04-02', '2026-04-03'])
    expect(expensesBetween(transactions, '2026-04-05', '2026-04-01')).toEqual([])
  })
})
