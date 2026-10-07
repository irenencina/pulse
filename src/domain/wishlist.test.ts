import { describe, expect, it } from 'vitest'
import {
  brandSummary,
  imageFromDrop,
  matchesFilter,
  ownedFor,
  ownShare,
  facetItems,
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
  it('filters by category, brand, price and the star', () => {
    const w = wish({ brand: 'YOW', desired: true })
    expect(matchesFilter(w, { categoryIds: ['sport'], brands: ['yow'], price: { min: 10001 }, desiredOnly: true })).toBe(true)
    expect(matchesFilter(w, { categoryIds: ['tech'] })).toBe(false)
    expect(matchesFilter(w, { categoryIds: ['tech', 'sport'], brands: [] })).toBe(true)
    expect(matchesFilter(w, { price: { max: 5000 } })).toBe(false)
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

it('offers only the choices left by the other filters', () => {
  const items = [wish({ id: 'a', brand: 'Apple', categoryIds: ['tech'] }), wish({ id: 'b', brand: 'Adidas', categoryIds: ['sport'] })]
  const f = { categoryIds: ['tech'], brands: ['Adidas'] }
  expect(facetItems(items, f, 'brands').map((w) => w.brand)).toEqual(['Apple'])
  expect(facetItems(items, f, 'categoryIds').map((w) => w.brand)).toEqual(['Adidas'])
})
