import type { Block, Tag } from './types'

/** "#Football Club " -> "football-club". Returns '' when nothing usable is left. */
export function normaliseTagName(input: string): string {
  return input
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

export function formatTag(name: string): string {
  return `#${name}`
}

/** The tags whose days include this date. Only expenses get them, like a trip's spending. */
export function datedTagIds(tags: Array<Pick<Tag, 'id' | 'from' | 'to'>>, date: string, block: Block): string[] {
  if (block !== 'expenses') return []
  return tags.filter((t) => t.from && t.to && t.from <= date && date <= t.to).map((t) => t.id)
}
