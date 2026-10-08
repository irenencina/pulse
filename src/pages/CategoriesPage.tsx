import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type DragEvent, type ReactNode } from 'react'
import AmountInput from '../components/AmountInput'
import ConfirmButton from '../components/ConfirmButton'
import Info from '../components/Info'
import InlineEdit from '../components/InlineEdit'
import Menu from '../components/Menu'
import Twisty from '../components/Twisty'
import { useCollapsed } from '../components/useCollapsed'
import { AddBelowIcon, AddInsideIcon, ArchiveIcon, CalendarIcon, GripIcon, MoveIcon, PlusIcon, RestoreIcon, ShieldIcon, TrashIcon } from '../components/icons'
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
  setCategoryFlag,
  setCategoryYearly,
  shiftCategory,
} from '../db/actions'
import { db } from '../db/db'
import { isEssential, isSafetyNet } from '../domain/safetyNet'
import { buildTree, descendantIds, flattenTree, siblings, type CategoryNode } from '../domain/categories'
import { BLOCKS, BLOCK_LABELS, type Block, type Category, type CarryOverMode, type Settings } from '../domain/types'

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString(undefined, { month: 'long' }))

/** The year a change to how often something is paid starts from: this year, or the first budgeted one. */
const planYear = (settings: Settings) => Math.max(settings.startingYear, new Date().getFullYear())

type Fold = ReturnType<typeof useCollapsed>

const CARRY_LABELS: Record<CarryOverMode, string> = {
  carry: 'Keep in this category',
  toMainPot: 'Send to Main Pot',
}

/** Income, Expenses and Savings with their categories, shown as a tab in Settings. */
export default function CategoriesPage() {
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const settings = useLiveQuery(() => getSettings(), [])
  const [showArchived, setShowArchived] = useState(false)
  const fold = useCollapsed('categories')

  if (!categories || !settings) return null

  return (
    <div className="categories-page">
      <div className="categories-head">
        <h2 className="settings-title">
          Categories{' '}
          <Info>
            Income, Expenses and Savings are the main blocks. Inside each, add categories and as many levels of
            subcategories as you like. Click a name to rename it, drag the handle on its left to reorder, and use the ⋯
            button of a row to add a category below or inside it, move it to another level, archive or delete it. The same
            menu marks spending as Essential and savings as Safety net, for the Safety net on the Dashboard.
          </Info>
        </h2>
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
            fold={fold}
          />
        ))}
      </div>
    </div>
  )
}

