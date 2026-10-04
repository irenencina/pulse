import {
  moveError,
  nextOrder,
  normaliseCategoryName,
  reorder,
} from '../domain/categories'
import { cellId, type BudgetCell, type CellValue } from '../domain/budget'
import type { MonthKey } from '../domain/periods'
import { normaliseTagName } from '../domain/tags'
import { BLOCKS, DEFAULT_SETTINGS, type Block, type Category, type CarryOverMode, type Settings } from '../domain/types'
import { db as defaultDb, SETTINGS_KEY, type PulseDB } from './db'
import { STARTER_CATEGORIES } from './seed'

const newId = () => crypto.randomUUID()

/** First run: store default settings and the starter categories. Safe to call on every start. */
export async function ensureInitialised(db: PulseDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.settings, db.categories, async () => {
    if (await db.settings.get(SETTINGS_KEY)) return
    await db.settings.put({ ...DEFAULT_SETTINGS, key: SETTINGS_KEY })
    if ((await db.categories.count()) > 0) return
    const rows: Category[] = BLOCKS.flatMap((block) =>
      STARTER_CATEGORIES[block].map((name, order) => ({
        id: newId(),
        block,
        parentId: null,
        name,
        order,
        archived: false,
      })),
    )
    await db.categories.bulkAdd(rows)
  })
}

export async function getSettings(db: PulseDB = defaultDb): Promise<Settings> {
  const row = await db.settings.get(SETTINGS_KEY)
  if (!row) return DEFAULT_SETTINGS
  const { key: _key, ...settings } = row
  return { ...DEFAULT_SETTINGS, ...settings }
}

export async function updateSettings(patch: Partial<Settings>, db: PulseDB = defaultDb): Promise<void> {
  const current = await getSettings(db)
  await db.settings.put({ ...current, ...patch, key: SETTINGS_KEY })
}

export async function addCategory(
  block: Block,
  name: string,
  parentId: string | null = null,
  db: PulseDB = defaultDb,
): Promise<string> {
  const clean = normaliseCategoryName(name)
  if (!clean) throw new Error('Give the category a name.')
  return db.transaction('rw', db.categories, async () => {
    const all = await db.categories.toArray()
    if (parentId !== null) {
      const parent = all.find((c) => c.id === parentId)
      if (!parent || parent.block !== block) throw new Error('Parent category not found in this block.')
    }
    const id = newId()
    await db.categories.add({
      id,
      block,
      parentId,
      name: clean,
      order: nextOrder(all, block, parentId),
      archived: false,
    })
    return id
  })
}

export async function renameCategory(id: string, name: string, db: PulseDB = defaultDb): Promise<void> {
  const clean = normaliseCategoryName(name)
  if (!clean) throw new Error('Give the category a name.')
  await db.categories.update(id, { name: clean })
}

export async function moveCategory(id: string, newParentId: string | null, db: PulseDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    const all = await db.categories.toArray()
    const error = moveError(all, id, newParentId)
    if (error) throw new Error(error)
    const moving = all.find((c) => c.id === id)!
    if (moving.parentId === newParentId) return
    await db.categories.update(id, {
      parentId: newParentId,
      order: nextOrder(all, moving.block, newParentId),
    })
  })
}

export async function shiftCategory(id: string, direction: -1 | 1, db: PulseDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    const changes = reorder(await db.categories.toArray(), id, direction)
    await Promise.all(changes.map(({ id, order }) => db.categories.update(id, { order })))
  })
}

export async function setCategoryArchived(id: string, archived: boolean, db: PulseDB = defaultDb): Promise<void> {
  await db.categories.update(id, { archived })
}

export async function setCategoryCarryOver(
  id: string,
  carryOver: CarryOverMode | undefined,
  db: PulseDB = defaultDb,
): Promise<void> {
  await db.categories.update(id, { carryOver })
}

/**
 * Deletes a category that has no subcategories. Categories with subcategories have to be
 * emptied first, so nothing disappears by accident. (Once transactions exist, categories
 * that are in use will be archived instead of deleted.)
 */
