import { describe, expect, it } from 'vitest'
import {
  brandSummary,
  imageFromDrop,
  matchesFilter,
  ownedFor,
  ownShare,
  priceRangeOf,
  type WishItem,
} from './wishlist'

const wish = (over: Partial<WishItem> = {}): WishItem => ({
  id: 'w',
  name: 'Longboard',
  kind: 'item',
  priceCents: 15000,
  categoryIds: ['sport'],
  tagIds: [],
  desired: false,
  order: 0,
  addedOn: '2026-01-01',
  owned: false,
  ...over,
})

describe('wishlist helpers', () => {
  it('sorts prices into ranges', () => {
    expect([4999, 5000, 10000, 10001, null].map(priceRangeOf)).toEqual(['under50', '50to100', '50to100', 'over100', null])
  })

  it('filters by category, brand, price and the star', () => {
    const w = wish({ brand: 'YOW', desired: true })
    expect(matchesFilter(w, { categoryId: 'sport', brand: 'yow', price: 'over100', desiredOnly: true })).toBe(true)
    expect(matchesFilter(w, { categoryId: 'tech' })).toBe(false)
    expect(matchesFilter(w, { text: 'long' })).toBe(true)
  })

  it('takes the gift share off what you paid', () => {
    expect(ownShare(10000, 50)).toBe(5000)
    expect(ownShare(10000)).toBe(10000)
    expect(ownShare(10000, 100)).toBe(0)
  })

  it('says how long something is owned', () => {
    expect(ownedFor('2026-03-07', '2026-10-06')).toBe('6 months')
    expect(ownedFor('2025-08-01', '2026-10-06')).toBe('1 year 2 months')
    expect(ownedFor('2026-09-20', '2026-10-06')).toBe('2 weeks')
    expect(ownedFor('2026-10-06', '2026-10-06')).toBe('today')
  })

  it('adds up brands, counting only what you paid yourself', () => {
    const rows = brandSummary([
      wish({ brand: 'Decathlon', owned: true, paidCents: 2000 }),
      wish({ brand: 'decathlon', owned: true, paidCents: 1000, giftShare: 50 }),
      wish({ brand: 'Decathlon' }),
    ])
    expect(rows).toEqual([{ brand: 'Decathlon', count: 3, spentCents: 2500 }])
  })

  it('finds the picture in something dropped from a web page', () => {
    expect(imageFromDrop('', '<img alt="" src="https://shop.example/a.jpg?w=1&amp;h=2">', '')).toBe('https://shop.example/a.jpg?w=1&h=2')
    expect(imageFromDrop('# comment\nhttps://x.example/b.png', '', '')).toBe('https://x.example/b.png')
    expect(imageFromDrop('', '', 'not a link')).toBeNull()
  })
})
