import { expect, it } from 'vitest'
import type { BudgetCell } from './budget'
import { safetyLevel, safetyNet } from './safetyNet'
import type { Transaction } from './transactions'
import { DEFAULT_SETTINGS, type Category } from './types'

const cat = (id: string, block: Category['block'], extra: Partial<Category> = {}): Category => ({ id, block, parentId: null, name: id, order: 0, archived: false, ...extra })
const cell = (categoryId: string, month: string, cents: number): BudgetCell => ({ id: `${categoryId}|${month}`, categoryId, month, kind: 'fixed', cents })
const tx = (date: string, categoryId: string, cents: number): Transaction => ({ id: `${date}${categoryId}`, date, block: 'expenses', categoryId, cents, details: '', tagIds: [], source: 'manual', createdAt: 0 })

it('divides the emergency fund by essential spending', () => {
  const settings = { ...DEFAULT_SETTINGS, startingYear: 2026, startingMonth: 1, saveNonAllocated: false, allowDissaving: false }
  const categories = [cat('Emergency Fund', 'savings'), cat('Rent', 'expenses'), cat('Fun', 'expenses'), cat('Groceries', 'expenses', { essential: false }), cat('Gym', 'expenses', { essential: true })]
  const cells = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].map((m) => cell('Emergency Fund', `2026-${m}`, 30000))
  // Planned only, no history yet: rent 800 + gym 30 a month.
  const planned = safetyNet(categories, [...cells, ...['01', '02'].flatMap((m) => [cell('Rent', `2026-${m}`, 80000), cell('Gym', `2026-${m}`, 3000)])], [], settings, '2026-10-08')
  expect(planned.netCents).toBe(300000)
  expect(planned.basis).toBe('planned')
  expect(planned.essentials).toEqual(['Rent', 'Gym'])
  // With two months tracked, the tracked average is used: (1000 + 1000) / 2.
  const tracked = safetyNet(categories, cells, [tx('2026-08-01', 'Rent', 80000), tx('2026-08-05', 'Gym', 20000), tx('2026-09-01', 'Rent', 100000), tx('2026-09-03', 'Fun', 5000)], settings, '2026-10-08')
  expect(tracked).toMatchObject({ basis: 'tracked', monthlyCents: 100000, months: 3, trackedMonths: 2 })
  expect(safetyLevel(tracked.months)).toBe('ok')
})

it("doesn't let a Main Pot below zero cancel out the emergency fund", () => {
  const settings = { ...DEFAULT_SETTINGS, startingYear: 2026, startingMonth: 1, saveNonAllocated: false, allowDissaving: true }
  const categories = [cat('Job', 'income'), cat('Emergency Fund', 'savings'), cat('Rent', 'expenses')]
  // Each month plans 100 more than comes in, so the Main Pot ends October at −1000.
  const cells = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].flatMap((m) => [
    cell('Job', `2026-${m}`, 100000),
    cell('Rent', `2026-${m}`, 80000),
    cell('Emergency Fund', `2026-${m}`, 30000),
  ])
  const net = safetyNet(categories, cells, [], settings, '2026-10-08')
  expect(net).toMatchObject({ mainPotCents: -100000, fundsCents: 300000, netCents: 300000 })
})
