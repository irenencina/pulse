import { describe, expect, it } from 'vitest'
import type { Transaction } from './transactions'
import type { Category } from './types'
import { balanceIn, lastNoted, lastUpdated, movePocket, topUpCents, payMore, payoff, pocketChecks, suggestBalance, worthHistory, worthIn, type Account, type Balance } from './worth'

const accounts: Account[] = [
  { id: 'bank', name: 'Bank', kind: 'bank', order: 0 },
  { id: 'loan', name: 'Loan', kind: 'loan', order: 1 },
]
const b = (accountId: string, month: string, euros: number): Balance => ({ id: `${accountId}|${month}`, accountId, month, cents: euros * 100 })
const balances = [b('bank', '2026-07', 1000), b('bank', '2026-09', 1500), b('loan', '2026-08', 400)]

describe('worth', () => {
  it('uses the last balance noted when a month was skipped', () => {
    expect(balanceIn(balances, 'bank', '2026-08')?.cents).toBe(100000)
    expect(balanceIn(balances, 'bank', '2026-06')).toBeNull()
  })

  it('takes what is owed off what is owned', () => {
    expect(worthIn(accounts, balances, '2026-09')).toEqual({ month: '2026-09', own: 150000, owe: 40000, net: 110000 })
  })

  it('runs from the first balance to the month asked, with the latest months kept', () => {
    expect(worthHistory(accounts, balances, '2026-10').map((p) => p.net / 100)).toEqual([1000, 600, 1100, 1100])
    expect(worthHistory(accounts, balances, '2026-10', 2).map((p) => p.month)).toEqual(['2026-09', '2026-10'])
    expect(worthHistory(accounts, [], '2026-10')).toEqual([])
  })

  it('knows the last month anything was noted', () => {
    expect(lastUpdated(balances)).toBe('2026-09')
    expect(lastUpdated([])).toBeNull()
  })

  it('works out when a loan is paid off and the interest until then', () => {
    // 1,200 at 0%: 12 payments of 100.
    expect(payoff(120000, 0, 10000, '2026-10')).toEqual({ months: 12, endMonth: '2027-10', interestCents: 0 })
    // With interest it takes longer and costs more.
    const plan = payoff(1000000, 6, 20000, '2026-10')
    expect(plan.months).toBe(58)
    expect(plan.interestCents).toBeGreaterThan(100000)
    expect(plan.interestCents).toBeLessThan(160000)
    // A payment that doesn't cover the interest never ends it.
    expect(payoff(1000000, 12, 10000, '2026-10').months).toBeNull()
    expect(payoff(0, 5, 10000, '2026-10').months).toBe(0)
  })

  it('shows what paying more changes', () => {
    const more = payMore(1000000, { ratePct: 6, paymentCents: 20000, day: 1 }, 5000, '2026-10')!
    expect(more.sooner).toBeGreaterThan(10)
    expect(more.savedCents).toBeGreaterThan(0)
    expect(payMore(120000, { ratePct: 0, paymentCents: 10000, day: 1 }, 2000, '2026-10')).toMatchObject({ months: 10, sooner: 2, savedCents: 0, endMonth: '2027-08' })
  })

  it('suggests a balance from Tracking or the loan terms', () => {
    const cats: Category[] = [
      { id: 'etf', block: 'savings', parentId: null, name: 'ETF', order: 0, archived: false },
      { id: 'etf-extra', block: 'savings', parentId: 'etf', name: 'Extra', order: 0, archived: false },
    ]
    const t = (date: string, categoryId: string, euros: number) => ({ id: date + categoryId, date, block: 'savings', categoryId, cents: euros * 100, details: '', tagIds: [], source: 'manual', createdAt: 0 }) as Transaction
    const etf: Account = { id: 'etf', name: 'ETF', kind: 'investment', order: 0, categoryId: 'etf' }
    const tx = [t('2026-09-02', 'etf', 400), t('2026-10-02', 'etf', 500), t('2026-10-20', 'etf-extra', 50), t('2026-11-02', 'etf', 500)]
    const noted = [b('etf', '2026-09', 6000)]
    expect(suggestBalance(etf, noted, '2026-10', tx, cats)).toEqual({ cents: 655000, from: 'tracking', changeCents: 55000 })
    // Nothing noted before, or nothing tracked: nothing to suggest.
    expect(suggestBalance(etf, [], '2026-10', tx, cats)).toBeNull()
    expect(suggestBalance({ ...etf, categoryId: undefined }, noted, '2026-10', tx, cats)).toBeNull()

    const loan: Account = { id: 'loan', name: 'Loan', kind: 'loan', order: 1, loan: { ratePct: 0, paymentCents: 10000, day: 1 } }
    expect(suggestBalance(loan, balances, '2026-10', [], [])).toEqual({ cents: 20000, from: 'loan', changeCents: -20000 })
  })

  it('gives each pocket its budget and what was spent per category', () => {
    const cats: Category[] = [
      { id: 'fun', block: 'expenses', parentId: null, name: 'Fun', order: 0, archived: false },
      { id: 'dance', block: 'expenses', parentId: 'fun', name: 'Dance', order: 0, archived: false },
      { id: 'rent', block: 'expenses', parentId: null, name: 'Rent', order: 1, archived: false },
      { id: 'energy', block: 'expenses', parentId: null, name: 'Energy', order: 2, archived: false },
    ]
    const pocketAccounts: Account[] = [
      { id: 'p-fun', name: 'Fun', kind: 'pocket', order: 0, bankName: 'Mind & Fun' },
      { id: 'p-bills', name: 'Bills', kind: 'pocket', order: 1, bankName: 'Bills' },
    ]
    const by = new Map([
      ['fun', { planned: 25000, tracked: 5000 }],
      ['dance', { planned: 7500, tracked: 2000 }],
      ['rent', { planned: 90000, tracked: 90000 }],
      ['energy', { planned: 6500, tracked: 7120 }],
    ])
    const noted = [b('p-fun', '2026-10', 50), b('p-bills', '2026-09', 30)]
    const checks = pocketChecks(
      [{ name: 'Bills', categoryIds: ['rent', 'energy'] }, { name: 'Mind & Fun', categoryIds: ['fun', 'dance'] }, { name: 'Gear', categoryIds: [] }],
      pocketAccounts,
      noted,
      cats,
      by,
      '2026-10',
    )
    // Dance is inside Fun, so it isn't counted twice.
    expect(checks.map((c) => [c.pocket, c.budgetCents, c.spentCents, c.spent.map((s) => s.categoryId), c.balance?.month ?? null])).toEqual([
      ['Mind & Fun', 25000, 5000, ['fun'], '2026-10'],
      ['Bills', 96500, 97120, ['rent', 'energy'], '2026-09'],
      ['Gear', 0, 0, [], null],
    ])
  })

  it('keeps the pockets in your order', () => {
    expect(movePocket(['A', 'B', 'C'], 'C', 'A', false)).toEqual(['C', 'A', 'B'])
    expect(movePocket(['A', 'B', 'C'], 'A', 'B', true)).toEqual(['B', 'A', 'C'])
    const checks = pocketChecks([{ name: 'A', categoryIds: [] }, { name: 'B', categoryIds: [] }, { name: 'C', categoryIds: [] }], [], [], [], new Map(), '2026-10', ['C', 'A'])
    expect(checks.map((c) => c.pocket)).toEqual(['C', 'A', 'B'])
  })
})

