import { describe, expect, it } from 'vitest'
import { periodCompletion, savingsRate, topSlices } from './dashboard'
import type { CategoryProgress } from './progress'
import type { Category } from './types'

const plain = { shiftLateIncome: false, lateIncomeDay: 24, shiftWholeMonth: false }

describe('periodCompletion', () => {
  it('counts the days passed, today included', () => {
    expect(periodCompletion(['2026-10'], '2026-10-01', plain)).toBeCloseTo(1 / 31)
    expect(periodCompletion(['2026-10'], '2026-10-31', plain)).toBe(1)
    expect(periodCompletion(['2026-10'], '2026-09-30', plain)).toBe(0)
    expect(periodCompletion(['2026-10'], '2026-11-05', plain)).toBe(1)
  })

  it('covers a whole year, and follows the whole-month shift', () => {
    const year = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`)
    expect(periodCompletion(year, '2026-07-02', plain)).toBeCloseTo(183 / 365)
    const shifted = { ...plain, shiftLateIncome: true, shiftWholeMonth: true }
    // October runs from 24 September to 23 October: 30 days.
    expect(periodCompletion(['2026-10'], '2026-09-24', shifted)).toBeCloseTo(1 / 30)
  })
})

describe('savingsRate', () => {
  const totals = { income: 300000, expenses: 150000, savings: 60000 }
  it('is active (put into savings) or passive (not spent)', () => {
    expect(savingsRate(totals, 'allocated')).toBeCloseTo(0.2)
    expect(savingsRate(totals, 'notSpent')).toBeCloseTo(0.5)
    expect(savingsRate({ ...totals, income: 0 }, 'allocated')).toBeNull()
  })
})

describe('topSlices', () => {
  const row = (name: string, tracked: number, depth = 0): CategoryProgress => ({
    category: { id: name, name } as Category,
    depth,
    planned: 0,
    tracked,
    left: 0,
  })
  it('keeps the five biggest top-level categories and adds up the rest', () => {
    const rows = [row('a', 10), row('b', 60), row('sub', 50, 1), row('c', 50), row('d', 40), row('e', 30), row('f', 20), row('g', 5)]
    expect(topSlices(rows).map((s) => [s.name, s.cents])).toEqual([
      ['b', 60],
      ['c', 50],
      ['d', 40],
      ['e', 30],
      ['f', 20],
      ['Other', 15],
    ])
  })
  it('adds what still needs a category as its own slice', () => {
    expect(topSlices([row('a', 10)], 30).map((s) => [s.name, s.cents])).toEqual([
      ['No category yet', 30],
      ['a', 10],
    ])
  })

  it('shows six categories as they are instead of an Other of one', () => {
    const rows = [row('a', 6), row('b', 5), row('c', 4), row('d', 3), row('e', 2), row('f', 1)]
    expect(topSlices(rows).map((s) => s.name)).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })
})
