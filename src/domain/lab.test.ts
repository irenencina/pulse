import { describe, expect, it } from 'vitest'
import { balanceTone, combineEntries, labRunning, labWeekList, noteCells, weekStartOf, labPeriods, periodStartOf, periodsWithDay, pretendTransactions, type LabEntry } from './lab'
import type { Category } from './types'

const cat = (id: string, block: Category['block']): Category => ({ id, block, parentId: null, name: id, order: 0, archived: false })

describe('weeks', () => {
  it('finds the first day of a week', () => {
    // 2026-10-06 is a Tuesday.
    expect(weekStartOf('2026-10-06', 1)).toBe('2026-10-05')
    expect(weekStartOf('2026-10-06', 0)).toBe('2026-10-04')
    expect(weekStartOf('2026-10-05', 1)).toBe('2026-10-05')
    expect(weekStartOf('2026-10-06', 3)).toBe('2026-09-30')
  })

  it('lists weeks across a month end', () => {
    expect(labWeekList('2026-09-28', 3)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12'])
  })
})

describe('labRunning', () => {
  const categories = [cat('job', 'income'), cat('rent', 'expenses'), cat('food', 'expenses'), cat('trip', 'savings')]
  const e = (categoryId: string, week: string, cents: number): LabEntry => ({ id: `${categoryId}|${week}`, categoryId, week, cents })

  it('carries what is left into the next week', () => {
    const weeks = ['2026-10-05', '2026-10-12']
    const rows = labRunning(
      [e('job', '2026-10-05', 50000), e('rent', '2026-10-05', 40000), e('food', '2026-10-05', 5000), e('trip', '2026-10-05', 2000), e('food', '2026-10-12', 6000)],
      categories,
      weeks,
      100000,
    )
    expect(rows[0]).toMatchObject({ start: 100000, income: 50000, expenses: 45000, savings: 2000, end: 103000, saved: 2000 })
    expect(rows[1]).toMatchObject({ start: 103000, expenses: 6000, end: 97000, saved: 2000 })
  })

  it('ignores entries of deleted categories', () => {
    expect(labRunning([e('gone', '2026-10-05', 999)], categories, ['2026-10-05'], 0)[0]!.end).toBe(0)
  })
})

it('colours balances outside the lines', () => {
  expect(balanceTone(-1, 0, 100000)).toBe('low')
  expect(balanceTone(0, 0, 100000)).toBeNull()
  expect(balanceTone(100001, 0, 100000)).toBe('high')
})

it('adds up a dropped cell', () => {
  expect(combineEntries({ cents: 35000 }, { cents: 30000 })).toEqual({ cents: 65000, formula: '350+300' })
  expect(combineEntries({ cents: 1250, formula: '10+2.5' }, { cents: -500 })).toEqual({ cents: 750, formula: '10+2.5-5' })
})

it('finds the columns a monthly payment falls in', () => {
  const weeks = labPeriods('2026-09-28', 9, 'week') // 28 Sep … 23 Nov
  expect(periodsWithDay(weeks, 1)).toEqual(['2026-09-28', '2026-10-26'])
  // No 31 November: its last day, the 30th, is not shown either.
  expect(periodsWithDay(weeks, 31)).toEqual(['2026-09-28', '2026-10-26'])
  expect(periodsWithDay(weeks, 15)).toEqual(['2026-10-12', '2026-11-09'])
  // Saturday 3 October is in a weekend column.
  expect(periodsWithDay(labPeriods('2026-09-28', 4, 'split'), 3)).toEqual(['2026-10-03'])
})

describe('columns', () => {
  it('lays out workweeks and weekends, and two-week columns', () => {
    expect(labPeriods('2026-10-05', 3, 'split')).toEqual([
      { start: '2026-10-05', days: 5 },
      { start: '2026-10-10', days: 2 },
      { start: '2026-10-12', days: 5 },
    ])
    expect(labPeriods('2026-10-05', 2, 'fortnight').map((p) => p.start)).toEqual(['2026-10-05', '2026-10-19'])
  })

  it('finds the column of a day', () => {
    expect(periodStartOf('2026-10-11', 'split', 1, '2026-10-05')).toBe('2026-10-10')
    expect(periodStartOf('2026-10-09', 'split', 1, '2026-10-05')).toBe('2026-10-05')
    expect(periodStartOf('2026-10-14', 'fortnight', 1, '2026-10-05')).toBe('2026-10-05')
    expect(periodStartOf('2026-10-20', 'fortnight', 1, '2026-10-05')).toBe('2026-10-19')
    expect(periodStartOf('2026-09-30', 'fortnight', 1, '2026-10-05')).toBe('2026-09-21')
  })

})

describe('pretendTransactions', () => {
  const categories = [cat('food', 'expenses'), cat('job', 'income')]
  const e = (categoryId: string, week: string, cents: number): LabEntry => ({ id: `${categoryId}|${week}`, categoryId, week, cents })
  const real = (date: string, cents: number) => ({ id: date, date, block: 'expenses' as const, categoryId: 'food', cents, details: '', tagIds: [], source: 'manual' as const, createdAt: 0 })
  const layout = { columns: 'week' as const, weekStart: 1 }

  it('skips columns that are over, takes what is left of today\'s, and all of later ones', () => {
    const out = pretendTransactions(
      [e('food', '2026-09-28', 5000), e('food', '2026-10-05', 5000), e('food', '2026-10-12', 6000), e('job', '2026-10-26', 100000)],
      categories,
      [real('2026-10-06', 3000), real('2026-09-30', 9999)],
      layout,
      '2026-10-07',
      { shiftLateIncome: true, lateIncomeDay: 20 },
    )
    expect(out.map((t) => [t.date, t.cents, t.month, t.block])).toEqual([
      ['2026-10-05', 2000, '2026-10', 'expenses'],
      ['2026-10-12', 6000, '2026-10', 'expenses'],
      // A salary in the week of 26 October counts for November, like a real one on the 25th or later.
      ['2026-10-26', 100000, '2026-11', 'income'],
    ])
    expect(out.every((t) => t.pretend)).toBe(true)
  })

  it('counts a column for the month most of it is in', () => {
    const rule = { shiftLateIncome: false, lateIncomeDay: 20 }
    const months = (week: string, columns: 'week' | 'fortnight') =>
      pretendTransactions([e('food', week, 100)], categories, [], { columns, weekStart: 1 }, '2026-01-01', rule)[0]!.month
    expect(months('2026-09-28', 'week')).toBe('2026-10')
    expect(months('2026-10-26', 'week')).toBe('2026-10')
    expect(months('2026-10-19', 'fortnight')).toBe('2026-10')
    expect(months('2026-10-26', 'fortnight')).toBe('2026-11')
  })

  it('drops today\'s column once more was really spent', () => {
    expect(pretendTransactions([e('food', '2026-10-05', 2000)], categories, [real('2026-10-06', 3000)], layout, '2026-10-07', { shiftLateIncome: false, lateIncomeDay: 20 })).toEqual([])
  })
})

it('lays out notes over the weeks they cover', () => {
  const weeks = labWeekList('2026-10-05', 4)
  const cells = noteCells(weeks, [{ week: '2026-10-12', text: 'Paris', span: 2 }, { week: '2026-10-26', text: 'cut off', span: 5 }])
  expect(cells.map((c) => [c.week, c.span, c.note?.text ?? null])).toEqual([
    ['2026-10-05', 1, null],
    ['2026-10-12', 2, 'Paris'],
    ['2026-10-26', 1, 'cut off'],
  ])
})
