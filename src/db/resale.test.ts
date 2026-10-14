import { beforeEach, describe, expect, it } from 'vitest'
import { localToday } from '../domain/lab'
import { addCategory, ensureInitialised, getSettings } from './actions'
import { PulseDB } from './db'
import { addResale, addResaleSite, backToSelling, deleteResaleSite, markGiven, markSold, renameResaleSite, sellFromWish, updateResale } from './resale'
import { addWish, markBought } from './wishlist'

let db: PulseDB
let n = 0
beforeEach(async () => {
  db = new PulseDB(`resale-${n++}`)
  await ensureInitialised(db)
})

const base = { askingCents: 4000, sites: [], tagIds: [] }

describe('resale', () => {
  it('starts to post, notes the day it is posted, and a lower price starts the count again', async () => {
    const id = await addResale({ ...base, name: 'Boots' }, db)
    expect(await db.resaleItems.get(id)).toMatchObject({ status: 'toPost', addedOn: localToday() })
    expect((await db.resaleItems.get(id))!.postedOn).toBeUndefined()
    await updateResale(id, { status: 'posted', postedOn: '2026-09-01', sites: ['Vinted', 'Vinted '] }, db)
    expect(await db.resaleItems.get(id)).toMatchObject({ status: 'posted', postedOn: '2026-09-01', sites: ['Vinted'] })
    await updateResale(id, { askingCents: 3500 }, db)
    expect((await db.resaleItems.get(id))!.loweredOn).toBe(localToday())
    await expect(updateResale(id, { lowestCents: 5000 }, db)).rejects.toThrow('above what you ask')
    await expect(updateResale(id, { status: 'sold' }, db)).rejects.toThrow()
  })

  it('puts something you own up for sale once, and selling it adds income and marks it sold', async () => {
    const tech = await addCategory('expenses', 'Tech', null, db)
    const other = await addCategory('income', 'Other income', null, db)
    const wishId = await addWish({ name: 'Tablet', kind: 'item', priceCents: 30000, categoryIds: [], tagIds: [], desired: false, brand: 'Slate' }, db)
    await expect(sellFromWish(wishId, db)).rejects.toThrow('Only things you own')
    await markBought(wishId, { date: '2024-01-10', paidCents: 28000, giftShare: 50, recordIn: tech }, db)
    const id = await sellFromWish(wishId, db)
    expect(await sellFromWish(wishId, db)).toBe(id)
    expect(await db.resaleItems.get(id)).toMatchObject({ name: 'Tablet', brand: 'Slate', paidCents: 14000, wishId, status: 'toPost', askingCents: null })

    await markSold(id, { date: '2026-10-01', cents: 12000, recordIn: other }, db)
    const sold = (await db.resaleItems.get(id))!
    expect(sold).toMatchObject({ status: 'sold', soldOn: '2026-10-01', soldCents: 12000 })
    expect(await db.transactions.get(sold.transactionId!)).toMatchObject({ block: 'income', categoryId: other, cents: 12000, details: 'Sold: Tablet' })
    expect(await db.wishItems.get(wishId)).toMatchObject({ status: 'sold', endedOn: '2026-10-01' })
    expect((await getSettings(db)).resaleIncomeCategory).toBe(other)

    // Changed your mind: the income goes, and the tablet is yours again.
    await backToSelling(id, db)
    const back = (await db.resaleItems.get(id))!
    expect(back.status).toBe('toPost')
    expect(back.soldCents).toBeUndefined()
    expect(await db.transactions.get(sold.transactionId!)).toBeUndefined()
    expect((await db.wishItems.get(wishId))!.status).toBe('inUse')

    await markGiven(id, '2026-10-05', db)
    expect(await db.resaleItems.get(id)).toMatchObject({ status: 'given', soldOn: '2026-10-05' })
    expect(await db.wishItems.get(wishId)).toMatchObject({ status: 'given', endedOn: '2026-10-05' })
  })

  it('sold for nothing, or without Tracking, adds no income', async () => {
    const id = await addResale({ ...base, name: 'Lamp' }, db)
    await markSold(id, { date: '2026-10-01', cents: 0, recordIn: null }, db)
    expect(await db.transactions.count()).toBe(0)
    expect((await db.resaleItems.get(id))!.status).toBe('sold')
  })

  it('keeps a list of sites, renaming them everywhere', async () => {
    await addResaleSite('Milanuncios', db)
    await addResaleSite('milanuncios', db)
    expect((await getSettings(db)).resaleSites).toEqual(['Wallapop', 'Vinted', 'eBay', 'Facebook Marketplace', 'Milanuncios'])
    const id = await addResale({ ...base, name: 'Desk', sites: ['Vinted'] }, db)
    await renameResaleSite('Vinted', 'Vinted.es', db)
    expect((await db.resaleItems.get(id))!.sites).toEqual(['Vinted.es'])
    await deleteResaleSite('Vinted.es', db)
    expect((await getSettings(db)).resaleSites).not.toContain('Vinted.es')
    expect((await db.resaleItems.get(id))!.sites).toEqual(['Vinted.es'])
  })
})
