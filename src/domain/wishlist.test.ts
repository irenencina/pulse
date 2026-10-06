import { describe, expect, it } from 'vitest'
import {
  brandSummary,
  imageFromDrop,
  matchesFilter,
  notionDate,
  notionNames,
  notionPrice,
  ownedFor,
  ownShare,
  parseCsv,
  pickNotionTable,
  priceRangeOf,
  readNotionWishlist,
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
  it('sorts prices into the Notion ranges', () => {
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

describe('Notion import', () => {
  it('reads quoted CSV cells', () => {
    expect(parseCsv('﻿a,b\n"x, y","say ""hi"""\r\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']])
  })

  it('reads Notion links, dates and prices', () => {
    expect(notionNames('Lifestyle (Categories%205a4a/Lifestyle%20b13b.md), Tech (Categories%205a4a/Tech%20ab.md)')).toEqual(['Lifestyle', 'Tech'])
    expect(notionDate('May 13, 2024 12:28 PM')).toBe('2024-05-13')
    expect(notionDate('November 10, 2023')).toBe('2023-11-10')
    expect(notionPrice('€1,234.50')).toBe(123450)
    expect(notionPrice('')).toBeNull()
  })

  const csv = [
    'Name,Brand,Category,Date added,Date purchased,Gifting to,Most desired,Owned,Owned for,Present,Price,Tags,URL',
    'City bike,Acme (Brands/Acme%20x.md),Lifestyle (Categories/Lifestyle%20y.md),"May 7, 2026 9:51 AM","March 7, 2026",,No,Yes,6 months,50%,€50.00,,',
    'Kindle,,"Tech (C/Tech%20a.md), Books (C/Books%20b.md)","May 13, 2024 12:28 PM",,,Yes,No,,,€99.99,Football (T/Football%20z.md),https://x.example',
  ].join('\n')

  it('turns the table into items, keeping the gift share but no giver', () => {
    const [bike, kindle] = readNotionWishlist(csv)
    expect(bike).toMatchObject({ name: 'City bike', brand: 'Acme', owned: true, purchasedOn: '2026-03-07', giftShare: 50, priceCents: 5000 })
    expect(kindle).toMatchObject({ categories: ['Tech', 'Books'], tags: ['Football'], desired: true, owned: false, url: 'https://x.example' })
  })

  it('picks the full table among the view files', () => {
    const picked = pickNotionTable({ 'a/view.csv': csv.split('\n').slice(0, 2).join('\n'), 'a/Wishlist_all.csv': csv, 'a/Tags.csv': 'Formula,Name\n1 item,Football' })
    expect(picked.name).toBe('a/Wishlist_all.csv')
    expect(picked.items).toHaveLength(2)
    expect(() => pickNotionTable({ 'x.csv': 'Formula,Name\n1,Football' })).toThrow()
  })
})
