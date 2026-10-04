import { buildTree, flattenTree } from '../../domain/categories'
import { ANY, isFiltering, MAIN_ACCOUNT, NO_CATEGORY, NO_FILTER, type LedgerFilter } from '../../domain/ledgerFilter'
import { formatTag } from '../../domain/tags'
import { BLOCKS, BLOCK_LABELS, type Category, type Tag } from '../../domain/types'

interface Props {
  filter: LedgerFilter
  onChange: (filter: LedgerFilter) => void
  categories: Category[]
  tags: Tag[]
  pockets: string[]
}

/** Search box and filters above the transaction list. */
export default function LedgerFilters({ filter, onChange, categories, tags, pockets }: Props) {
  const set = (patch: Partial<LedgerFilter>) => onChange({ ...filter, ...patch })
  return (
    <div className="ledger-filters">
      <input
        type="search"
        aria-label="Search transactions"
        placeholder="Search details, category, #tag or amount"
        value={filter.text}
        onChange={(e) => set({ text: e.target.value })}
        onKeyDown={(e) => e.key === 'Escape' && set({ text: '' })}
      />
      <select aria-label="Filter by category" value={filter.category} onChange={(e) => set({ category: e.target.value })}>
        <option value={ANY}>All categories</option>
        <option value={NO_CATEGORY}>Needs a category</option>
        {BLOCKS.map((block) => (
          <optgroup key={block} label={BLOCK_LABELS[block]}>
            {flattenTree(buildTree(categories, block, true)).map(({ category, depth }) => (
              <option key={category.id} value={category.id}>
                {'   '.repeat(depth)}
                {category.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {pockets.length > 0 && (
        <select aria-label="Filter by pocket" value={filter.pocket} onChange={(e) => set({ pocket: e.target.value })}>
          <option value={ANY}>All pockets</option>
          <option value={MAIN_ACCOUNT}>Main account</option>
          {pockets.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      )}
      {tags.length > 0 && (
        <select aria-label="Filter by tag" value={filter.tag} onChange={(e) => set({ tag: e.target.value })}>
          <option value={ANY}>All tags</option>
          {[...tags]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((t) => (
              <option key={t.id} value={t.id}>
                {formatTag(t.name)}
              </option>
            ))}
        </select>
      )}
      {isFiltering(filter) && (
        <button type="button" className="link" onClick={() => onChange(NO_FILTER)}>
          Clear filters
        </button>
      )}
    </div>
  )
}
