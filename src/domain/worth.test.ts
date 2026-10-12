import { describe, expect, it } from 'vitest'
import type { Transaction } from './transactions'
import type { Category } from './types'
import { balanceIn, lastNoted, lastUpdated, movePocket, topUpCents, payMore, payoff, pocketStatements, sortPockets, suggestBalance, worthHistory, worthIn, type Account, type Balance } from './worth'

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

  it('reads each pocket’s month from the bank: start, put in, paid out, in it now', () => {
    const accounts: Account[] = [
      { id: 'p-fun', name: 'Fun', kind: 'pocket', order: 0, bankName: 'Mind & Fun' },
      { id: 'p-bills', name: 'Bills', kind: 'pocket', order: 1, bankName: 'Bills' },
    ]
    const paid = (date: string, pocket: string | undefined, categoryId: string | null, euros: number): Transaction => ({
      id: `${date}${categoryId}${euros}`, date, block: 'expenses', categoryId, cents: euros * 100, details: '', tagIds: [], source: 'revolut', createdAt: 0, ...(pocket ? { pocket } : {}),
    })
    const tx = [
      paid('2026-10-03', 'Mind & Fun', 'fun', 30),
      paid('2026-10-05', 'Mind & Fun', 'fun', 20),
      paid('2026-10-06', 'Mind & Fun', null, 10),
      // From the main account, or before this month: not the pocket's.
      paid('2026-10-07', undefined, 'fun', 99),
      paid('2026-09-28', 'Mind & Fun', 'fun', 40),
      // After the balance was imported: not in it yet.
      paid('2026-10-12', 'Mind & Fun', 'fun', 5),
    ]
    const noted = [b('p-fun', '2026-09', 100), { ...b('p-fun', '2026-10', 250), notedAt: new Date(2026, 9, 9, 9).getTime() }, b('p-bills', '2026-09', 30)]
    const [fun, bills, gear] = pocketStatements(
      [{ name: 'Bills', categoryIds: [] }, { name: 'Mind & Fun', categoryIds: [] }, { name: 'Gear', categoryIds: [] }],
      accounts,
      noted,
      tx,
      '2026-10',
    )
    // 100 + 210 − 60 = 250.
    expect(fun).toMatchObject({ pocket: 'Mind & Fun', month: '2026-10', startCents: 10000, inCents: 21000, outCents: 6000, nowCents: 25000 })
    expect(fun!.out).toEqual([{ categoryId: 'fun', cents: 5000 }, { categoryId: null, cents: 1000 }])
    // Only September's balance: that month, with no start known.
    expect(bills).toMatchObject({ month: '2026-09', startCents: null, inCents: null, nowCents: 3000 })
    expect(gear).toMatchObject({ month: null, nowCents: null })
  })

  it('keeps the pockets in your order', () => {
    expect(movePocket(['A', 'B', 'C'], 'C', 'A', false)).toEqual(['C', 'A', 'B'])
    expect(movePocket(['A', 'B', 'C'], 'A', 'B', true)).toEqual(['B', 'A', 'C'])
    expect(sortPockets([{ pocket: 'A' }, { pocket: 'B' }, { pocket: 'C' }], ['C', 'A']).map((c) => c.pocket)).toEqual(['C', 'A', 'B'])
  })

  it('tops up the budget, or only what’s missing when it resets', () => {
    expect(topUpCents('carry', 30000, 22000)).toBe(30000)
    expect(topUpCents('reset', 30000, 22000)).toBe(8000)
    expect(topUpCents('reset', 30000, null)).toBe(30000)
    expect(topUpCents('reset', 30000, 40000)).toBe(0)
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
