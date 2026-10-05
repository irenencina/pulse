import { beforeEach, describe, expect, it } from 'vitest'
import {
  addCategory,
  addTag,
  addTransaction,
  copyYear,
  deleteCategory,
  deleteTag,
  ensureInitialised,
  fillBudgetCells,
  getSettings,
  importTransactions,
  importStatus,
  setPocketCategories,
  moveCategory,
  renameTag,
  removeImportedRows,
  retagTransactions,
  undoImport,
  setBudgetCell,
  updateSettings,
  updateTransaction,
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

describe('budget cells', () => {
  it('sets, fills and clears planner cells', async () => {
    const id = await addCategory('expenses', 'Gym', null, db)
    await setBudgetCell(id, '2026-01', { kind: 'fixed', cents: 8500 }, db)
    await fillBudgetCells(id, '2026-01', ['2026-02', '2026-03'], db)
    expect((await db.budgetCells.where('categoryId').equals(id).toArray()).map((c) => c.month).sort()).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ])
    await setBudgetCell(id, '2026-02', null, db)
    expect(await db.budgetCells.get(`${id}|2026-02`)).toBeUndefined()
  })

  it('copies a year forward without overwriting rows already planned', async () => {
    const a = await addCategory('expenses', 'A', null, db)
    const b = await addCategory('expenses', 'B', null, db)
    await setBudgetCell(a, '2026-05', { kind: 'percent', basisPoints: 1500 }, db)
    await setBudgetCell(b, '2026-05', { kind: 'fixed', cents: 100 }, db)
    await setBudgetCell(b, '2027-01', { kind: 'fixed', cents: 999 }, db)
    expect(await copyYear(2026, db)).toBe(1)
    expect(await db.budgetCells.get(`${a}|2027-05`)).toMatchObject({ kind: 'percent', basisPoints: 1500 })
    expect(await db.budgetCells.get(`${b}|2027-05`)).toBeUndefined()
  })

  it('refuses to delete a category that has budget amounts', async () => {
    const id = await addCategory('expenses', 'Gym', null, db)
    await setBudgetCell(id, '2026-01', { kind: 'fixed', cents: 8500 }, db)
    await expect(deleteCategory(id, db)).rejects.toThrow(/Archive it instead/)
  })
})

