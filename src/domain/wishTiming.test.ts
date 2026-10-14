import { describe, expect, it } from 'vitest'
import type { Transaction } from './transactions'
import { DEFAULT_SETTINGS, type Category, type SaleDates } from './types'
import { upcomingEvents, flagOf } from './upcoming'
import type { WishItem } from './wishlist'
import { affordability, nextSale, saleDayIn, readyToBuy, saleWindow, wishAffordability, wishTiming } from './wishTiming'

const today = '2026-10-13'
const wish = (extra: Partial<WishItem> = {}): WishItem => ({
  id: 'w',
  name: 'Headphones',
  kind: 'item',
  priceCents: 20000,
  categoryIds: [],
  tagIds: [],
  desired: false,
  order: 0,
  addedOn: '2026-10-01',
  owned: false,
  ...extra,
})
const cat = (id: string, block: Category['block'] = 'expenses'): Category => ({ id, block, parentId: null, name: id, order: 0, archived: false })
const tx = (categoryId: string, cents: number, date = '2026-10-05'): Transaction => ({
  id: `${categoryId}${cents}${date}`,
  date,
  block: categoryId === 'fund' ? 'savings' : 'expenses',
  categoryId,
  cents,
  details: '',
  tagIds: [],
  source: 'manual',
  createdAt: 0,
})
const settings = { ...DEFAULT_SETTINGS, startingYear: 2026, startingMonth: 1, shiftLateIncome: false }

describe('wish timing', () => {
  it('finds the sales: Black Friday to Cyber Monday, January and summer sales', () => {
    expect(saleWindow('blackFriday', 2026)).toEqual({ from: '2026-11-27', to: '2026-11-30' })
    expect(saleWindow('blackFriday', 2025)).toEqual({ from: '2025-11-28', to: '2025-12-01' })
    expect(nextSale('januarySales', today)).toEqual({ from: '2027-01-02', to: '2027-01-31' })
    expect(nextSale('summerSales', '2026-07-15')).toEqual({ from: '2026-07-01', to: '2026-07-31' })
  })

  it('counts down a wait, a date or a sale', () => {
    expect(wishTiming(wish(), today)).toBeNull()
    expect(wishTiming(wish({ notBefore: { wait: 30 } }), today)).toMatchObject({ from: '2026-10-31', ready: false, label: 'Wait 18 days' })
    expect(wishTiming(wish({ notBefore: { wait: 7 } }), today)).toMatchObject({ ready: true })
    expect(wishTiming(wish({ notBefore: { date: '2026-12-01' } }), today)).toMatchObject({ ready: false, label: 'From Dec 01' })
    expect(wishTiming(wish({ notBefore: { sale: 'blackFriday' } }), today)).toMatchObject({ from: '2026-11-27', until: '2026-11-30', ready: false, label: 'Black Friday' })
    expect(wishTiming(wish({ notBefore: { sale: 'blackFriday' } }), '2026-11-28')).toMatchObject({ ready: true, label: 'Black Friday now' })
    // Bought: nothing to wait for.
    expect(wishTiming(wish({ notBefore: { wait: 30 }, owned: true }), today)).toBeNull()
  })

  it('checks the price against what is left where it is paid from', () => {
    const categories = [cat('tech'), cat('fund', 'savings')]
    const cells = [
      { id: 'tech|2026-10', categoryId: 'tech', month: '2026-10', kind: 'fixed' as const, cents: 25000 },
      { id: 'tech|2026-11', categoryId: 'tech', month: '2026-11', kind: 'fixed' as const, cents: 25000 },
      { id: 'fund|2026-10', categoryId: 'fund', month: '2026-10', kind: 'fixed' as const, cents: 10000 },
    ]
    const input = { categories, cells, transactions: [tx('tech', 3000)], settings }
    // 250 − 30 left this month.
    expect(affordability(wish({ paidFrom: 'tech' }), input, today)).toEqual({ state: 'now' })
    expect(affordability(wish({ paidFrom: 'tech', priceCents: 24000 }), input, today)).toEqual({ state: 'later', month: '2026-11' })
    expect(affordability(wish({ paidFrom: 'tech', priceCents: 90000 }), input, today)).toEqual({ state: 'over' })
    // A savings fund: 150 put in so far, 100 more each month.
    const saved = { ...input, transactions: [tx('fund', 15000, '2026-09-05')] }
    expect(affordability(wish({ paidFrom: 'fund', priceCents: 12000 }), saved, today)).toEqual({ state: 'now' })
    expect(affordability(wish({ paidFrom: 'fund', priceCents: 40000 }), saved, today)).toEqual({ state: 'later', month: '2027-01' })
    // Nothing to check against.
    expect(affordability(wish(), input, today)).toBeNull()
    expect(affordability(wish({ paidFrom: 'tech', priceCents: null }), input, today)).toBeNull()
    expect(readyToBuy(null, null)).toBe(false)
    expect(readyToBuy(null, { state: 'now' })).toBe(true)
    expect(readyToBuy(null, { state: 'over' })).toBe(false)
  })

  it('tells Upcoming when a wish is ready to buy, without counting it as a payment', () => {
    const wishes = [wish({ id: 'a', notBefore: { wait: 30 } }), wish({ id: 'b', name: 'Coat', notBefore: { sale: 'blackFriday' } }), wish({ id: 'c', name: 'Lamp' })]
    const events = upcomingEvents({ categories: [], cells: [], transactions: [], wishes, items: [], overrides: [], settings }, today)
    const ready = events.filter((e) => e.kind === 'wishReady')
    expect(ready.map((e) => [e.name, e.date, e.note])).toEqual([
      ['Headphones', '2026-10-31', 'Cooling-off wait over'],
      ['Coat', '2026-11-27', 'Black Friday'],
    ])
    expect(flagOf(ready[0]!, '2026-10-25')).toBe('readySoon')
    expect(flagOf(ready[0]!, today)).toBeNull()
    // Long after the wait ended, it no longer shows.
    const later = upcomingEvents({ categories: [], cells: [], transactions: [], wishes, items: [], overrides: [], settings }, '2026-11-20')
    expect(later.some((e) => e.wishId === 'a')).toBe(false)
  })
})

