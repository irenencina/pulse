import { describe, expect, it } from 'vitest'
import { contactEmail, contactPhone, nextCheck, sheetAccounts, sheetBills } from './emergency'
import { upcomingEvents, type UpcomingEvent } from './upcoming'
import type { Account, Balance } from './worth'
import { DEFAULT_SETTINGS } from './types'

describe('emergency sheet', () => {
  it('reads a contact saved before phone and email were apart', () => {
    expect(contactPhone({ id: 'a', name: 'A', reach: '+39 342' })).toBe('+39 342')
    expect(contactEmail({ id: 'a', name: 'A', reach: '+39 342' })).toBeUndefined()
    expect(contactEmail({ id: 'b', name: 'B', reach: 'b@example.com' })).toBe('b@example.com')
  })

  it('is due for a check six months after the last one, on the last day of a shorter month', () => {
    expect(nextCheck(undefined)).toBeNull()
    expect(nextCheck({ contacts: [] })).toBeNull()
    expect(nextCheck({ contacts: [], checkedOn: '2026-04-10' })).toBe('2026-10-10')
    expect(nextCheck({ contacts: [], checkedOn: '2026-08-31' })).toBe('2027-02-28')
  })

  it('shows in Upcoming from two weeks before a check is due', () => {
    const input = { categories: [], cells: [], transactions: [], wishes: [], items: [], overrides: [] }
    const at = (checkedOn: string, today: string) =>
      upcomingEvents({ ...input, settings: { ...DEFAULT_SETTINGS, emergency: { contacts: [], checkedOn } } }, today).filter((e) => e.source === 'emergency')
    expect(at('2026-04-10', '2026-09-20')).toEqual([])
    expect(at('2026-04-10', '2026-09-27')).toMatchObject([{ kind: 'checkUp', date: '2026-10-10' }])
    // Overdue: it stays, dated today, until it's checked.
    expect(at('2026-04-10', '2026-11-02')).toMatchObject([{ date: '2026-11-02' }])
  })

  it('lists the latest balance of each account, and when a loan is paid off', () => {
    const accounts: Account[] = [
      { id: 'b', name: 'Bank', kind: 'bank', order: 0 },
      { id: 'l', name: 'Loan', kind: 'loan', order: 1, loan: { ratePct: 0, paymentCents: 10000, day: 1 } },
    ]
    const balances: Balance[] = [
      { id: 'b|2026-08', accountId: 'b', month: '2026-08', cents: 50000 },
      { id: 'l|2026-10', accountId: 'l', month: '2026-10', cents: 30000 },
    ]
    const { own, owe } = sheetAccounts(accounts, balances, '2026-10')
    expect(own).toMatchObject([{ cents: 50000, month: '2026-08' }])
    expect(owe).toMatchObject([{ cents: 30000, monthlyCents: 10000, endMonth: '2027-01' }])
  })

  it('keeps one line per bill, next payment first, without loans or what is paid already', () => {
    const e = (over: Partial<UpcomingEvent>): UpcomingEvent => ({ key: 'k', sourceKey: 's', source: 'own', kind: 'payment', name: 'x', cents: 100, date: '2026-10-20', repeat: 'month', categoryId: null, ...over })
    const bills = sheetBills([
      e({ key: 'a1', sourceKey: 'a', name: 'Rent', date: '2026-11-01' }),
      e({ key: 'a0', sourceKey: 'a', name: 'Rent', date: '2026-10-01', done: true }),
      e({ key: 'a2', sourceKey: 'a', name: 'Rent', date: '2026-12-01' }),
      e({ key: 'l', sourceKey: 'loan', source: 'loan', name: 'Loan' }),
      e({ key: 'y', sourceKey: 'y', name: 'Insurance', repeat: 'year' }),
      e({ key: 'c', sourceKey: 'c', kind: 'cancelBy', name: 'Gym' }),
    ])
    expect(bills.map((b) => [b.name, b.date])).toEqual([
      ['Rent', '2026-11-01'],
      ['Insurance', '2026-10-20'],
    ])
  })
})
