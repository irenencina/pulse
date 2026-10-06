import { beforeEach, describe, expect, it } from 'vitest'
import { addCategory, ensureInitialised } from './actions'
import { PulseDB } from './db'
import { addWish, ensureWishCategories, markBought, moveWish, unmarkBought } from './wishlist'

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
