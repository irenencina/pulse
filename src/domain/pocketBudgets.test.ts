import { describe, expect, it } from 'vitest'
import { pocketBudgets } from './pocketBudgets'
import type { Transaction } from './transactions'
import { DEFAULT_SETTINGS, type Category } from './types'

const cat = (id: string, parentId: string | null = null): Category => ({ id, block: 'expenses', parentId, name: id, order: 0, archived: false })
const categories = [cat('fun'), cat('dance', 'fun'), cat('rent')]
const plan = (categoryId: string, month: string, euros: number) => ({ id: `${categoryId}|${month}`, categoryId, month, kind: 'fixed' as const, cents: euros * 100 })
const cells = ['2026-08', '2026-09', '2026-10'].flatMap((m) => [plan('fun', m, 200), plan('dance', m, 50), plan('rent', m, 900)])
const spent = (categoryId: string, date: string, euros: number, pocket?: string): Transaction => ({
  id: `${categoryId}${date}${euros}`, date, block: 'expenses', categoryId, cents: euros * 100, details: '', tagIds: [], source: 'manual', createdAt: 0, ...(pocket ? { pocket } : {}),
})
const transactions = [
  spent('fun', '2026-08-10', 300), // 50 over in August: nothing carries, nothing is taken off
  spent('dance', '2026-09-10', 100), // 150 left in September
  spent('fun', '2026-10-03', 40),
  spent('rent', '2026-10-01', 900),
]
const settings = { ...DEFAULT_SETTINGS, startingYear: 2026, startingMonth: 8, shiftLateIncome: false }
const pockets = [
  { name: 'Mind & Fun', categoryIds: ['fun', 'dance'] },
  { name: 'Bills', categoryIds: ['rent'] },
]

describe('pocket budgets', () => {
  it('counts the plan and Tracking from any account, subcategories inside their parent', () => {
    const [bills, fun] = pocketBudgets(pockets, categories, cells, transactions, settings, '2026-10')
    expect(fun).toMatchObject({ pocket: 'Mind & Fun', budgetCents: 25000, spentCents: 4000, carriedCents: 0, leftovers: 'reset' })
    expect(fun!.spent).toEqual([{ categoryId: 'fun', cents: 4000 }])
    expect(bills).toMatchObject({ budgetCents: 90000, spentCents: 90000 })
  })

  it('carries last month’s leftover on top, never changing the budget', () => {
    const carrying = { ...settings, pocketLeftovers: { 'Mind & Fun': 'carry' as const } }
    const fun = pocketBudgets(pockets, categories, cells, transactions, carrying, '2026-10').find((p) => p.pocket === 'Mind & Fun')
    expect(fun).toMatchObject({ budgetCents: 25000, carriedCents: 15000 })
    // November adds October's leftover to September's: 250 + 150 − 40.
    expect(pocketBudgets(pockets, categories, cells, transactions, carrying, '2026-11').find((p) => p.pocket === 'Mind & Fun')).toMatchObject({ carriedCents: 36000 })
  })
})
