import { describe, expect, it } from 'vitest'
import type { Transaction } from './transactions'
import type { Category } from './types'
import { dueSoon, flagOf, groupOf, nextDate, upcomingEvents, type UpcomingInput } from './upcoming'
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