describe('last noted', () => {
  it('is the balance noted most recently, whatever its month', () => {
    const b = (month: MonthKeyLike, notedAt?: number, imported?: boolean): Balance => ({ id: month, accountId: 'a', month, cents: 1, notedAt, imported })
    expect(lastNoted([b('2026-09', 5, true), b('2026-10', 3), b('2026-08')])).toMatchObject({ month: '2026-09', imported: true })
    expect(lastNoted([b('2026-08')])).toBeNull()
  })
})

type MonthKeyLike = `${number}-${number}`

describe('pocket leftovers', () => {
  const account: Account = { id: 'p', name: 'Fun', kind: 'pocket', order: 0, bankName: 'Fun' }
  const cats: Category[] = [{ id: 'fun', name: 'Fun', block: 'expenses', parentId: null, order: 0 } as Category]
  const check = (euros: number, mode: 'carry' | 'reset') =>
    pocketChecks([{ name: 'Fun', categoryIds: ['fun'] }], [account], [b('p', '2026-10', euros)], cats, new Map([['fun', { planned: 30000, tracked: 10000 }]]), '2026-10', [], { Fun: mode })[0]!

  it('carries over what the pocket holds past this month’s top-up', () => {
    // Budget 300, spent 100: holding 420 means 220 came from last month.
    expect(check(420, 'carry')).toMatchObject({ carriedCents: 22000, shortCents: 0 })
    expect(check(420, 'reset')).toMatchObject({ carriedCents: 0, shortCents: 0 })
    // Holding 150 of the 200 still to spend: 50 short.
    expect(check(150, 'carry')).toMatchObject({ carriedCents: 0, shortCents: 5000 })
  })

  it('tops up the budget, or only what’s missing when it resets', () => {
    expect(topUpCents(check(420, 'carry'), 30000, '2026-10')).toBe(30000)
    // 220 will be left once the other 200 is spent, so only 80 goes in.
    expect(topUpCents(check(420, 'reset'), 30000, '2026-10')).toBe(8000)
    expect(topUpCents(check(150, 'reset'), 30000, '2026-10')).toBe(30000)
  })
})
