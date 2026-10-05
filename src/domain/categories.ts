import type { Block, Category, CarryOverMode, Settings } from './types'

export interface CategoryNode {
  category: Category
  depth: number
  children: CategoryNode[]
}

const bySiblingOrder = (a: Category, b: Category) => a.order - b.order || a.name.localeCompare(b.name)

/** Builds the category tree of one block. Orphans (missing parent) are shown at the top level. */
export function buildTree(categories: Category[], block: Block, includeArchived = false): CategoryNode[] {
  const inBlock = categories.filter((c) => c.block === block && (includeArchived || !c.archived))
  const ids = new Set(inBlock.map((c) => c.id))
  const childrenOf = new Map<string | null, Category[]>()
  for (const c of inBlock) {
    const key = c.parentId !== null && ids.has(c.parentId) ? c.parentId : null
    const list = childrenOf.get(key) ?? []
    list.push(c)
    childrenOf.set(key, list)
  }
  const build = (parentId: string | null, depth: number): CategoryNode[] =>
    (childrenOf.get(parentId) ?? [])
      .sort(bySiblingOrder)
      .map((category) => ({ category, depth, children: build(category.id, depth + 1) }))
  return build(null, 0)
}

/** Depth-first list of a tree, handy for rendering and for <select> options. */
export function flattenTree(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)])
}

/** Ids of a category and everything below it. */
export function descendantIds(categories: Category[], id: string): Set<string> {
  const result = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const c of categories) {
      if (c.parentId !== null && result.has(c.parentId) && !result.has(c.id)) {
        result.add(c.id)
        grew = true
      }
    }
  }
  return result
}

/** "Sports & Gym / Football" style path, for labels where the tree isn't visible. */
export function categoryPath(categories: Category[], id: string): string {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const parts: string[] = []
  const seen = new Set<string>()
  let current = byId.get(id)
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    parts.unshift(current.name)
    current = current.parentId === null ? undefined : byId.get(current.parentId)
  }
  return parts.join(' / ')
}

/**
 * Why a category can't be moved under `newParentId`, or null if it can.
 * Categories stay inside their block and can't be moved under themselves.
 */
export function moveError(categories: Category[], id: string, newParentId: string | null): string | null {
  const moving = categories.find((c) => c.id === id)
  if (!moving) return 'Category not found.'
  if (newParentId === null) return null
  const parent = categories.find((c) => c.id === newParentId)
  if (!parent) return 'Parent category not found.'
  if (parent.block !== moving.block) return 'Categories can only move within their own block.'
  if (descendantIds(categories, id).has(newParentId)) return 'A category cannot be moved inside itself.'
  return null
}

export function siblings(categories: Category[], block: Block, parentId: string | null): Category[] {
  return categories.filter((c) => c.block === block && c.parentId === parentId).sort(bySiblingOrder)
}

export function nextOrder(categories: Category[], block: Block, parentId: string | null): number {
  const list = siblings(categories, block, parentId)
  return list.length === 0 ? 0 : Math.max(...list.map((c) => c.order)) + 1
}

/**
 * New sibling orders after moving `id` one step up (-1) or down (+1).
 * Returns only the categories whose order changes.
 */
export function reorder(categories: Category[], id: string, direction: -1 | 1): Array<Pick<Category, 'id' | 'order'>> {
  const moving = categories.find((c) => c.id === id)
  if (!moving) return []
  const list = siblings(categories, moving.block, moving.parentId)
  const index = list.findIndex((c) => c.id === id)
  const target = index + direction
  if (target < 0 || target >= list.length) return []
  const reordered = [...list]
  reordered.splice(index, 1)
  reordered.splice(target, 0, moving)
  return reordered.flatMap((c, order) => (c.order === order ? [] : [{ id: c.id, order }]))
}

/**
 * New sibling orders after dragging `id` to position `toIndex` among its siblings
 * (0 = first). Returns only the categories whose order changes.
 */
export function reorderTo(categories: Category[], id: string, toIndex: number): Array<Pick<Category, 'id' | 'order'>> {
  const moving = categories.find((c) => c.id === id)
  if (!moving) return []
  const list = siblings(categories, moving.block, moving.parentId).filter((c) => c.id !== id)
  list.splice(Math.max(0, Math.min(toIndex, list.length)), 0, moving)
  return list.flatMap((c, order) => (c.order === order ? [] : [{ id: c.id, order }]))
}

export function normaliseCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

/** The carry-over rule in force for an expense category: its own, or the default from Settings. */
export function effectiveCarryOver(category: Category, settings: Pick<Settings, 'carryOverDefault'>): CarryOverMode {
  return category.carryOver ?? settings.carryOverDefault
}
