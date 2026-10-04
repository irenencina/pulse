import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type KeyboardEvent, type ClipboardEvent } from 'react'
import Info from '../components/Info'
import { useErrorMessage } from '../components/useErrorMessage'
import { copyYear, getSettings, setBudgetCell, setBudgetCells } from '../db/actions'
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
  fromTsv,
  inRect,
  paste,
  rectOf,
  rectSize,
  toTsv,
  type CellWrite,
  type Matrix,
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
  const [notice, setNotice] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<Pos | null>(null)
  const [focus, setFocus] = useState<Pos | null>(null)
  const [clip, setClip] = useState<Matrix | null>(null)
  const dragging = useRef(false)

  useEffect(() => {
    const stop = () => (dragging.current = false)
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [])

  if (!settings || !categories || !cells) return null

  const year = chosenYear ?? Math.max(settings.startingYear, new Date().getFullYear())
  const plan = computePlan(categories, cells, settings, year)
  const cellMap = new Map(cells.map((c) => [c.id, c]))
  const years = Array.from({ length: 10 }, (_, i) => settings.startingYear + i)
  const yearToAllocate = sum(plan.totals.map((t) => t.toAllocate))

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

  const copySelection = (r: Rect) => {
    const matrix = copy(r, valueAt)
    setClip(matrix)
    try {
      void navigator.clipboard?.writeText(toTsv(matrix)).catch(() => {})
    } catch {
      // The in-app clipboard still works when the system one is blocked.
    }
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
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !mod) {
      e.preventDefault()
      const row = Math.min(size.rows - 1, Math.max(0, here.row + move![0]))
      focusCell({ row, col: here.col })
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      // The cell has already saved itself; move down like a spreadsheet.
      if (here.row + 1 < size.rows) requestAnimationFrame(() => focusCell({ row: here.row + 1, col: here.col }))
      return
    }
    if (!multi || !rect) return
    if (mod && e.key.toLowerCase() === 'c') {
      e.preventDefault()
      copySelection(rect)
    } else if (mod && e.key.toLowerCase() === 'r') {
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
    const text = e.clipboardData.getData('text')
    const isBlock = /[\t\n]/.test(text.trim())
    // A plain value pasted into one cell is just typing; let the cell handle it.
    if (!multi && !isBlock) return
    e.preventDefault()
    const matrix = fromTsv(text)
    if (!matrix) {
      setNotice(null)
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
            Click a cell and type an amount, or a percentage like 15% to take that share of the month's income. Enter
            saves and moves down. Select several cells to fill, copy, paste or clear them at once.
          </Info>
        </h1>
        <div className="toolbar">
          <label>
            Year{' '}
            <select id="planner-year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() =>
              run(async () => {
                const copied = await copyYear(year)
                setNotice(
                  copied === 0
                    ? `Nothing to copy: every category already has amounts in ${year + 1}, or ${year} is empty.`
                    : `Copied ${copied} amounts into ${year + 1}.`,
                )
              })
            }
          >
            Copy {year} into {year + 1}
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <div className="selection-bar" onMouseDown={(e) => e.preventDefault()}>
        {rect ? (
          <>
            <span className="selection-count">
              {rectSize(rect)} {rectSize(rect) === 1 ? 'cell' : 'cells'} selected
            </span>
            <button type="button" disabled={rect.left === rect.right} onClick={() => apply(fillRight(rect, valueAt))}>
              Fill right
            </button>
            <button type="button" disabled={rect.top === rect.bottom} onClick={() => apply(fillDown(rect, valueAt))}>
              Fill down
            </button>
            <button type="button" onClick={() => copySelection(rect)}>
              Copy
            </button>
            <button type="button" disabled={!clip} onClick={() => clip && apply(paste(rect, clip, size))}>
              Paste
            </button>
            <button type="button" className="danger" onClick={() => apply(clear(rect))}>
              Clear
            </button>
            <Info>
              Shift-click or drag to select cells, or use Shift + arrow keys. Fill right copies the first selected
              month of each row into the rest; Fill down copies the top row. Ctrl+C and Ctrl+V copy and paste, also
              from Excel. Delete clears the selection.
            </Info>
          </>
        ) : (
          <span className="selection-count muted">
            Click a cell to start. Shift-click or drag to select several.
          </span>
        )}
      </div>

      <div className="grid-scroll">
        <table
          className="planner"
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          // Dragging selects cells; don't let the browser drag the cell's text into another cell.
          onDragStart={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
          onMouseDown={(e) => {
            const p = posOf(e.target)
            if (!p) return
            if (e.shiftKey && anchor) {
              e.preventDefault()
              select(p, true)
            } else {
              select(p, false)
              dragging.current = true
            }
          }}
          onMouseOver={(e) => {
            if (!dragging.current) return
            const p = posOf(e.target)
            if (p) setFocus(p)
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
                <td key={t.month} className={t.toAllocate === 0 ? 'ok' : t.toAllocate < 0 ? 'bad' : 'warn'}>
                  {t.toAllocate === 0 ? '✓' : fmt(t.toAllocate)}
                </td>
              ))}
              <td className={yearToAllocate === 0 ? 'ok' : yearToAllocate < 0 ? 'bad' : 'warn'}>
                {yearToAllocate === 0 ? '✓' : fmt(yearToAllocate)}
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
}: {
  block: Block
  categories: Category[]
  plan: PlanYear
  cellMap: Map<string, BudgetCell>
  run: (action: () => Promise<unknown>) => Promise<boolean>
  rowIndex: Map<string, number>
  rect: Rect | null
  anchor: Pos | null
}) {
  const rows = flattenTree(buildTree(categories, block))
  const totalOf = (t: MonthTotals) => (block === 'savings' ? t.savings + t.mainPot : t[block])
  const totals = plan.totals.map(totalOf)

  return (
    <tbody className={`block-${block}`}>
      <tr className="block-head">
        <th scope="col">{BLOCK_LABELS[block]}</th>
        {plan.months.map((m) => (
          <th key={m} scope="col">
            {monthName(m)}
          </th>
        ))}
        <th scope="col">{plan.year}</th>
        <th scope="col">
          Avg/month <Info>The year total divided by 12. A cost paid once a year shows here as its monthly share.</Info>
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
                <td key={month} className="num">
                  {fmt(values[i] ?? 0)}
                </td>
              ) : (
                <td
                  key={month}
                  data-cell={`${rowIndex.get(category.id)}-${i}`}
                  className={cellClass(rect, anchor, { row: rowIndex.get(category.id)!, col: i })}
                >
                  <CellInput
                    label={`${category.name}, ${monthName(month)} ${plan.year}`}
                    cell={cellMap.get(cellId(category.id, month))}
                    computed={values[i] ?? 0}
                    income={plan.totals[i]!.income}
                    allowPercent={block !== 'income'}
                    onSave={(value) => run(() => setBudgetCell(category.id, month, value))}
                  />
                </td>
              ),
            )}
            <td className="num strong">{fmt(sum(values))}</td>
            <td className="num muted">{fmt(monthlyAverage(values))}</td>
          </tr>
        )
      })}
      {block === 'savings' && (
        <tr className="main-pot">
          <th scope="row" className="row-label">
            Main Pot{' '}
            <Info>
              Calculated automatically: whatever is left of your income after expenses and savings. When a month
              spends more than it earns, it takes the difference out of the Main Pot (shown in red). Change this in
              Settings.
            </Info>
          </th>
          {plan.totals.map((t) => (
            <td key={t.month} className={t.mainPot < 0 ? 'num neg' : 'num'}>
              {fmt(t.mainPot)}
            </td>
          ))}
          <td className="num strong">{fmt(sum(plan.totals.map((t) => t.mainPot)))}</td>
          <td className="num muted">{fmt(monthlyAverage(plan.totals.map((t) => t.mainPot)))}</td>
        </tr>
      )}
      <tr className="total">
        <th scope="row" className="row-label">
          Total
        </th>
        {totals.map((v, i) => (
          <td key={plan.months[i]} className="num">
            {fmt(v)}
          </td>
        ))}
        <td className="num">{fmt(sum(totals))}</td>
        <td className="num muted">{fmt(monthlyAverage(totals))}</td>
      </tr>
      {block === 'savings' && (
        <>
          <tr className="balance">
            <th scope="row" className="row-label">
              Main Pot balance <Info>How much is in the Main Pot at the end of each month, counted from the starting year.</Info>
            </th>
            {plan.totals.map((t) => (
              <td key={t.month} className={t.potBalance < 0 ? 'num neg' : 'num'}>
                {fmt(t.potBalance)}
              </td>
            ))}
            <td colSpan={2} />
          </tr>
          <tr className="balance">
            <th scope="row" className="row-label">
              Saved so far{' '}
              <Info>Everything planned into savings since the starting year, including the Main Pot.</Info>
            </th>
            {plan.totals.map((t) => (
              <td key={t.month} className="num">
                {fmt(t.savedTotal)}
              </td>
            ))}
            <td colSpan={2} />
          </tr>
        </>
      )}
    </tbody>
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
  onSave,
}: {
  label: string
  cell: BudgetCell | undefined
  computed: number
  income: number
  allowPercent: boolean
  onSave: (value: CellValue | null) => Promise<boolean> | void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const editing = draft !== null
  const cancelled = useRef(false)
  const stored = formatCellInput(cell)

  // A fill or paste can change this cell while it's being edited; show the new value.
  useEffect(() => {
    setDraft((d) => (d === null ? d : stored))
    setInvalid(false)
  }, [stored])

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false
      return
    }
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
        placeholder="–"
        inputMode="decimal"
        onFocus={(e) => {
          setDraft(formatCellInput(cell))
          requestAnimationFrame(() => e.target.select())
        }}
        onChange={(e) => {
          setDraft(e.target.value)
          setInvalid(false)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            cancelled.current = true
            setDraft(null)
            setInvalid(false)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
      {cell?.kind === 'percent' && !editing && (
        <span className="pct-tag" aria-hidden="true">
          {cell.basisPoints / 100}%
        </span>
      )}
    </>
  )
}
