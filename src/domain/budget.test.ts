import { describe, expect, it } from 'vitest'
import { cellId, computePlan, formatCellInput, monthlyAverage, parseCellInput, type BudgetCell } from './budget'
import type { Category } from './types'

const cat = (id: string, block: Category['block'], parentId: string | null = null): Category => ({
  id,
  block,
  parentId,
  name: id,
  order: 0,
  archived: false,
})

const fixed = (categoryId: string, month: string, euros: number): BudgetCell => ({
  id: cellId(categoryId, month),
  categoryId,
  month,
  kind: 'fixed',
  cents: Math.round(euros * 100),
})
const percent = (categoryId: string, month: string, pct: number): BudgetCell => ({
  id: cellId(categoryId, month),
  categoryId,
  month,
  kind: 'percent',
  basisPoints: pct * 100,
})

const settings = { startingYear: 2026, saveNonAllocated: true, allowDissaving: true }

// The numbers from the original spreadsheet, September to November 2026.
const categories = [
  cat('job', 'income'),
  cat('rent', 'expenses'),
  cat('other-expenses', 'expenses'),
  cat('emergency', 'savings'),
  cat('etf', 'savings'),
  cat('travel', 'savings'),
]
const sheetMonths = { '2026-09': 1500.0, '2026-10': 1505.0, '2026-11': 2005.0 } // expenses besides rent
const cells: BudgetCell[] = Object.entries(sheetMonths).flatMap(([month, other]) => [
  fixed('job', month, 3119.22),
  fixed('rent', month, 486.5),
  fixed('other-expenses', month, other),
  fixed('emergency', month, 500),
  percent('etf', month, 15),
  fixed('travel', month, 200),
])

describe('computePlan with the spreadsheet figures', () => {
  const plan = computePlan(categories, cells, settings, 2026)
  const sep = plan.totals[8]!
  const oct = plan.totals[9]!
  const nov = plan.totals[10]!

  it('works out percentage lines from that month’s income', () => {
    expect(plan.amounts.get('etf')![8]).toBe(46788) // 15% of 3,119.22
  })

  it('sends the remainder to the Main Pot, negative when spending is higher (the "Future" line)', () => {
    expect(sep.expenses).toBe(198650)
    expect(sep.mainPot).toBe(-3516)
    expect(oct.mainPot).toBe(-4016)
    expect(nov.mainPot).toBe(-54016)
    expect(sep.toAllocate).toBe(0)
  })

  it('keeps a running total of everything saved, like "Pot Total"', () => {
    expect(sep.savedTotal).toBe(113272)
    expect(oct.savedTotal).toBe(226044)
    expect(nov.savedTotal).toBe(288816)
  })

  it('carries balances into the next year', () => {
    const next = computePlan(categories, [...cells, fixed('job', '2027-01', 100)], settings, 2027)
    expect(next.totals[0]!.savedTotal).toBe(288816 + 10000)
    expect(next.totals[0]!.potBalance).toBe(-3516 - 4016 - 54016 + 10000)
  })
})

describe('settings', () => {
  const tight = [fixed('job', '2026-01', 1000), fixed('rent', '2026-01', 1200)]
  const surplus = [fixed('job', '2026-01', 1000), fixed('rent', '2026-01', 400)]

  it('without dissaving, an overspent month shows as negative to allocate', () => {
    const jan = computePlan(categories, tight, { ...settings, allowDissaving: false }, 2026).totals[0]!
    expect(jan.mainPot).toBe(0)
    expect(jan.toAllocate).toBe(-20000)
  })

  it('without "save non-allocated", a surplus stays to be allocated', () => {
    const jan = computePlan(categories, surplus, { ...settings, saveNonAllocated: false }, 2026).totals[0]!
    expect(jan.mainPot).toBe(0)
    expect(jan.toAllocate).toBe(60000)
  })
})

it('rolls subcategories up into their parents', () => {
  const tree = [cat('sports', 'expenses'), cat('football', 'expenses', 'sports'), cat('boots', 'expenses', 'football')]
  const plan = computePlan(tree, [fixed('boots', '2026-03', 80), fixed('football', '2026-03', 20)], settings, 2026)
  expect(plan.amounts.get('sports')![2]).toBe(10000)
  expect(plan.amounts.get('football')![2]).toBe(10000)
  expect(plan.amounts.get('boots')![2]).toBe(8000)
  expect(plan.totals[2]!.expenses).toBe(10000)
})

it('leaves archived categories out of the totals', () => {
  const archived = [{ ...cat('rent', 'expenses'), archived: true }]
  expect(computePlan(archived, [fixed('rent', '2026-01', 100)], settings, 2026).totals[0]!.expenses).toBe(0)
})

it('spreads a yearly cost into a monthly average', () => {
  expect(monthlyAverage([0, 0, 0, 0, 0, 0, 0, 0, 24000, 0, 0, 0])).toBe(2000)
})

describe('cell input', () => {
  it.each([
    ['486,50', { kind: 'fixed', cents: 48650 }],
    ['15%', { kind: 'percent', basisPoints: 1500 }],
    ['12,5 %', { kind: 'percent', basisPoints: 1250 }],
    ['', null],
    ['abc', undefined],
    ['-5%', undefined],
  ])('%s', (input, expected) => {
    expect(parseCellInput(input)).toEqual(expected)
  })

  it('formats for editing', () => {
    expect(formatCellInput({ kind: 'fixed', cents: 48650 })).toBe('486.50')
    expect(formatCellInput({ kind: 'percent', basisPoints: 1500 })).toBe('15%')
  })
})
