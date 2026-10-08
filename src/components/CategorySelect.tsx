import { buildTree, flattenTree } from '../domain/categories'
import { BLOCKS, BLOCK_LABELS, type Block, type Category } from '../domain/types'

interface Props {
  categories: Category[]
  value: string | null
  onChange: (choice: { block: Block; categoryId: string } | null) => void
  /** Only offer categories of these blocks. */
  blocks?: readonly Block[]
  label: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  /** Extra class, e.g. to show a choice that is not used yet. */
  className?: string
  /** Categories listed first, e.g. the ones linked to the pocket a payment came from. */
  preferred?: { label: string; ids: string[] }
}

/** A category picker grouped by block, with subcategories indented under their parent. */
export default function CategorySelect({
  categories,
  value,
  onChange,
  blocks = BLOCKS,
  label,
  placeholder = 'Pick a category',
  required,
  disabled,
  className,
  preferred,
}: Props) {
  const firstChoices = preferred ? categories.filter((c) => preferred.ids.includes(c.id) && !c.archived) : []
  return (
    <select
      aria-label={label}
      required={required}
      disabled={disabled}
      className={`category-select${value === null ? ' empty' : ''}${className ? ` ${className}` : ''}`}
      value={value ?? ''}
      onChange={(e) => {
        const category = categories.find((c) => c.id === e.target.value)
        onChange(category ? { block: category.block, categoryId: category.id } : null)
      }}
    >
      <option value="">{placeholder}</option>
      {firstChoices.length > 0 && (
        <optgroup label={preferred!.label}>
          {firstChoices.map((c) => (
            <option key={`first-${c.id}`} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      )}
      {blocks.map((block) => (
        <optgroup key={block} label={BLOCK_LABELS[block]}>
          {flattenTree(buildTree(categories, block)).map(({ category, depth }) => (
            <option key={category.id} value={category.id}>
              {'   '.repeat(depth)}
              {category.name}
            </option>
          ))}
          {/* An archived category still shows when a transaction uses it. */}
          {categories
            .filter((c) => c.block === block && c.archived && c.id === value)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (archived)
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  )
}