describe('transactions', () => {
  const rent = async () => (await db.categories.where('block').equals('expenses').toArray()).find((c) => c.name === 'Rent')!

  it('adds a transaction with new tags', async () => {
    const category = await rent()
    const id = await addTransaction(
      { date: '2026-09-01', block: 'expenses', categoryId: category.id, cents: 48650, details: ' September ', tags: '#home #home' },
      db,
    )
    const saved = (await db.transactions.get(id))!
    expect(saved).toMatchObject({ details: 'September', source: 'manual', cents: 48650 })
    expect(saved.tagIds).toHaveLength(1)
    expect((await db.tags.get(saved.tagIds[0]!))?.name).toBe('home')
  })

  it('refuses amounts of zero and categories from another block', async () => {
    const category = await rent()
    const base = { date: '2026-09-01', block: 'expenses' as const, categoryId: category.id, details: '' }
    await expect(addTransaction({ ...base, cents: 0 }, db)).rejects.toThrow(/above zero/)
    await expect(addTransaction({ ...base, block: 'income', cents: 1 }, db)).rejects.toThrow(/another block/)
  })

  it('imports bank rows once, however often the file is imported', async () => {
    const rows = [
      { date: '2026-09-04', block: 'expenses' as const, categoryId: null, cents: 4999, details: 'Decathlon', importKey: 'a' },
      { date: '2026-09-05', block: 'expenses' as const, categoryId: null, cents: 1000, details: 'Bakery', importKey: 'b' },
    ]
    expect(await importTransactions(rows, 'revolut', db)).toBe(2)
    expect(await importTransactions(rows, 'revolut', db)).toBe(0)
    expect(await db.transactions.count()).toBe(2)
    expect([...(await importStatus(['a', 'z'], db)).imported]).toEqual(['a'])
  })

  it('remembers rows left out on purpose, and their merchant', async () => {
    const row = { date: '2026-09-04', block: 'income' as const, categoryId: null, cents: 10000, details: 'Payment from Me', importKey: 'm1' }
    await importTransactions([], 'revolut', db, [row])
    const status = await importStatus(['m1', 'm2'], db)
    expect([...status.skipped]).toEqual(['m1'])
    expect(status.skippedMerchants.has('payment from me')).toBe(true)
    // Importing it later after all clears the skip.
    await importTransactions([row], 'revolut', db)
    expect((await importStatus(['m1'], db)).skipped.size).toBe(0)
  })

  it('keeps the pocket of imported rows and the categories linked to a pocket', async () => {
    const category = await rent()
    await importTransactions(
      [{ date: '2026-09-14', block: 'expenses', categoryId: category.id, cents: 3499, details: 'Basic Fit', importKey: 'g', pocket: 'Bills' }],
      'revolut',
      db,
    )
    expect((await db.transactions.where('importKey').equals('g').first())?.pocket).toBe('Bills')
    await setPocketCategories('Bills', [category.id, category.id], db)
    expect(await db.pockets.get('Bills')).toEqual({ name: 'Bills', categoryIds: [category.id] })
  })

  it('keeps categories with transactions from being deleted, and removes deleted tags from transactions', async () => {
    const category = await rent()
    const id = await addTransaction(
      { date: '2026-09-01', block: 'expenses', categoryId: category.id, cents: 100, details: '', tags: '#home' },
      db,
    )
    await expect(deleteCategory(category.id, db)).rejects.toThrow(/tracked transactions/)
    const tagId = (await db.transactions.get(id))!.tagIds[0]!
    await deleteTag(tagId, db)
    expect((await db.transactions.get(id))!.tagIds).toEqual([])
    await updateTransaction(id, { cents: 250, tags: '#flat' }, db)
    expect((await db.transactions.get(id))!.cents).toBe(250)
  })

  it('lets an imported row replace the same payment typed in by hand, keeping its tags', async () => {
    const category = await rent()
    const manual = await addTransaction(
      { date: '2026-09-01', block: 'expenses', categoryId: category.id, cents: 80000, details: 'rent', tags: '#flat' },
      db,
    )
    await importTransactions(
      [{ date: '2026-09-02', block: 'expenses', categoryId: category.id, cents: 80000, details: 'Landlord', importKey: 'r', replaces: manual }],
      'revolut',
      db,
    )
    const all = await db.transactions.toArray()
    expect(all).toHaveLength(1)
    expect(all[0]!.importKey).toBe('r')
    expect(all[0]!.tagIds).toHaveLength(1)
  })

  it('undoes an import and puts back what it replaced', async () => {
    const category = await rent()
    const manual = await addTransaction({ date: '2026-09-01', block: 'expenses', categoryId: category.id, cents: 500, details: 'x' }, db)
    await importTransactions(
      [
        { date: '2026-09-01', block: 'expenses', categoryId: null, cents: 500, details: 'Shop', importKey: 'k1', replaces: manual },
        { date: '2026-09-02', block: 'expenses', categoryId: null, cents: 700, details: 'Shop', importKey: 'k2' },
      ],
      'revolut',
      db,
      [],
      'sept.xlsx',
    )
    const [record] = await db.imports.toArray()
    expect(record).toMatchObject({ fileName: 'sept.xlsx', count: 2 })
    expect(await undoImport(record!.id, db)).toBe(2)
    expect((await db.transactions.toArray()).map((t) => t.id)).toEqual([manual])
    expect(await db.imports.count()).toBe(0)
  })

  it('removes single imported rows, and the import record with the last one', async () => {
    await importTransactions(
      [
        { date: '2026-09-01', block: 'expenses', categoryId: null, cents: 500, details: 'Shop', importKey: 'k1' },
        { date: '2026-09-02', block: 'expenses', categoryId: null, cents: 700, details: 'Shop', importKey: 'k2' },
      ],
      'revolut',
      db,
    )
    const [record] = await db.imports.toArray()
    const [first, second] = await db.transactions.toArray()
    await removeImportedRows(record!.id, [first!.id], db)
    expect((await db.transactions.toArray()).map((t) => t.id)).toEqual([second!.id])
    expect(await db.imports.count()).toBe(1)
    await removeImportedRows(record!.id, [second!.id], db)
    expect(await db.transactions.count()).toBe(0)
    expect(await db.imports.count()).toBe(0)
  })

  it('marks a transaction as changed when it is edited or retagged', async () => {
    const category = await rent()
    const a = await addTransaction({ date: '2026-09-01', block: 'expenses', categoryId: category.id, cents: 1, details: '' }, db)
    const b = await addTransaction({ date: '2026-09-01', block: 'expenses', categoryId: category.id, cents: 2, details: '' }, db)
    expect((await db.transactions.get(a))!.editedAt).toBeUndefined()
    await updateTransaction(a, { details: 'Gym' }, db)
    await retagTransactions([b], ['trip'], [], db)
    expect((await db.transactions.get(a))!.editedAt).toBeTypeOf('number')
    expect((await db.transactions.get(b))!.editedAt).toBeTypeOf('number')
  })

  it('adds and removes tags on several transactions at once', async () => {
    const category = await rent()
    const a = await addTransaction({ date: '2026-09-01', block: 'expenses', categoryId: category.id, cents: 1, details: '', tags: '#old' }, db)
    const b = await addTransaction({ date: '2026-09-01', block: 'expenses', categoryId: category.id, cents: 2, details: '' }, db)
    await retagTransactions([a, b], ['trip'], ['old'], db)
    const names = async (id: string) =>
      Promise.all((await db.transactions.get(id))!.tagIds.map(async (t) => (await db.tags.get(t))!.name))
    expect(await names(a)).toEqual(['trip'])
    expect(await names(b)).toEqual(['trip'])
  })
})
