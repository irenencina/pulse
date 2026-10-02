import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import ConfirmButton from '../components/ConfirmButton'
import InlineEdit from '../components/InlineEdit'
import { useErrorMessage } from '../components/useErrorMessage'
import {
  addCategory,
  deleteCategory,
  getSettings,
  moveCategory,
  renameCategory,
  setCategoryArchived,
  setCategoryCarryOver,
  shiftCategory,
} from '../db/actions'
import { db } from '../db/db'
import { buildTree, descendantIds, flattenTree, siblings, type CategoryNode } from '../domain/categories'
import { BLOCKS, BLOCK_LABELS, type Block, type Category, type CarryOverMode, type Settings } from '../domain/types'

const CARRY_LABELS: Record<CarryOverMode, string> = {
  carry: 'Leftover stays here',
  toMainPot: 'Leftover to Main Pot',
}

export default function CategoriesPage() {
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const settings = useLiveQuery(() => getSettings(), [])
  const [showArchived, setShowArchived] = useState(false)

  if (!categories || !settings) return null

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>Categories</h1>
          <p className="muted">
            Income, Expenses and Savings are the main blocks. Inside each, add categories and as many levels of
            subcategories as you like.
          </p>
        </div>
        <label className="check">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show
          archived
        </label>
      </div>
      <div className="blocks">
        {BLOCKS.map((block) => (
          <BlockSection
            key={block}
            block={block}
            categories={categories}
            settings={settings}
            showArchived={showArchived}
          />
        ))}
      </div>
    </section>
  )
}

function BlockSection({
  block,
  categories,
  settings,
  showArchived,
}: {
  block: Block
  categories: Category[]
  settings: Settings
  showArchived: boolean
}) {
  const [name, setName] = useState('')
  const { error, run } = useErrorMessage()
  const tree = buildTree(categories, block, showArchived)

  return (
    <div className={`block block-${block}`}>
      <h2>{BLOCK_LABELS[block]}</h2>
      {block === 'savings' && (
        <p className="muted small">
          The Main Pot (what's left after expenses and savings) is calculated automatically, so it isn't listed here.
        </p>
      )}
      <ul className="tree">
        {tree.map((node) => (
          <CategoryRow key={node.category.id} node={node} categories={categories} settings={settings} run={run} />
        ))}
      </ul>
      <form
        className="add-row"
        onSubmit={async (e) => {
          e.preventDefault()
          if (await run(() => addCategory(block, name))) setName('')
        }}
      >
        <input
          placeholder={`New ${BLOCK_LABELS[block].toLowerCase()} category`}
          aria-label={`New ${BLOCK_LABELS[block]} category`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit">Add</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function CategoryRow({
  node,
  categories,
  settings,
  run,
}: {
  node: CategoryNode
  categories: Category[]
  settings: Settings
  run: (action: () => Promise<unknown>) => Promise<boolean>
}) {
  const { category } = node
  const [adding, setAdding] = useState(false)
  const [childName, setChildName] = useState('')
  const sibs = siblings(categories, category.block, category.parentId)
  const index = sibs.findIndex((c) => c.id === category.id)
  const blocked = descendantIds(categories, category.id)
  const moveTargets = flattenTree(buildTree(categories, category.block)).filter((n) => !blocked.has(n.category.id))

  return (
    <li className={category.archived ? 'archived' : undefined}>
      <div className="row" style={{ paddingLeft: `${1 + node.depth * 1.25}rem` }}>
        <span className="name">
          <InlineEdit
            value={category.name}
            label="Category name"
            onSave={(v) => run(() => renameCategory(category.id, v))}
          />
          {category.archived && <span className="badge">archived</span>}
        </span>
        <span className="actions">
          {category.block === 'expenses' && (
            <select
              aria-label="What happens to leftover budget"
              title="What happens to leftover budget at the end of the month"
              value={category.carryOver ?? ''}
              onChange={(e) =>
                run(() => setCategoryCarryOver(category.id, (e.target.value || undefined) as CarryOverMode | undefined))
              }
            >
              <option value="">Default: {CARRY_LABELS[settings.carryOverDefault].toLowerCase()}</option>
              <option value="carry">{CARRY_LABELS.carry}</option>
              <option value="toMainPot">{CARRY_LABELS.toMainPot}</option>
            </select>
          )}
          <select
            aria-label="Move to"
            title="Move under another category"
            value={category.parentId ?? ''}
            onChange={(e) => run(() => moveCategory(category.id, e.target.value || null))}
          >
            <option value="">Top level</option>
            {moveTargets.map((n) => (
              <option key={n.category.id} value={n.category.id}>
                {'  '.repeat(n.depth)}
                {n.category.name}
              </option>
            ))}
          </select>
          <button type="button" title="Move up" disabled={index <= 0} onClick={() => run(() => shiftCategory(category.id, -1))}>
            ↑
          </button>
          <button
            type="button"
            title="Move down"
            disabled={index === sibs.length - 1}
            onClick={() => run(() => shiftCategory(category.id, 1))}
          >
            ↓
          </button>
          <button type="button" title="Add subcategory" onClick={() => setAdding((a) => !a)}>
            + Sub
          </button>
          <button
            type="button"
            onClick={() => run(() => setCategoryArchived(category.id, !category.archived))}
            title={category.archived ? 'Show it again' : 'Hide it without losing anything'}
          >
            {category.archived ? 'Restore' : 'Archive'}
          </button>
          <ConfirmButton label="Delete" confirmLabel="Really delete?" onConfirm={() => void run(() => deleteCategory(category.id))} />
        </span>
      </div>
      {adding && (
        <form
          className="add-row"
          style={{ paddingLeft: `${1 + (node.depth + 1) * 1.25}rem` }}
          onSubmit={async (e) => {
            e.preventDefault()
            if (await run(() => addCategory(category.block, childName, category.id))) {
              setChildName('')
              setAdding(false)
            }
          }}
        >
          <input
            autoFocus
            placeholder={`Subcategory of ${category.name}`}
            aria-label={`New subcategory of ${category.name}`}
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>
      )}
      {node.children.length > 0 && (
        <ul className="tree">
          {node.children.map((child) => (
            <CategoryRow key={child.category.id} node={child} categories={categories} settings={settings} run={run} />
          ))}
        </ul>
      )}
    </li>
  )
}
