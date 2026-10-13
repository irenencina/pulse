import { describe, expect, it } from 'vitest'
import type { Transaction } from './transactions'
import { DEFAULT_SETTINGS, type Category } from './types'
import { upcomingEvents, flagOf } from './upcoming'
import type { WishItem } from './wishlist'
import { affordability, nextSale, readyToBuy, saleWindow, wishTiming } from './wishTiming'

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
