import { describe, expect, it } from 'vitest'
import { balanceIn, lastUpdated, worthHistory, worthIn, type Account, type Balance } from './worth'

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
})
