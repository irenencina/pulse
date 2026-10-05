import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type KeyboardEvent, type ClipboardEvent } from 'react'
import Info from '../components/Info'
import { useErrorMessage } from '../components/useErrorMessage'
import { getSettings, setBudgetCell, setBudgetCells } from '../db/actions'
import { db } from '../db/db'
import {
  cellId,
  computePlan,
  formatCellInput,
  monthlyAverage,
  parseCellInput,
  type BudgetCell,
  type CellValue,
  type MonthTotals,
  type PlanYear,
} from '../domain/budget'
import { buildTree, flattenTree } from '../domain/categories'
import {
  clear,
  copy,
  fillDown,
  fillRight,
  fillTarget,
  fillTo,
  fromTsv,
  inRect,
  paste,
  rectOf,
  rectSize,
  toTsv,
  type CellWrite,
  type Pos,
  type Rect,
} from '../domain/grid'
import { BLOCKS, BLOCK_LABELS, type Block, type Category } from '../domain/types'

const number = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (cents: number) => (cents === 0 ? '–' : number.format(cents / 100))
const monthName = (key: string) =>
  new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1).toLocaleString(undefined, { month: 'short' })
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export default function PlannerPage() {
  const settings = useLiveQuery(() => getSettings(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const cells = useLiveQuery(() => db.budgetCells.toArray(), [])
  const [chosenYear, setYear] = useState<number | null>(null)
  const { error, run } = useErrorMessage()
  const [anchor, setAnchor] = useState<Pos | null>(null)
  const [focus, setFocus] = useState<Pos | null>(null)
  const [lens, setLens] = useState(false)
  const dragging = useRef(false)
  /** While the fill handle (the selection's bottom-right corner) is dragged: what it fills. */
  const [fill, setFill] = useState<{ source: Rect; target: Rect } | null>(null)
  const finishFill = useRef<() => void>(() => {})

  useEffect(() => {
    const stop = () => {
      dragging.current = false
      finishFill.current()
    }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [])

  if (!settings || !categories || !cells) return null

  const year = chosenYear ?? Math.max(settings.startingYear, new Date().getFullYear())
  const plan = computePlan(categories, cells, settings, year)
  const cellMap = new Map(cells.map((c) => [c.id, c]))
  const years = Array.from({ length: 10 }, (_, i) => settings.startingYear + i)
  const yearToAllocate = sum(plan.totals.map((t) => t.toAllocate))
  const yearIncome = sum(plan.totals.map((t) => t.income))

  // Editable rows (categories without subcategories), top to bottom across the three blocks.
  const editRows = BLOCKS.flatMap((block) =>
    flattenTree(buildTree(categories, block))
      .filter((n) => n.children.length === 0)
      .map((n) => n.category),
  )
  const rowIndex = new Map(editRows.map((c, i) => [c.id, i]))
  const size = { rows: editRows.length, cols: plan.months.length }
  const rect = anchor && focus ? rectOf(anchor, focus) : null
  const multi = rect !== null && rectSize(rect) > 1

  const valueAt = (p: Pos): CellValue | null => {
    const cell = cellMap.get(cellId(editRows[p.row]!.id, plan.months[p.col]!))
    if (!cell) return null
    return cell.kind === 'fixed' ? { kind: 'fixed', cents: cell.cents } : { kind: 'percent', basisPoints: cell.basisPoints }
  }

  const apply = (writes: CellWrite[]) => {
    const rows = writes.flatMap((w) => {
      const category = editRows[w.row]
      // Income can't be a percentage of itself.
      if (!category || (category.block === 'income' && w.value?.kind === 'percent')) return []
      // Months before budgeting starts stay empty.
      if (!plan.totals[w.col]?.active) return []
      return [{ categoryId: category.id, month: plan.months[w.col]!, value: w.value }]
    })
    return run(() => setBudgetCells(rows))
  }

  const select = (p: Pos, extend: boolean) => {
    if (!extend || !anchor) setAnchor(p)
    setFocus(p)
  }

  const focusCell = (p: Pos) => {
    const target = document.querySelector<HTMLInputElement>(`[data-cell="${p.row}-${p.col}"] input`)
    target?.focus()
  }
  /** A cell is being typed in (after a double-click, F2 or typing); otherwise it's only selected. */
  const isEditing = (el: EventTarget) => el instanceof HTMLInputElement && !el.readOnly

  finishFill.current = () => {
    if (!fill) return
    setFill(null)
    const writes = fillTo(fill.source, fill.target, valueAt)
    if (writes.length === 0) return
    setAnchor({ row: fill.target.top, col: fill.target.left })
    setFocus({ row: fill.target.bottom, col: fill.target.right })
    void apply(writes)
  }

  // Ctrl+C on selected cells puts them on the clipboard as spreadsheet text.
  const onCopy = (e: ClipboardEvent) => {
    const here = posOf(e.target)
    if (!here || isEditing(e.target)) return
    e.preventDefault()
    e.clipboardData.setData('text/plain', toTsv(copy(rect ?? rectOf(here, here), valueAt)))
  }

  const posOf = (el: EventTarget): Pos | null => {
    const td = (el as HTMLElement).closest?.('[data-cell]')
    const key = td?.getAttribute('data-cell')
    if (!key) return null
    const [row, col] = key.split('-').map(Number) as [number, number]
    return { row, col }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const here = posOf(e.target)
    if (!here) return
    const mod = e.ctrlKey || e.metaKey
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const move = moves[e.key]
    if (move && e.shiftKey) {
      e.preventDefault()
      const from = focus ?? here
      const row = Math.min(size.rows - 1, Math.max(0, from.row + move[0]))
      const col = Math.min(size.cols - 1, Math.max(0, from.col + move[1]))
      if (!anchor) setAnchor(here)
      setFocus({ row, col })
      return
    }
    const editing = isEditing(e.target)
    // While typing, left and right move inside the text; otherwise every arrow moves the selection.
    if (move && !mod && (!editing || move[0] !== 0)) {
      e.preventDefault()
      const row = Math.min(size.rows - 1, Math.max(0, here.row + move[0]))
      const col = Math.min(size.cols - 1, Math.max(0, here.col + move[1]))
      focusCell({ row, col })
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      // The cell has already saved itself; move down like a spreadsheet.
      if (here.row + 1 < size.rows) requestAnimationFrame(() => focusCell({ row: here.row + 1, col: here.col }))
      return
    }
    if (editing) return
    if ((e.key === 'Delete' || e.key === 'Backspace') && !multi) {
      e.preventDefault()
      void apply(clear(rectOf(here, here)))
      return
    }
    if (!multi || !rect) return
    if (mod && e.key.toLowerCase() === 'r') {
      e.preventDefault()
      void apply(fillRight(rect, valueAt))
    } else if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault()
      void apply(fillDown(rect, valueAt))
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      void apply(clear(rect))
    } else if (e.key === 'Escape') {
      setAnchor(here)
      setFocus(here)
    }
  }

  const onPaste = (e: ClipboardEvent) => {
    const here = posOf(e.target)
    if (!here) return
    // While typing in a cell, pasting is just typing.
    if (isEditing(e.target)) return
    const text = e.clipboardData.getData('text')
    e.preventDefault()
    const matrix = fromTsv(text)
    if (!matrix) {
      void run(async () => {
        throw new Error('Only amounts and percentages can be pasted into the planner.')
      })
      return
    }
    ;(e.target as HTMLInputElement).blur()
    void apply(paste(rect ?? rectOf(here, here), matrix, size))
  }

  return (
    <section className="page wide">
      <div className="page-head">
        <h1>
          Budget planner{' '}
          <Info>
            Click a cell to select it and type an amount, or a percentage like 15% to take that share of the month's
            income; double-click to change what's there. Enter saves and moves down. Drag or Shift-click to select
            several cells, then copy, paste or Delete. Drag the small square at the corner of a selection to copy it
            into the cells below or to the right.
          </Info>
        </h1>
        <div className="head-tools">
          <div className="toolbox" role="toolbar" aria-label="Tools">
            <button
              type="button"
              className="tool"
              aria-pressed={lens}
              title={
                (lens ? 'Binoculars (on). ' : 'Binoculars. ') +
                "Hover a number to see its share of income: month cells against that month's income, the Year and Avg/month columns against the year's income."
              }
              onClick={() => setLens((on) => !on)}
            >
              <BinocularsIcon />
            </button>
          </div>
          <div className="scope-pickers">
            <label>
              <span>Year</span>
              <select id="planner-year" aria-label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {[...years].reverse().map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="grid-scroll">
        <table
          className={lens ? 'planner lens' : 'planner'}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onCopy={onCopy}
          // Dragging selects cells; don't let the browser drag the cell's text into another cell.
          onDragStart={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
          onMouseDown={(e) => {
            const p = posOf(e.target)
            if (!p || e.button !== 0) return
            if ((e.target as HTMLElement).classList.contains('fill-handle')) {
              e.preventDefault()
              const source = rect ?? rectOf(p, p)
              setFill({ source, target: source })
              return
            }
            // A click selects; only a double-click (or typing) starts editing, so no text cursor yet.
            if (!isEditing(e.target)) {
              e.preventDefault()
              if (!e.shiftKey) focusCell(p)
            }
            if (e.shiftKey && anchor) {
              select(p, true)
            } else {
              select(p, false)
              dragging.current = true
            }
          }}
          onMouseOver={(e) => {
            const p = posOf(e.target)
            if (!p) return
            if (fill) {
              setFill({ ...fill, target: fillTarget(fill.source, p) })
              return
            }
            if (dragging.current) setFocus(p)
          }}
          onFocus={(e) => {
            const p = posOf(e.target)
            if (p && !dragging.current && !multi) select(p, false)
          }}
        >
          <thead>
            <tr className="allocate-row">
              <th scope="row" className="row-label">To be allocated</th>
              {plan.totals.map((t) => (
                <td
                  key={t.month}
                  className={!t.active ? 'inactive' : t.toAllocate === 0 ? 'ok' : t.toAllocate < 0 ? 'bad' : 'warn'}
                >
                  {!t.active ? '' : t.toAllocate === 0 ? '✓' : <Num cents={t.toAllocate} base={t.income} />}
                </td>
              ))}
              <td className={yearToAllocate === 0 ? 'ok' : yearToAllocate < 0 ? 'bad' : 'warn'}>
                {yearToAllocate === 0 ? '✓' : <Num cents={yearToAllocate} base={yearIncome} />}
              </td>
              <td />
            </tr>
          </thead>
          {BLOCKS.map((block) => (
            <BlockRows
              key={block}
              block={block}
              categories={categories}
              plan={plan}
              cellMap={cellMap}
              run={run}
              rowIndex={rowIndex}
              rect={rect}
              anchor={anchor}
              handleAt={fill ? null : (rect ? { row: rect.bottom, col: rect.right } : anchor)}
              fillPreview={fill?.target ?? null}
            />
          ))}
        </table>
      </div>
    </section>
  )
}

function BlockRows({
  block,
  categories,
  plan,
  cellMap,
  run,
  rowIndex,
  rect,
  anchor,
  handleAt,
  fillPreview,
}: {
  block: Block
  categories: Category[]
  plan: PlanYear
  cellMap: Map<string, BudgetCell>
  run: (action: () => Promise<unknown>) => Promise<boolean>
  rowIndex: Map<string, number>
  rect: Rect | null
  anchor: Pos | null
  /** The cell that shows the fill handle: the bottom-right corner of the selection. */
  handleAt: Pos | null
  fillPreview: Rect | null
}) {
  const rows = flattenTree(buildTree(categories, block))
  const totalOf = (t: MonthTotals) => (block === 'savings' ? t.savings + t.mainPot : t[block])
  const totals = plan.totals.map(totalOf)
  const yearIncome = sum(plan.totals.map((t) => t.income))
  const monthIncome = (i: number) => plan.totals[i]!.income
  const off = (i: number, classes: string) => (plan.totals[i]!.active ? classes : `${classes} inactive`)
  const avg = (values: number[]) => monthlyAverage(values, plan.activeMonths)
  const avgBase = plan.activeMonths > 0 ? yearIncome / plan.activeMonths : 0

  return (
    <tbody className={`block-${block}`}>
      <tr className="block-head">
        <th scope="col">{BLOCK_LABELS[block]}</th>
        {plan.months.map((m, i) => (
          <th key={m} scope="col" className={plan.totals[i]!.active ? undefined : 'inactive'}>
            {monthName(m)}
          </th>
        ))}
        <th scope="col">{plan.year}</th>
        <th scope="col">
          Avg/month <Info>The year total divided by the months budgeted (12, or fewer in the year budgeting starts). A cost paid once a year shows here as its monthly share.</Info>
        </th>
      </tr>
      {rows.length === 0 && (
        <tr>
          <td className="row-label muted" colSpan={15}>
            No {BLOCK_LABELS[block].toLowerCase()} categories yet. Add them on the Categories page.
          </td>
        </tr>
      )}
      {rows.map(({ category, depth, children }) => {
        const values = plan.amounts.get(category.id) ?? []
        const isParent = children.length > 0
        return (
          <tr key={category.id} className={isParent ? 'parent' : undefined}>
            <th scope="row" className="row-label" style={{ paddingLeft: `${0.6 + depth * 1}rem` }}>
              <span>{category.name}</span>
            </th>
            {plan.months.map((month, i) =>
              isParent ? (
                <td key={month} className={off(i, 'num')}>
                  <Num cents={values[i] ?? 0} base={monthIncome(i)} />
                </td>
              ) : (
                <td
                  key={month}
                  data-cell={`${rowIndex.get(category.id)}-${i}`}
                  className={
                    cellClass(rect, anchor, { row: rowIndex.get(category.id)!, col: i }) +
                    (fillPreview && inRect(fillPreview, { row: rowIndex.get(category.id)!, col: i }) ? ' fill-preview' : '') +
                    (plan.totals[i]!.active ? '' : ' inactive')
                  }
                >
                  {handleAt?.row === rowIndex.get(category.id) && handleAt?.col === i && (
                    <span className="fill-handle" title="Drag to copy into the cells below or to the right" aria-hidden="true" />
                  )}
                  <CellInput
                    label={`${category.name}, ${monthName(month)} ${plan.year}`}
                    cell={cellMap.get(cellId(category.id, month))}
                    computed={values[i] ?? 0}
                    income={plan.totals[i]!.income}
                    allowPercent={block !== 'income'}
                    disabled={!plan.totals[i]!.active}
                    onSave={(value) => run(() => setBudgetCell(category.id, month, value))}
                  />
                </td>
              ),
            )}
            <td className="num strong">
              <Num cents={sum(values)} base={yearIncome} />
            </td>
            <td className="num muted">
              <Num cents={avg(values)} base={avgBase} />
            </td>
          </tr>
        )
      })}
      {block === 'savings' && (
        <tr className="main-pot">
          <th scope="row" className="row-label">
            Main Pot{' '}
            <Info>
              Calculated automatically: whatever is left of your income after expenses and savings, once every
              category of the month is filled in (0 counts, blank doesn't; until then it shows …). When a month
              spends more than it earns, it takes the difference out of the Main Pot (shown in red). Change this in
              Settings.
            </Info>
          </th>
          {plan.totals.map((t, i) =>
            t.waitingForPlan ? (
              <td
                key={t.month}
                className={off(i, 'num waiting')}
                title="Fill in every category of this month first (0 counts, blank doesn't). Until then, what's left stays in To allocate."
              >
                …
              </td>
            ) : (
              <td key={t.month} className={off(i, t.mainPot < 0 ? 'num neg' : 'num')}>
                <Num cents={t.mainPot} base={t.income} />
              </td>
            ),
          )}
          <td className="num strong">
            <Num cents={sum(plan.totals.map((t) => t.mainPot))} base={yearIncome} />
          </td>
          <td className="num muted">
            <Num cents={avg(plan.totals.map((t) => t.mainPot))} base={avgBase} />
          </td>
        </tr>
      )}
      <tr className="total">
        <th scope="row" className="row-label">
          Total
        </th>
        {totals.map((v, i) => (
          <td key={plan.months[i]} className={off(i, 'num')}>
            <Num cents={v} base={monthIncome(i)} />
          </td>
        ))}
        <td className="num">
          <Num cents={sum(totals)} base={yearIncome} />
        </td>
        <td className="num muted">
          <Num cents={avg(totals)} base={avgBase} />
        </td>
      </tr>
      {block === 'savings' && (
        <>
          <tr className="balance">
            <th scope="row" className="row-label">
              Main Pot balance <Info>How much is in the Main Pot at the end of each month, counted from the month budgeting starts.</Info>
            </th>
            {plan.totals.map((t, i) => (
              <td key={t.month} className={off(i, t.potBalance < 0 ? 'num neg' : 'num')}>
                <Num cents={t.potBalance} base={t.income} />
              </td>
            ))}
            <td colSpan={2} />
          </tr>
          <tr className="balance">
            <th scope="row" className="row-label">
              Saved so far{' '}
              <Info>Everything planned into savings since budgeting started, including the Main Pot.</Info>
            </th>
            {plan.totals.map((t, i) => (
              <td key={t.month} className={off(i, 'num')}>
                <Num cents={t.savedTotal} base={t.income} />
              </td>
            ))}
            <td colSpan={2} />
          </tr>
        </>
      )}
    </tbody>
  )
}

const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 })

/** Share of income as text, e.g. "15.6%". */
function shareOf(cents: number, base: number): string {
  if (cents === 0 || base <= 0) return '–'
  return percent.format(cents / base)
}

/** A number that turns into its share of income when the binoculars are on and you hover it. */
function Num({ cents, base }: { cents: number; base: number }) {
  return (
    <span className="lens-num">
      <span className="amt">{fmt(cents)}</span>
      <span className="pct" aria-hidden="true">
        {shareOf(cents, base)}
      </span>
    </span>
  )
}

function BinocularsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6.5" cy="15.5" r="3.5" />
      <circle cx="17.5" cy="15.5" r="3.5" />
      <path d="M10 15.5h4" />
      <path d="M3.2 14 5.5 6.5A2 2 0 0 1 7.4 5H9a1 1 0 0 1 1 1v9.5" />
      <path d="M20.8 14 18.5 6.5A2 2 0 0 0 16.6 5H15a1 1 0 0 0-1 1v9.5" />
    </svg>
  )
}

function cellClass(rect: Rect | null, anchor: Pos | null, p: Pos): string {
  const classes = ['num', 'input-cell']
  if (rect && rectSize(rect) > 1 && inRect(rect, p)) classes.push('selected')
  if (anchor && anchor.row === p.row && anchor.col === p.col && rect && rectSize(rect) > 1) classes.push('anchor')
  return classes.join(' ')
}

function CellInput({
  label,
  cell,
  computed,
  income,
  allowPercent,
  disabled,
  onSave,
}: {
  label: string
  cell: BudgetCell | undefined
  computed: number
  income: number
  allowPercent: boolean
  disabled?: boolean
  onSave: (value: CellValue | null) => Promise<boolean> | void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const editing = draft !== null
  const stored = formatCellInput(cell)

  // A fill or paste can change this cell while it's being edited; show the new value.
  useEffect(() => {
    setDraft((d) => (d === null ? d : stored))
    setInvalid(false)
  }, [stored])

  const commit = () => {
    if (draft === null) return
    const parsed = parseCellInput(draft)
    if (parsed === undefined || (parsed?.kind === 'percent' && !allowPercent)) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setDraft(null)
    if (formatCellInput(parsed ?? undefined) !== formatCellInput(cell)) void onSave(parsed)
  }

  const shown = cell?.kind === 'percent' ? fmt(computed) : cell ? fmt(cell.cents) : ''
  const percentTitle =
    cell?.kind === 'percent' ? `${cell.basisPoints / 100}% of income (${fmt(income)}) = ${fmt(computed)}` : undefined
  return (
    <>
      <input
        aria-label={label}
        disabled={disabled}
        className={invalid ? 'invalid' : cell?.kind === 'percent' ? 'percent' : undefined}
        title={
          invalid
            ? allowPercent
              ? 'Type an amount like 486.50 or a share like 15%'
              : 'Type an amount like 3119.22'
            : editing
              ? undefined
              : percentTitle
        }
        value={editing ? draft : shown}
        readOnly={!editing}
        inputMode="decimal"
        onDoubleClick={(e) => {
          if (disabled || editing) return
          setDraft(formatCellInput(cell))
          const input = e.currentTarget
          requestAnimationFrame(() => input.select())
        }}
        onChange={(e) => {
          setDraft(e.target.value)
          setInvalid(false)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (!editing) {
            // Typing on a selected cell replaces it, F2 edits what's there, like a spreadsheet.
            if (disabled) return
            if (e.key === 'F2') {
              e.preventDefault()
              setDraft(formatCellInput(cell))
            } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
              e.preventDefault()
              setDraft(e.key)
            }
            return
          }
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            // Back to just selected, keeping what was there.
            setDraft(null)
            setInvalid(false)
          }
        }}
      />
      {!editing && (
        <span className="pct input-pct" aria-hidden="true">
          {shareOf(computed, income)}
        </span>
      )}
      {cell?.kind === 'percent' && !editing && (
        <span className="pct-tag" aria-hidden="true">
          {cell.basisPoints / 100}%
        </span>
      )}
    </>
  )
}
