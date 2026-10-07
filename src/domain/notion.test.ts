import { describe, expect, it } from 'vitest'
import { notionDate, notionNames, notionPrice, parseCsv, pickNotionTable, readNotionWishlist } from './notion'

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

  it('turns the table into items, keeping the gift share', () => {
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
