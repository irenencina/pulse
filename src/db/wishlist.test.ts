import { beforeEach, describe, expect, it } from 'vitest'
import { addCategory, ensureInitialised } from './actions'
import { PulseDB } from './db'
import { addWish, ensureWishCategories, markBought, moveWish, replaceLater, setOwnedStatus, setTimelineDate, unmarkBought } from './wishlist'
import { averageLifetime, copiesOf, spentOnAllCopies } from '../domain/wishlist'

let db: PulseDB
let n = 0
beforeEach(async () => {
  db = new PulseDB(`wish-${n++}`)
  await ensureInitialised(db)
})

const base = { kind: 'item' as const, priceCents: 30000, categoryIds: [], tagIds: [], desired: false }

describe('wishlist', () => {
  it('starts with the starter categories once', async () => {
    await ensureWishCategories(db)
    await ensureWishCategories(db)
    expect((await db.wishCategories.toArray()).map((c) => c.name)).toContain('Tech')
    expect(await db.wishCategories.count()).toBe(10)
  })

  it('adds new wishes on top and moves them by dragging', async () => {
    const a = await addWish({ ...base, name: 'A' }, db)
    const b = await addWish({ ...base, name: 'B' }, db)
    const order = async () => (await db.wishItems.orderBy('order').toArray()).map((w) => w.name)
    expect(await order()).toEqual(['B', 'A'])
    await moveWish(b, null, db)
    expect(await order()).toEqual(['A', 'B'])
    await moveWish(b, a, db)
    expect(await order()).toEqual(['B', 'A'])
  })

  it('records your part in Tracking when bought, and takes it back when undone', async () => {
    const sport = await addCategory('expenses', 'Sport gear', null, db)
    const id = await addWish({ ...base, name: 'Longboard' }, db)
    await markBought(id, { date: '2026-10-06', paidCents: 20000, giftShare: 25, recordIn: sport }, db)
    const w = (await db.wishItems.get(id))!
    expect(w).toMatchObject({ owned: true, paidCents: 20000, giftShare: 25, status: 'inUse', priceCents: 30000 })
    expect(await db.transactions.get(w.transactionId!)).toMatchObject({ cents: 15000, categoryId: sport, details: 'Longboard' })
    await unmarkBought(id, db)
    expect(await db.transactions.count()).toBe(0)
    expect((await db.wishItems.get(id))!.owned).toBe(false)
  })
})

describe('copies of one model', () => {
  const bought = (date: string, paidCents: number) => ({ date, paidCents, giftShare: 0, recordIn: null })

  it('keeps each copy when it breaks and is bought again', async () => {
    const id = await addWish({ ...base, name: 'Earbuds' }, db)
    await markBought(id, bought('2025-01-01', 10000), db)
    await expect(markBought(id, bought('2025-06-01', 9000), db)).rejects.toThrow('still have')
    await setOwnedStatus(id, 'broken', '2025-12-01', db)
    await markBought(id, bought('2026-01-10', 12000), db)
    const w = (await db.wishItems.get(id))!
    expect(w).toMatchObject({ owned: true, status: 'inUse', purchasedOn: '2026-01-10', paidCents: 12000 })
    expect(w.endedOn).toBeUndefined()
    expect(w.history).toEqual([{ purchasedOn: '2025-01-01', paidCents: 10000, endedOn: '2025-12-01', end: 'broken' }])
    expect(copiesOf(w)).toHaveLength(2)
    expect(spentOnAllCopies(w)).toBe(22000)
    expect(averageLifetime(w)).toBe('11 months')
  })

  it('goes back on the wishlist to be replaced, and buying it starts the next copy', async () => {
    const id = await addWish({ ...base, name: 'Bike' }, db)
    await markBought(id, bought('2024-03-01', 50000), db)
    await setOwnedStatus(id, 'lost', '2026-03-01', db)
    await replaceLater(id, db)
    let w = (await db.wishItems.get(id))!
    expect(w.owned).toBe(false)
    expect(w.history?.[0]).toMatchObject({ end: 'lost', endedOn: '2026-03-01' })
    await markBought(id, bought('2026-04-01', 40000), db)
    w = (await db.wishItems.get(id))!
    expect(copiesOf(w).map((c) => c.purchasedOn)).toEqual(['2024-03-01', '2026-04-01'])
  })

  it('needs an end date on or after the day it was bought', async () => {
    const id = await addWish({ ...base, name: 'Lamp' }, db)
    await markBought(id, bought('2026-05-01', 1000), db)
    await expect(setOwnedStatus(id, 'sold', '2026-04-01', db)).rejects.toThrow('before you bought')
    await setOwnedStatus(id, 'sold', '2026-06-01', db)
    await setOwnedStatus(id, 'inUse', undefined, db)
    expect((await db.wishItems.get(id))!.endedOn).toBeUndefined()
  })

  it('edits dates in the timeline, for past copies and the current one', async () => {
    const id = await addWish({ ...base, name: 'Kettle' }, db)
    await markBought(id, bought('2024-01-01', 3000), db)
    await setOwnedStatus(id, 'broken', '2025-01-01', db)
    await markBought(id, bought('2025-02-01', 3500), db)
    await setTimelineDate(id, { field: 'addedOn' }, '2023-12-01', db)
    await setTimelineDate(id, { copy: 0, field: 'endedOn' }, '2024-11-15', db)
    await setTimelineDate(id, { copy: 1, field: 'purchasedOn' }, '2025-02-03', db)
    const w = (await db.wishItems.get(id))!
    expect(w.addedOn).toBe('2023-12-01')
    expect(w.history?.[0]?.endedOn).toBe('2024-11-15')
    expect(w.purchasedOn).toBe('2025-02-03')
    await expect(setTimelineDate(id, { copy: 0, field: 'endedOn' }, '2023-06-01', db)).rejects.toThrow('can’t end before')
  })

  it('gives each copy its own warranty', async () => {
    const id = await addWish({ ...base, name: 'Phone' }, db)
    await expect(markBought(id, { ...bought('2026-01-10', 50000), warrantyUntil: '2025-01-01' }, db)).rejects.toThrow('warranty')
    await markBought(id, { ...bought('2026-01-10', 50000), warrantyUntil: '2028-01-10' }, db)
    await setOwnedStatus(id, 'broken', '2027-05-01', db)
    await markBought(id, bought('2027-06-01', 40000), db)
    const w = (await db.wishItems.get(id))!
    expect(w.history?.[0]).toMatchObject({ warrantyUntil: '2028-01-10', end: 'broken' })
    expect(w.warrantyUntil).toBeUndefined()
    await setTimelineDate(id, { copy: 1, field: 'warrantyUntil' }, '2029-06-01', db)
    expect((await db.wishItems.get(id))!.warrantyUntil).toBe('2029-06-01')
    await setTimelineDate(id, { copy: 1, field: 'warrantyUntil' }, '', db)
    expect((await db.wishItems.get(id))!.warrantyUntil).toBeUndefined()
  })
})
