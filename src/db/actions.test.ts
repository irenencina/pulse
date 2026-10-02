import { beforeEach, describe, expect, it } from 'vitest'
import {
  addCategory,
  addTag,
  deleteCategory,
  ensureInitialised,
  getSettings,
  moveCategory,
  renameTag,
  updateSettings,
} from './actions'
import { PulseDB } from './db'

let db: PulseDB
let n = 0

beforeEach(async () => {
  db = new PulseDB(`test-${n++}`)
  await ensureInitialised(db)
})

describe('first run', () => {
  it('stores default settings and the starter categories once', async () => {
    await ensureInitialised(db)
    expect((await getSettings(db)).currency).toBe('EUR')
    const expenses = await db.categories.where('block').equals('expenses').toArray()
    expect(expenses.map((c) => c.name)).toContain('Sports & Gym')
    expect(await db.categories.count()).toBe(20)
  })
})

describe('categories', () => {
  it('adds nested subcategories', async () => {
    const sports = (await db.categories.where('block').equals('expenses').toArray()).find((c) => c.name === 'Sports & Gym')!
    const football = await addCategory('expenses', '  Football  ', sports.id, db)
    const boots = await addCategory('expenses', 'Boots', football, db)
    expect((await db.categories.get(football))?.name).toBe('Football')
    expect((await db.categories.get(boots))?.parentId).toBe(football)
  })

  it('rejects a parent from another block', async () => {
    const job = (await db.categories.where('block').equals('income').first())!
    await expect(addCategory('expenses', 'X', job.id, db)).rejects.toThrow(/not found/)
  })

  it('blocks moving a category inside its own subcategory', async () => {
    const a = await addCategory('expenses', 'A', null, db)
    const b = await addCategory('expenses', 'B', a, db)
    await expect(moveCategory(a, b, db)).rejects.toThrow(/inside itself/)
  })

  it('only deletes categories without subcategories', async () => {
    const a = await addCategory('expenses', 'A', null, db)
    const b = await addCategory('expenses', 'B', a, db)
    await expect(deleteCategory(a, db)).rejects.toThrow(/subcategories/)
    await deleteCategory(b, db)
    await deleteCategory(a, db)
    expect(await db.categories.get(a)).toBeUndefined()
  })
})

describe('tags', () => {
  it('normalises names and does not duplicate', async () => {
    const id = await addTag('#Football', db)
    expect(await addTag('football', db)).toBe(id)
    expect((await db.tags.get(id))?.name).toBe('football')
  })

  it('refuses a rename that clashes with another tag', async () => {
    await addTag('football', db)
    const gym = await addTag('gym', db)
    await expect(renameTag(gym, '#Football', db)).rejects.toThrow(/already exists/)
  })
})

it('saves settings changes', async () => {
  await updateSettings({ lateIncomeDay: 25, carryOverDefault: 'toMainPot' }, db)
  const s = await getSettings(db)
  expect(s.lateIncomeDay).toBe(25)
  expect(s.carryOverDefault).toBe('toMainPot')
  expect(s.allowDissaving).toBe(true)
})
