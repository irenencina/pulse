import { categoryPath, descendantIds } from './categories'
import type { Transaction } from './transactions'
import type { Category, Tag } from './types'

export const ANY = 'all'
/** The category filter value for transactions that still need a category. */
export const NO_CATEGORY = 'none'
/** The pocket filter value for payments from the main account. */
export const MAIN_ACCOUNT = 'main'

export interface LedgerFilter {
  text: string
  /** ANY, NO_CATEGORY, or a category id (its subcategories count too). */
  category: string
  /** ANY, MAIN_ACCOUNT, or a pocket name. */
  pocket: string
  /** ANY or a tag id. */
  tag: string
  /** '' or one day, "YYYY-MM-DD" (picked on the spending calendar). */
  day: string
}

export const NO_FILTER: LedgerFilter = { text: '', category: ANY, pocket: ANY, tag: ANY, day: '' }

export const isFiltering = (f: LedgerFilter) =>
  f.text.trim() !== '' || f.category !== ANY || f.pocket !== ANY || f.tag !== ANY || f.day !== ''

/**
 * A test for the transactions to keep. The text is matched, ignoring case, against the
 * details, category, pocket, tags and amount ("12.5", "12,50" and "12.50" all find 12.50).
 */
export function ledgerMatcher(filter: LedgerFilter, categories: Category[], tags: Tag[]): (t: Transaction) => boolean {
  const words = filter.text.toLowerCase().split(/\s+/).filter(Boolean)
  const inCategory = filter.category === ANY || filter.category === NO_CATEGORY ? null : descendantIds(categories, filter.category)
  const tagName = new Map(tags.map((t) => [t.id, t.name]))
  const paths = new Map<string, string>()
  const pathOf = (id: string) => {
    if (!paths.has(id)) paths.set(id, categoryPath(categories, id).toLowerCase())
    return paths.get(id)!
  }
  return (t) => {
    if (filter.category === NO_CATEGORY && t.categoryId !== null) return false
    if (inCategory && (t.categoryId === null || !inCategory.has(t.categoryId))) return false
    if (filter.pocket === MAIN_ACCOUNT && t.pocket) return false
    if (filter.pocket !== ANY && filter.pocket !== MAIN_ACCOUNT && t.pocket !== filter.pocket) return false
    if (filter.tag !== ANY && !t.tagIds.includes(filter.tag)) return false
    if (filter.day && t.date !== filter.day) return false
    if (words.length === 0) return true
    const amount = (t.cents / 100).toFixed(2)
    const haystack = [
      t.details,
      t.categoryId === null ? '' : pathOf(t.categoryId),
      t.pocket ?? '',
      ...t.tagIds.map((id) => `#${tagName.get(id) ?? ''}`),
      amount,
      amount.replace('.', ','),
    ]
      .join(' ')
      .toLowerCase()
    return words.every((w) => haystack.includes(/^\d+([.,]\d+)?$/.test(w) ? normaliseNumber(w) : w))
  }
}

/** "12,5" becomes "12.5" so it is found inside "12.50". */
function normaliseNumber(word: string): string {
  return word.replace(',', '.')
}