export async function deleteCategory(id: string, db: PulseDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.categories, db.budgetCells, async () => {
    const children = await db.categories.where('parentId').equals(id).count()
    if (children > 0) throw new Error('Move or delete its subcategories first.')
    if ((await db.budgetCells.where('categoryId').equals(id).count()) > 0) {
      throw new Error('This category has budget amounts. Archive it instead, or clear its amounts first.')
    }
    await db.categories.delete(id)
  })
}

export async function addTag(name: string, db: PulseDB = defaultDb): Promise<string> {
  const clean = normaliseTagName(name)
  if (!clean) throw new Error('Give the tag a name.')
  const existing = await db.tags.where('name').equals(clean).first()
  if (existing) return existing.id
  const id = newId()
  await db.tags.add({ id, name: clean })
  return id
}

export async function renameTag(id: string, name: string, db: PulseDB = defaultDb): Promise<void> {
  const clean = normaliseTagName(name)
  if (!clean) throw new Error('Give the tag a name.')
  const clash = await db.tags.where('name').equals(clean).first()
  if (clash && clash.id !== id) throw new Error(`#${clean} already exists.`)
  await db.tags.update(id, { name: clean })
}

export async function deleteTag(id: string, db: PulseDB = defaultDb): Promise<void> {
  await db.tags.delete(id)
}

/** Sets one planner cell, or clears it when `value` is null. */
export async function setBudgetCell(
  categoryId: string,
  month: MonthKey,
  value: CellValue | null,
  db: PulseDB = defaultDb,
): Promise<void> {
  const id = cellId(categoryId, month)
  if (value === null) {
    await db.budgetCells.delete(id)
    return
  }
  await db.budgetCells.put({ id, categoryId, month, ...value } as BudgetCell)
}

/** Copies a cell's value into the given months (e.g. "the rest of the year"). */
export async function fillBudgetCells(
  categoryId: string,
  from: MonthKey,
  months: MonthKey[],
  db: PulseDB = defaultDb,
): Promise<void> {
  await db.transaction('rw', db.budgetCells, async () => {
    const source = await db.budgetCells.get(cellId(categoryId, from))
    for (const month of months) {
      if (month === from) continue
      if (!source) await db.budgetCells.delete(cellId(categoryId, month))
      else await db.budgetCells.put({ ...source, id: cellId(categoryId, month), month })
    }
  })
}

/** Copies every planned amount of one year into the next, for categories that have none there yet. */
export async function copyYear(fromYear: number, db: PulseDB = defaultDb): Promise<number> {
  return db.transaction('rw', db.budgetCells, async () => {
    const source = await db.budgetCells.where('month').startsWith(`${fromYear}-`).toArray()
    const targetPrefix = `${fromYear + 1}-`
    const existing = await db.budgetCells.where('month').startsWith(targetPrefix).toArray()
    const taken = new Set(existing.map((c) => c.categoryId))
    const copies = source
      .filter((c) => !taken.has(c.categoryId))
      .map((c) => {
        const month = targetPrefix + c.month.slice(5)
        return { ...c, id: cellId(c.categoryId, month), month }
      })
    await db.budgetCells.bulkPut(copies)
    return copies.length
  })
}

/** Writes several planner cells at once (fill, paste, clear); null clears a cell. */
export async function setBudgetCells(
  writes: Array<{ categoryId: string; month: MonthKey; value: CellValue | null }>,
  db: PulseDB = defaultDb,
): Promise<void> {
  await db.transaction('rw', db.budgetCells, async () => {
    const clears = writes.filter((w) => w.value === null).map((w) => cellId(w.categoryId, w.month))
    const puts = writes.flatMap((w) =>
      w.value === null ? [] : [{ id: cellId(w.categoryId, w.month), categoryId: w.categoryId, month: w.month, ...w.value } as BudgetCell],
    )
    await db.budgetCells.bulkDelete(clears)
    await db.budgetCells.bulkPut(puts)
  })
}
