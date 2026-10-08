import { useEffect, useState } from 'react'
import { EditIcon } from '../../components/icons'
import { buildTree, flattenTree } from '../../domain/categories'
import type { Pocket } from '../../domain/transactions'
import { BLOCK_LABELS, type Category } from '../../domain/types'

interface Props {
  names: string[]
  pockets: Pocket[]
  categories: Category[]
  onToggle: (name: string, categoryId: string, linked: boolean) => void
  /** One row per pocket with every linked category shown, instead of compact boxes. */
  full?: boolean
}

/**
 * Links each Revolut pocket to the categories its money is for. A payment from a pocket
 * linked to one category gets that category; with several, they are offered first.
 */
export default function PocketLinks({ names, pockets, categories, onToggle, full }: Props) {
  // Ticks show at once; the saved list catches up a moment later.
  const [local, setLocal] = useState<Record<string, string[]>>({})
  const [open, setOpen] = useState<string | null>(null)

  // A click or tap anywhere outside the open list closes it, and so does Escape.
  useEffect(() => {
    if (open === null) return
    const close = (e: Event) => {
      const inside = (e.target as HTMLElement).closest?.('.pocket-link')
      if (!inside || inside.getAttribute('data-pocket') !== open) setOpen(null)
    }
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  const options = (['expenses', 'savings'] as const).flatMap((block) =>
    flattenTree(buildTree(categories, block)).map(({ category, depth }) => ({ category, depth, block })),
  )
  return (
    <div className={full ? 'pocket-links full' : 'pocket-links'}>
      {names.map((name) => {
        const linked = local[name] ?? pockets.find((p) => p.name === name)?.categoryIds ?? []
        // In the same order as the list below.
        const linkedOptions = options.filter((o) => linked.includes(o.category.id))
        const linkedNames = linkedOptions.map((o) => o.category.name)
        return (
          <details
            key={name}
            className="pocket-link"
            data-pocket={name}
            open={open === name}
          >
            <summary
              onClick={(e) => {
                // React controls which list is open, so only one is open at a time.
                e.preventDefault()
                setOpen(open === name ? null : name)
              }}
            >
              <strong>{name}</strong>
              {full ? (
                <>
                  <span className="pocket-chips">
                    {linkedNames.length ? (
                      linkedOptions.map((o) => (
                        <span key={o.category.id} className={`category-chip ${o.block}`}>
                          {o.category.name}
                        </span>
                      ))
                    ) : (
                      <span className="needs-category">No categories yet</span>
                    )}
                  </span>
                  <span className="pocket-edit" title={`Change the categories of ${name}`} aria-label={`Change the categories of ${name}`}>
                    <EditIcon />
                  </span>
                </>
              ) : (
                <span className={linkedNames.length ? 'muted pocket-summary' : 'needs-category pocket-summary'} title={linkedNames.join(', ')}>
                  {linkedNames.length ? linkedNames.join(', ') : 'Link categories'}
                </span>
              )}
            </summary>
            <div className="pocket-options">
              {options.map(({ category, depth, block }, i) => (
                <div key={category.id}>
                  {(i === 0 || options[i - 1]!.block !== block) && <div className="pocket-block">{BLOCK_LABELS[block]}</div>}
                  <label className="check" style={{ paddingLeft: `${depth}rem` }}>
                    <input
                      type="checkbox"
                      checked={linked.includes(category.id)}
                      onChange={(e) => {
                        const on = e.target.checked
                        setLocal((l) => ({
                          ...l,
                          [name]: on ? [...linked, category.id] : linked.filter((id) => id !== category.id),
                        }))
                        onToggle(name, category.id, on)
                      }}
                    />
                    {category.name}
                  </label>
                </div>
              ))}
            </div>
          </details>
        )
      })}
    </div>
  )
}