function BlockSection({
  block,
  categories,
  settings,
  showArchived,
  fold,
}: {
  block: Block
  categories: Category[]
  settings: Settings
  showArchived: boolean
  fold: Fold
}) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const { error, run } = useErrorMessage()
  const tree = buildTree(categories, block, showArchived)
  const dnd: DragProps = {
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
    <div className={`block block-${block}`}>
      <div className="row block-bar">
        <h2>{BLOCK_LABELS[block]}</h2>
        <span className="col-label">
          How often{' '}
          <Info>
            <strong>Every month</strong>: you plan it month by month in the planner. <strong>Once a year</strong>: pick
            the month it's paid and the amount, and the planner puts it in that month with a calendar icon and 0 in the
            others, every year. You can still type over any month in the planner.
          </Info>
        </span>
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
        <span aria-hidden="true" />
      </div>
      <ul className="tree">
        {tree.map((node) => (
          <CategoryRow key={node.category.id} node={node} categories={categories} settings={settings} run={run} dnd={dnd} fold={fold} />
        ))}
        {block === 'savings' && (
          <li className="locked">
            <div className="row">
              <span className="name" style={{ paddingLeft: '1.6rem' }}>
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
      <NewCategory
        label={`New ${BLOCK_LABELS[block].toLowerCase()} category`}
        button={
          <>
            <PlusIcon /> New category
          </>
        }
        className="new-category"
        onAdd={(name) => run(() => addCategory(block, name))}
      />
      {error && <p className="error">{error}</p>}
    </div>
  )
}

/** A quiet "+ New category" line that turns into a text box when clicked. Enter adds, Escape closes. */
function NewCategory({
  label,
  button,
  className,
  indent = 1,
  startOpen = false,
  onAdd,
  onClose,
}: {
  label: string
  button?: ReactNode
  className?: string
  indent?: number
  startOpen?: boolean
  onAdd: (name: string) => Promise<boolean>
  onClose?: () => void
}) {
  const [open, setOpen] = useState(startOpen)
  const [name, setName] = useState('')
  const close = () => {
    setName('')
    setOpen(false)
    onClose?.()
  }
  if (!open) {
    return (
      <button type="button" className={`ghost-add ${className ?? ''}`} style={{ paddingLeft: `${indent}rem` }} onClick={() => setOpen(true)}>
        {button}
      </button>
    )
  }
  return (
    <form
      className={`add-row ${className ?? ''}`}
      style={{ paddingLeft: `${indent}rem` }}
      onSubmit={async (e) => {
        e.preventDefault()
        if (await onAdd(name)) close()
      }}
      onBlur={(e) => {
        // Close when focus leaves the form without anything typed.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && name.trim() === '') close()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') close()
      }}
    >
      <input autoFocus placeholder={label} aria-label={label} value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit" className="primary icon-add" title="Add" aria-label="Add">
        <PlusIcon />
      </button>
    </form>
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
  drag: Drag | null
  setDrag: (drag: Drag | null) => void
  drop: (id: string, overId: string, after: boolean) => void
}

function CategoryRow({
  node,
  categories,
  run,
  settings,
  dnd,
  fold,
}: {
  node: CategoryNode
  categories: Category[]
  settings: Settings
  fold: Fold
  run: (action: () => Promise<unknown>) => Promise<boolean>
  dnd: DragProps
}) {
  const { category } = node
  const [adding, setAdding] = useState<'below' | 'inside' | null>(null)
  const [moving, setMoving] = useState(false)
  // The row is draggable only while the handle is held, so names stay clickable.
  const [grabbed, setGrabbed] = useState(false)
  const sibs = siblings(categories, category.block, category.parentId)
  const index = sibs.findIndex((c) => c.id === category.id)
  const blocked = descendantIds(categories, category.id)
  const moveTargets = flattenTree(buildTree(categories, category.block)).filter((n) => !blocked.has(n.category.id))

  const { drag, setDrag } = dnd
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
  const indent = 1.6 + node.depth * 1.25

  return (
    <li className={category.archived ? 'archived' : undefined}>
      <div
        className={`row${drag?.id === category.id ? ' dragging' : ''}${dropSide}`}
        draggable={grabbed}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', category.id)
          setDrag({ id: category.id, parentId: category.parentId, overId: null, after: false })
        }}
        onDragEnd={() => {
          setDrag(null)
          setGrabbed(false)
        }}
        onDragOver={onDragOver}
        onDrop={(e) => {
          if (!canDropHere || drag.overId === null) return
          e.preventDefault()
          dnd.drop(drag.id, drag.overId, drag.after)
          setDrag(null)
        }}
      >
        <span className="name" style={{ paddingLeft: `${indent}rem` }}>
          <span
            className="grip"
            role="button"
            tabIndex={0}
            aria-label={`Move ${category.name} (arrow keys)`}
            title="Drag up or down to reorder (or use the arrow keys)"
            onMouseDown={() => setGrabbed(true)}
            onMouseUp={() => setGrabbed(false)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' && index > 0) void run(() => shiftCategory(category.id, -1))
              if (e.key === 'ArrowDown' && index < sibs.length - 1) void run(() => shiftCategory(category.id, 1))
            }}
          >
            <GripIcon />
          </span>
          <Twisty
            name={category.name}
            show={node.children.length > 0}
            open={!fold.collapsed.has(category.id)}
            onToggle={() => fold.toggle(category.id)}
          />
          <InlineEdit
            value={category.name}
            label="Category name"
            onSave={(v) => run(() => renameCategory(category.id, v))}
          />
          {category.archived && <span className="badge">archived</span>}
          {(isEssential(category) || isSafetyNet(category)) && (
            <span
              className="badge safety-badge"
              title={isEssential(category) ? 'Counts as essential spending for the Safety net on the Dashboard' : 'Counts in your Safety net on the Dashboard'}
            >
              {isEssential(category) ? 'Essential' : 'Safety net'}
            </span>
          )}
          {category.yearly && node.children.length === 0 && (
            <span className="yearly-inline">
              <CalendarIcon />
              <select
                aria-label={`Month ${category.name} is paid in`}
                title="The month it's paid in"
                value={category.yearly.month}
                onChange={(e) =>
                  run(() => setCategoryYearly(category.id, { ...category.yearly!, month: Number(e.target.value) }, planYear(settings)))
                }
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
              <AmountInput
                label={`Yearly amount of ${category.name}`}
                cents={category.yearly.cents}
                onSave={(cents) => void run(() => setCategoryYearly(category.id, { ...category.yearly!, cents }, planYear(settings)))}
              />
            </span>
          )}
        </span>
        {node.children.length === 0 ? (
          <select
            aria-label={`How often ${category.name} is paid`}
            value={category.yearly ? 'year' : 'month'}
            onChange={(e) => {
              const now = new Date().getMonth() + 1
              const yearly = e.target.value === 'year' ? { month: now, cents: 0 } : undefined
              void run(() => setCategoryYearly(category.id, yearly, planYear(settings)))
            }}
          >
            <option value="month">Every month</option>
            <option value="year">Once a year</option>
          </select>
        ) : (
          <span className="muted small" title="Set it on its subcategories">
            –
          </span>
        )}
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
        <span className="actions">
          <Menu label={`More for ${category.name}`}>
            {(close) => (
              <>
                <button type="button" role="menuitem" onClick={() => (close(), setAdding('below'))}>
                  <AddBelowIcon /> Add a category below
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close()
                    setAdding('inside')
                    // A new subcategory should be seen, so open a collapsed category.
                    if (fold.collapsed.has(category.id)) fold.toggle(category.id)
                  }}
                >
                  <AddInsideIcon /> Add a subcategory inside
                </button>
                <button type="button" role="menuitem" onClick={() => (close(), setMoving(true))}>
                  <MoveIcon /> Move to another level…
                </button>
                {category.parentId === null && category.block !== 'income' && (
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={category.block === 'expenses' ? isEssential(category) : isSafetyNet(category)}
                    title={
                      category.block === 'expenses'
                        ? 'Spending you can’t do without, like rent or groceries. The Safety net on the Dashboard counts how many months your savings cover it.'
                        : 'Money set aside for emergencies. The Safety net on the Dashboard counts it.'
                    }
                    onClick={() => {
                      close()
                      const flag = category.block === 'expenses' ? 'essential' : 'safetyNet'
                      const on = category.block === 'expenses' ? isEssential(category) : isSafetyNet(category)
                      void run(() => setCategoryFlag(category.id, flag, !on))
                    }}
                  >
                    <ShieldIcon /> {category.block === 'expenses' ? (isEssential(category) ? 'Not essential' : 'Essential') : isSafetyNet(category) ? 'Not in the safety net' : 'Part of the safety net'}
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  title={category.archived ? 'Show it again' : 'Hide it without losing anything'}
                  onClick={() => (close(), void run(() => setCategoryArchived(category.id, !category.archived)))}
                >
                  {category.archived ? <RestoreIcon /> : <ArchiveIcon />} {category.archived ? 'Restore' : 'Archive'}
                </button>
                <ConfirmButton
                  className="menu-danger"
                  label={
                    <>
                      <TrashIcon /> Delete
                    </>
                  }
                  title={`Delete ${category.name}`}
                  confirmLabel="Sure? Click again to delete"
                  onConfirm={() => (close(), void run(() => deleteCategory(category.id)))}
                />
              </>
            )}
          </Menu>
        </span>
      </div>
      {moving && (
        <div className="move-row" style={{ paddingLeft: `${indent}rem` }}>
          <label className="small">
            Put {category.name}{' '}
            <select
              autoFocus
              aria-label={`Level of ${category.name}`}
              value={category.parentId ?? ''}
              onChange={async (e) => {
                if (await run(() => moveCategory(category.id, e.target.value || null))) setMoving(false)
              }}
              onKeyDown={(e) => e.key === 'Escape' && setMoving(false)}
            >
              <option value="">at the top level</option>
              {moveTargets.map((n) => (
                <option key={n.category.id} value={n.category.id}>
                  {'\u00a0\u00a0'.repeat(n.depth)}inside {n.category.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setMoving(false)}>
            Done
          </button>
        </div>
      )}
      {adding === 'inside' && (
        <NewCategory
          startOpen
          indent={indent + 1.25}
          label={`Subcategory of ${category.name}`}
          onAdd={(name) => run(() => addCategory(category.block, name, category.id))}
          onClose={() => setAdding(null)}
        />
      )}
      {node.children.length > 0 && !fold.collapsed.has(category.id) && (
        <ul className="tree">
          {node.children.map((child) => (
            <CategoryRow key={child.category.id} node={child} categories={categories} settings={settings} run={run} dnd={dnd} fold={fold} />
          ))}
        </ul>
      )}
      {adding === 'below' && (
        <NewCategory
          startOpen
          indent={indent}
          label={`New category after ${category.name}`}
          onAdd={(name) =>
            run(async () => {
              const id = await addCategory(category.block, name, category.parentId)
              await placeCategory(id, index + 1)
            })
          }
          onClose={() => setAdding(null)}
        />
      )}
    </li>
  )
}
