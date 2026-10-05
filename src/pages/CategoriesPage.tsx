import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type DragEvent } from 'react'
import ConfirmButton from '../components/ConfirmButton'
import Info from '../components/Info'
import InlineEdit from '../components/InlineEdit'
import { ArchiveIcon, DoneIcon, EditIcon, GripIcon, RestoreIcon, TrashIcon } from '../components/icons'
import { useErrorMessage } from '../components/useErrorMessage'
import {
  addCategory,
  deleteCategory,
  getSettings,
  moveCategory,
  placeCategory,
  renameCategory,
  setCategoryArchived,
  setCategoryCarryOver,
  shiftCategory,
} from '../db/actions'
import { db } from '../db/db'
import { buildTree, descendantIds, flattenTree, siblings, type CategoryNode } from '../domain/categories'
import { BLOCKS, BLOCK_LABELS, type Block, type Category, type CarryOverMode, type Settings } from '../domain/types'

const CARRY_LABELS: Record<CarryOverMode, string> = {
  carry: 'Keep in this category',
  toMainPot: 'Send to Main Pot',
}

export default function CategoriesPage() {
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const settings = useLiveQuery(() => getSettings(), [])
  const [showArchived, setShowArchived] = useState(false)

  if (!categories || !settings) return null

  return (
    <section className="page">
      <div className="page-head">
        <h1>
          Categories{' '}
          <Info>
            Income, Expenses and Savings are the main blocks. Inside each, add categories and as many levels of
            subcategories as you like. Click a name to rename it. Use the pencil of a block to reorder its categories by
            dragging them, or to archive or delete them.
          </Info>
        </h1>
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
  const [editing, setEditing] = useState(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const { error, run } = useErrorMessage()
  const tree = buildTree(categories, block, showArchived)
  const dnd: DragProps = {
    editing,
    drag,
    setDrag,
    drop: (id, overId, after) => {
      const moving = categories.find((c) => c.id === id)
      if (!moving) return
      const sibs = siblings(categories, block, moving.parentId)
      const from = sibs.findIndex((c) => c.id === id)
      let to = sibs.findIndex((c) => c.id === overId) + (after ? 1 : 0)
      if (from < to) to -= 1
      if (to !== from) void run(() => placeCategory(id, to))
    },
  }

  return (
    <div className={`block block-${block}${editing ? ' editing' : ''}`}>
      <div className="row block-bar">
        <h2>{BLOCK_LABELS[block]}</h2>
        {block === 'expenses' && (
          <span className="col-label">
            Unspent budget{' '}
            <Info>
              What happens to budget you didn't spend by the end of the month. <strong>Keep in this category</strong>:
              it stays there, so you can save up inside the category (for example for gym equipment).{' '}
              <strong>Send to Main Pot</strong>: it goes to your savings. <strong>Default</strong>: uses the choice
              in Settings, currently "{CARRY_LABELS[settings.carryOverDefault]}".
            </Info>
          </span>
        )}
        <span className="col-label">
          Inside <Info>Move a category under another one to make it a subcategory, or back to the top level.</Info>
        </span>
        <span className="col-label block-tools">
          <button
            type="button"
            className="icon-button"
            aria-pressed={editing}
            title={editing ? 'Done' : `Edit ${BLOCK_LABELS[block]}: drag to reorder, archive or delete`}
            aria-label={editing ? 'Done editing' : `Edit ${BLOCK_LABELS[block]}`}
            onClick={() => {
              setEditing(!editing)
              setDrag(null)
            }}
          >
            {editing ? <DoneIcon /> : <EditIcon />}
          </button>
        </span>
      </div>
      <ul className="tree">
        {tree.map((node) => (
          <CategoryRow key={node.category.id} node={node} categories={categories} run={run} dnd={dnd} />
        ))}
        {block === 'savings' && (
          <li className="locked">
            <div className="row">
              <span className="name" style={{ paddingLeft: '1rem' }}>
                Main Pot{' '}
                <Info>
                  Calculated automatically: whatever is left of your income after expenses and savings. It can't be
                  renamed, moved or removed.
                </Info>
              </span>
              <span className="locked-note">Automatic</span>
            </div>
          </li>
        )}
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

interface Drag {
  id: string
  parentId: string | null
  /** The row it would land next to, and on which side. */
  overId: string | null
  after: boolean
}

interface DragProps {
  editing: boolean
  drag: Drag | null
  setDrag: (drag: Drag | null) => void
  drop: (id: string, overId: string, after: boolean) => void
}

function CategoryRow({
  node,
  categories,
  run,
  dnd,
}: {
  node: CategoryNode
  categories: Category[]
  run: (action: () => Promise<unknown>) => Promise<boolean>
  dnd: DragProps
}) {
  const { category } = node
  const [adding, setAdding] = useState(false)
  const [childName, setChildName] = useState('')
  const sibs = siblings(categories, category.block, category.parentId)
  const index = sibs.findIndex((c) => c.id === category.id)
  const blocked = descendantIds(categories, category.id)
  const moveTargets = flattenTree(buildTree(categories, category.block)).filter((n) => !blocked.has(n.category.id))

  const { editing, drag, setDrag } = dnd
  // Rows only move among their siblings, like the order in the planner.
  const canDropHere = drag !== null && drag.id !== category.id && drag.parentId === category.parentId
  const dropSide = canDropHere && drag.overId === category.id ? (drag.after ? ' drop-after' : ' drop-before') : ''
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!canDropHere) return
    e.preventDefault()
    const box = e.currentTarget.getBoundingClientRect()
    const after = e.clientY > box.top + box.height / 2
    if (drag.overId !== category.id || drag.after !== after) setDrag({ ...drag, overId: category.id, after })
  }

  return (
    <li className={category.archived ? 'archived' : undefined}>
      <div
        className={`row${drag?.id === category.id ? ' dragging' : ''}${dropSide}`}
        draggable={editing}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', category.id)
          setDrag({ id: category.id, parentId: category.parentId, overId: null, after: false })
        }}
        onDragEnd={() => setDrag(null)}
        onDragOver={onDragOver}
        onDrop={(e) => {
          if (!canDropHere || drag.overId === null) return
          e.preventDefault()
          dnd.drop(drag.id, drag.overId, drag.after)
          setDrag(null)
        }}
      >
        <span className="name" style={{ paddingLeft: `${1 + node.depth * 1.25}rem` }}>
          {editing && (
            <span
              className="grip"
              role="button"
              tabIndex={0}
              aria-label={`Move ${category.name} (arrow keys)`}
              title="Drag up or down to reorder (or use the arrow keys)"
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp' && index > 0) void run(() => shiftCategory(category.id, -1))
                if (e.key === 'ArrowDown' && index < sibs.length - 1) void run(() => shiftCategory(category.id, 1))
              }}
            >
              <GripIcon />
            </span>
          )}
          <InlineEdit
            value={category.name}
            label="Category name"
            onSave={(v) => run(() => renameCategory(category.id, v))}
          />
          {category.archived && <span className="badge">archived</span>}
        </span>
        {category.block === 'expenses' && (
          <select
            aria-label={`Unspent budget of ${category.name}`}
            value={category.carryOver ?? ''}
            onChange={(e) =>
              run(() => setCategoryCarryOver(category.id, (e.target.value || undefined) as CarryOverMode | undefined))
            }
          >
            <option value="">Default</option>
            <option value="carry">{CARRY_LABELS.carry}</option>
            <option value="toMainPot">{CARRY_LABELS.toMainPot}</option>
          </select>
        )}
        <select
          aria-label={`Move ${category.name} inside`}
          value={category.parentId ?? ''}
          onChange={(e) => run(() => moveCategory(category.id, e.target.value || null))}
        >
          <option value="">Top level</option>
          {moveTargets.map((n) => (
            <option key={n.category.id} value={n.category.id}>
              {'\u00a0\u00a0'.repeat(n.depth)}
              {n.category.name}
            </option>
          ))}
        </select>
        <span className="actions">
          <button type="button" title="Add a subcategory" onClick={() => setAdding(true)}>
            + Sub
          </button>
          {editing && (
            <>
              <button
                type="button"
                className="icon-button"
                onClick={() => run(() => setCategoryArchived(category.id, !category.archived))}
                title={category.archived ? 'Restore: show it again' : 'Archive: hide it without losing anything'}
                aria-label={category.archived ? `Restore ${category.name}` : `Archive ${category.name}`}
              >
                {category.archived ? <RestoreIcon /> : <ArchiveIcon />}
              </button>
              <ConfirmButton
                className="icon-button"
                label={<TrashIcon />}
                title={`Delete ${category.name}`}
                confirmLabel="Sure?"
                onConfirm={() => void run(() => deleteCategory(category.id))}
              />
            </>
          )}
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
          onBlur={(e) => {
            // Close when focus leaves the form without anything typed.
            if (!e.currentTarget.contains(e.relatedTarget as Node | null) && childName.trim() === '') setAdding(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
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
            <CategoryRow key={child.category.id} node={child} categories={categories} run={run} dnd={dnd} />
          ))}
        </ul>
      )}
    </li>
  )
}