describe('wish queue', () => {
  const categories = [cat('tech'), cat('fund', 'savings')]
  const cells = [
    { id: 'tech|2026-10', categoryId: 'tech', month: '2026-10', kind: 'fixed' as const, cents: 25000 },
    { id: 'tech|2026-11', categoryId: 'tech', month: '2026-11', kind: 'fixed' as const, cents: 25000 },
    { id: 'fund|2026-10', categoryId: 'fund', month: '2026-10', kind: 'fixed' as const, cents: 10000 },
  ]

  it('takes wishes paid from the same category in your order', () => {
    const input = { categories, cells, transactions: [tx('tech', 3000)], settings }
    // 220 left: the first fits now, the second waits for November, a huge one doesn't hold up the last.
    const wishes = [
      wish({ id: 'a', order: 0, paidFrom: 'tech', priceCents: 15000 }),
      wish({ id: 'b', order: 1, paidFrom: 'tech', priceCents: 15000 }),
      wish({ id: 'c', order: 2, paidFrom: 'tech', priceCents: 90000 }),
      wish({ id: 'd', order: 3, paidFrom: 'tech', priceCents: 5000 }),
      wish({ id: 'e', order: 4, paidFrom: 'tech', priceCents: 1000 }),
    ]
    const result = wishAffordability(wishes, input, today)
    expect(result.get('a')).toEqual({ state: 'now' })
    expect(result.get('b')).toEqual({ state: 'later', month: '2026-11' })
    expect(result.get('c')).toEqual({ state: 'over' })
    // Small enough for this month, but its turn comes after b.
    expect(result.get('d')).toEqual({ state: 'later', month: '2026-11' })
    expect(result.get('e')).toEqual({ state: 'later', month: '2026-11' })
  })

  it('counts what was bought from a savings fund as taken out of it', () => {
    const input = { categories, cells, transactions: [tx('fund', 30000, '2026-09-05')], settings }
    const wishes = [
      wish({ id: 'bought', owned: true, paidFrom: 'fund', paidCents: 20000 }),
      wish({ id: 'a', order: 0, paidFrom: 'fund', priceCents: 10000 }),
      wish({ id: 'b', order: 1, paidFrom: 'fund', priceCents: 10000 }),
    ]
    const result = wishAffordability(wishes, input, today)
    // 300 saved − 200 bought = 100: enough for a, and b needs one more month of 100.
    expect(result.get('a')).toEqual({ state: 'now' })
    expect(result.get('b')).toEqual({ state: 'later', month: '2026-11' })
    expect(result.get('bought')).toBeNull()
  })

  it('uses the sale days set in Settings', () => {
    const dates: SaleDates = {
      januarySales: { from: { on: 'date', month: 1, day: 7 }, to: { on: 'date', month: 2, day: 28 } },
      summerSales: { from: { on: 'date', month: 12, day: 26 }, to: { on: 'date', month: 1, day: 6 } },
    }
    expect(nextSale('januarySales', today, dates)).toEqual({ from: '2027-01-07', to: '2027-02-28' })
    // Running across New Year, and still running on Jan 03.
    expect(nextSale('summerSales', today, dates)).toEqual({ from: '2026-12-26', to: '2027-01-06' })
    expect(nextSale('summerSales', '2027-01-03', dates)).toEqual({ from: '2026-12-26', to: '2027-01-06' })
    expect(wishTiming(wish({ notBefore: { sale: 'januarySales' } }), '2027-01-03', dates)).toMatchObject({ ready: false, from: '2027-01-07' })
  })
})

it('finds a week of the month or a weekday', () => {
  // October 2026 starts on a Thursday.
  expect(saleDayIn({ on: 'week', month: 10, week: 2 }, 2026, false)).toBe('2026-10-08')
  expect(saleDayIn({ on: 'week', month: 10, week: 2 }, 2026, true)).toBe('2026-10-14')
  expect(saleDayIn({ on: 'week', month: 2, week: 4 }, 2028, true)).toBe('2028-02-29')
  expect(saleDayIn({ on: 'weekday', month: 10, nth: 1, weekday: 1 }, 2026, false)).toBe('2026-10-05')
  expect(saleDayIn({ on: 'weekday', month: 10, nth: 5, weekday: 6 }, 2026, true)).toBe('2026-10-31')
  expect(saleDayIn({ on: 'weekday', month: 10, nth: 5, weekday: 1 }, 2026, true)).toBe('2026-10-26')
  expect(saleDayIn({ on: 'date', month: 2, day: 31 }, 2026, true)).toBe('2026-02-28')
  // Summer sales from the first Monday of July to the end of August.
  const dates: SaleDates = {
    januarySales: { from: { on: 'date', month: 1, day: 7 }, to: { on: 'week', month: 2, week: 4 } },
    summerSales: { from: { on: 'weekday', month: 7, nth: 1, weekday: 1 }, to: { on: 'week', month: 8, week: 4 } },
  }
  expect(saleWindow('summerSales', 2027, dates)).toEqual({ from: '2027-07-05', to: '2027-08-31' })
})
