import { describe, expect, it } from 'vitest'
import type { Transaction } from './transactions'
import type { Category } from './types'
import { dueSoon, flagOf, groupOf, inMonth, nextDate, trackedPayments, upcomingEvents, type UpcomingInput } from './upcoming'
import type { WishItem } from './wishlist'

const settings = { shiftLateIncome: false, lateIncomeDay: 20 }
let n = 0
const tx = (date: string, cents: number, details: string, categoryId = 'subs'): Transaction => ({
  id: `t${n++}`,
  date,
  block: 'expenses',
  categoryId,
  cents,
  details,
  tagIds: [],
  source: 'manual',
  createdAt: 0,
})
const cat = (id: string, extra: Partial<Category> = {}): Category => ({ id, block: 'expenses', parentId: null, name: id, order: 0, archived: false, ...extra })
const empty: UpcomingInput = { categories: [], cells: [], transactions: [], wishes: [], items: [], overrides: [], settings }
const today = '2026-10-08'

describe('upcoming', () => {
  it('repeats dates and keeps the day of the month', () => {
    expect(nextDate('2026-01-31', 'month', '2026-03-01')).toBe('2026-03-31')
    expect(nextDate('2024-12-12', 'year', today)).toBe('2026-12-12')
    expect(nextDate('2026-01-01', 'once', today)).toBeNull()
  })

  it('finds once-a-year planner lines and payments that repeat in Tracking', () => {
    const events = upcomingEvents(
      {
        ...empty,
        categories: [cat('club', { name: 'Football club', yearly: { month: 3, cents: 24000 } }), cat('subs')],
        transactions: [tx('2026-08-14', 1099, 'Spotify'), tx('2026-09-14', 1299, 'Spotify'), tx('2026-08-01', 80000, 'Landlord', 'rent'), tx('2026-09-01', 80000, 'Landlord', 'rent'), tx('2026-10-01', 80000, 'Landlord', 'rent')],
      },
      today,
    )
    expect(events.map((e) => [e.name, e.date, e.done ?? false])).toEqual([
      ['Landlord', '2026-10-01', true],
      ['Spotify', '2026-10-14', false],
      ['Landlord', '2026-11-01', false],
      ['Football club', '2027-03-01', false],
    ])
    expect(events[1]!.priceUp).toEqual({ from: 1099, to: 1299 })
    expect(flagOf(events[1]!, today)).toBe('priceUp')
    expect(groupOf(events[2]!, today)).toBe('nextMonth')
    expect(dueSoon(events, today)).toBe(1)
  })

  it('adds a last day to cancel, and hides what you hid', () => {
    const items = [{ id: 'gym', name: 'Gym contract', cents: 3500, date: '2025-11-01', repeat: 'year' as const, categoryId: null, noticeDays: 30 }]
    const events = upcomingEvents({ ...empty, items }, today)
    expect(events.map((e) => [e.kind, e.date])).toEqual([
      ['payment', '2026-11-01'],
      ['cancelBy', '2027-10-02'],
    ])
    // The notice date for this November is already past, so the next one counts.
    expect(events[1]!.renewsOn).toBe('2027-11-01')
    expect(upcomingEvents({ ...empty, items, overrides: [{ id: 'own:gym', hidden: true }] }, today)).toEqual([])
  })

  it('lists owned subscriptions and running warranties', () => {
    const base = { kind: 'item' as const, priceCents: 100, categoryIds: [], tagIds: [], desired: false, order: 0, addedOn: '2025-01-01', owned: true, status: 'inUse' as const }
    const wishes: WishItem[] = [
      { ...base, id: 'n', name: 'Netflix', kind: 'subscription', priceCents: 1399, purchasedOn: '2025-02-20' },
      { ...base, id: 'l', name: 'Laptop', purchasedOn: '2025-11-01', warrantyUntil: '2026-11-01' },
      { ...base, id: 'o', name: 'Old phone', purchasedOn: '2022-01-01', warrantyUntil: '2024-01-01' },
    ]
    const events = upcomingEvents({ ...empty, wishes }, today)
    expect(events.map((e) => [e.name, e.date, e.kind])).toEqual([
      ['Netflix', '2026-10-20', 'payment'],
      ['Laptop', '2026-11-01', 'warranty'],
    ])
    expect(flagOf(events[1]!, today)).toBe('warrantySoon')
  })
})

describe('trackedPayments', () => {
  const t = (date: string, details: string, cents: number): Transaction => ({ id: date + details, date, block: 'expenses', categoryId: 'c', cents, details, tagIds: [], source: 'manual', createdAt: 0 })
  const list = [t('2026-08-03', 'Gym', 3000), t('2026-09-03', 'Gym', 3000), t('2026-10-03', 'Gym', 3200), t('2025-10-20', 'Club fee', 15000)]
  it('counts the same payee with the same amount, most often first, and guesses how often it comes', () => {
    expect(trackedPayments(list, '2026-10-09').map((p) => [p.name, p.cents, p.times, p.repeat, p.nextDate])).toEqual([
      ['Gym', 3000, 2, 'month', '2026-11-03'],
      ['Gym', 3200, 1, 'year', '2027-10-03'],
      ['Club fee', 15000, 1, 'year', '2026-10-20'],
    ])
  })
  it('keeps only repeated payments when asked', () => {
    expect(trackedPayments(list, '2026-10-09', true).map((p) => p.cents)).toEqual([3000])
  })
})

describe('alerts and the calendar', () => {
  const insurance = { id: 'ins', name: 'Insurance', cents: 30000, date: '2026-10-12', repeat: 'month' as const, categoryId: null }
  it('shows Due soon only inside the reminder, separately from the cancel line', () => {
    const plain = upcomingEvents({ ...empty, items: [insurance] }, today)
    expect(plain.map((e) => flagOf(e, today))).toEqual([null])
    const reminded = upcomingEvents({ ...empty, items: [{ ...insurance, remindDays: 7 }] }, today)
    expect(reminded.map((e) => [e.kind, flagOf(e, today)])).toEqual([['payment', 'dueSoon']])
    const both = upcomingEvents({ ...empty, items: [{ ...insurance, remindDays: 1, noticeDays: 30 }] }, today)
    expect(both.map((e) => [e.kind, e.date, flagOf(e, today)])).toEqual([
      ['payment', '2026-10-12', null],
      ['cancelBy', '2026-10-13', 'cancelSoon'],
    ])
  })

  it('puts a monthly payment in every month of the calendar', () => {
    const events = upcomingEvents({ ...empty, items: [insurance, { ...insurance, id: 'id', name: 'ID card', repeat: 'once', date: '2027-01-20' }] }, today)
    expect([...inMonth(events, '2026-12').days.keys()]).toEqual(['2026-12-12'])
    expect([...inMonth(events, '2027-01').days.keys()].sort()).toEqual(['2027-01-12', '2027-01-20'])
  })
})

it('leaves out what you ticked as cancelled', () => {
  const item = { id: 'gym', name: 'Gym', cents: 3000, date: '2026-10-20', repeat: 'month' as const, categoryId: null, noticeDays: 30 }
  expect(upcomingEvents({ ...empty, items: [item] }, today)).toHaveLength(2)
  expect(upcomingEvents({ ...empty, items: [{ ...item, cancelledOn: today }] }, today)).toEqual([])
})
