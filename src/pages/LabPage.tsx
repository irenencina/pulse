import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'
import ConfirmButton from '../components/ConfirmButton'
import Info from '../components/Info'
import { ArrowInIcon, ImportIcon, MinusIcon, PlusIcon, TrashIcon } from '../components/icons'
import Menu from '../components/Menu'
import { useErrorMessage } from '../components/useErrorMessage'
import { getSettings, updateSettings } from '../db/actions'
import { db } from '../db/db'
import { addLabPayments, clearLab, setLabEntries, setLabNote, setLabNoteRange, setLabNoteSpan } from '../db/lab'
import type { CellValue } from '../domain/budget'
import { buildTree, categoryPath, descendantIds, flattenTree } from '../domain/categories'
import {
  clear,
  copy,
  fillDown,
  fillRight,
  fillTarget,
  fillTo,
  fromTsv,
  inRect,
  moveTo,
  paste,
  rectOf,
  rectSize,
  toTsv,
  type CellWrite,
  type Pos,
  type Rect,
} from '../domain/grid'
import {
  balanceTone,
  combineEntries,
  LAB_TITLE,
  labEntryId,
  labPeriods,
  labRunning,
  noteCells,
  weekStartOf,
  type LabColumns,
  type LabEntry,
  type LabNote,
  type LabPeriod,
  type LabWeek,
} from '../domain/lab'
import { evalAmount, isSum } from '../domain/money'
import { effectiveMonth } from '../domain/periods'
import { monthlyPayments, type Expected } from '../domain/recurring'
import { trackedTotals } from '../domain/transactions'
import { BLOCKS, BLOCK_LABELS, type Category, type Settings } from '../domain/types'
import { dayLabel, monthLabel, todayIso } from './tracking/format'

const number = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (cents: number) => (cents === 0 ? '–' : number.format(cents / 100))
const plain = (cents: number) => (cents / 100).toFixed(2).replace(/\.00$/, '')
type Run = (action: () => Promise<unknown>) => Promise<boolean>
type Value = { cents: number; formula?: string }

/** Weeks one column covers, for the "Showing N weeks" stepper. */
const WEEKS_PER_COLUMN: Record<LabColumns, number> = { split: 0.5, week: 1, fortnight: 2 }

/**
 * A pretend week-by-week budget, like a paper-trading account next to the real one. Each week
 * starts with what the week before left. Nothing here is counted anywhere else in Pulse.
 */
export default function LabPage() {
  const settings = useLiveQuery(() => getSettings(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const entries = useLiveQuery(() => db.labEntries.toArray(), [])
  const notes = useLiveQuery(() => db.labNotes.toArray(), [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [])
  const { error, run } = useErrorMessage()
  const [added, setAdded] = useState<number | null>(null)
  useEffect(() => {
    if (added === null) return
    const timer = setTimeout(() => setAdded(null), 5000)
    return () => clearTimeout(timer)
  }, [added])

  // The first visit starts at the current week and stays there, so amounts don't slide away as time goes by.
  useEffect(() => {
    if (settings && settings.labFirstWeek === null) void updateSettings({ labFirstWeek: weekStartOf(todayIso(), settings.labWeekStart) })
  }, [settings])

  if (!settings || !categories || !entries || !notes || !transactions) return null
  const firstWeek = weekStartOf(settings.labFirstWeek ?? todayIso(), settings.labWeekStart)
  const periods = labPeriods(firstWeek, settings.labWeeks, settings.labColumns)
  const weeks = periods.map((p) => p.start)
  const running = labRunning(entries, categories, weeks, settings.labStartCents)
  const shown = new Set(weeks)
  const hidden = entries.filter((e) => !shown.has(e.week)).length

  const firstMonth = effectiveMonth(firstWeek, false, settings)
  const trackedIncome = trackedTotals(transactions, firstMonth, settings).income
  const tone = (cents: number) => balanceTone(cents, settings.labLow, settings.labHigh)
  const toneClass = (cents: number) => ({ low: ' tone-low', high: ' tone-high', null: '' })[String(tone(cents))]
  const last = running[running.length - 1]
  const today = todayIso()
  const usual = monthlyPayments(transactions, today.slice(0, 7), settings)
  const perColumn = WEEKS_PER_COLUMN[settings.labColumns]
  const step = settings.labColumns === 'split' ? 2 : 1
  const weeksShown = settings.labWeeks * perColumn

  return (
    <section className="page lab-page">
      <div className="page-head">
        <h1>
          {LAB_TITLE}{' '}
          <Info>
            Try out a tight budget week by week with pretend money. Nothing here is a real transaction, and nothing here
            counts in the planner, tracking or dashboard. Each week starts with what the week before left. It works like
            the planner: click a cell and type an amount or a sum like 350+300, double-click to change it, drag or
            Shift-click to select several, copy and paste, and drag the small square at a selection's corner to repeat
            it to the right or down. To move cells, drag a selected cell to its new place (hold Ctrl to copy instead);
            dropped on a filled cell, the two are added up. A note can stretch over several weeks: drag the small square
            at its left or right edge. Choose the columns, the day weeks start on and the red and green lines in Settings
            → Plug-ins.
          </Info>
        </h1>
        <div className="head-tools">
          <div className="week-stepper" role="group" aria-label="Weeks shown">
            <button
              type="button"
              className="icon-button"
              title={step === 2 ? 'Show one week less' : 'Show one column less'}
              aria-label="Show less"
              disabled={settings.labWeeks <= step}
              onClick={() => void updateSettings({ labWeeks: settings.labWeeks - step })}
            >
              <MinusIcon />
            </button>
            <span className="small">
              {weeksShown} {weeksShown === 1 ? 'week' : 'weeks'}
            </span>
            <button
              type="button"
              className="icon-button"
              title={step === 2 ? 'Show one more week' : 'Show one more column'}
              aria-label="Show more"
              onClick={() => void updateSettings({ labWeeks: settings.labWeeks + step })}
            >
              <PlusIcon />
            </button>
          </div>
          <div className="toolbox" role="toolbar" aria-label="Tools">
            <UsualPayments
              payments={usual}
              categories={categories}
              onAdd={(picked) => run(async () => setAdded(await addLabPayments(picked, periods)))}
            />
            <ConfirmButton
              className="tool"
              label={<TrashIcon />}
              title={`Start over: empty every pretend amount and note of the ${LAB_TITLE.toLowerCase()}`}
              confirmLabel="Sure? Click again"
              onConfirm={() => void run(() => clearLab())}
            />
          </div>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {added !== null && (
        <p className="notice small" role="status">
          {added === 0 ? 'None of these fall in the columns shown.' : `Added ${added} pretend ${added === 1 ? 'amount' : 'amounts'}.`}
        </p>
      )}
      {hidden > 0 && (
        <p className="muted small">
          {hidden} pretend {hidden === 1 ? 'amount is' : 'amounts are'} in weeks not shown. Show more weeks with the + above the
          table, or change the first week in Settings → Plug-ins.
        </p>
      )}

      <div className="grid-scroll">
        <LabGrid
          categories={categories}
          periods={periods}
          entries={entries}
          running={running}
          run={run}
          head={
            <>
              <tr className="week-head">
                <th scope="col" className="row-label">
                  Week
                  {/* Same two lines as the week columns, so "Week" sits on the dates' line. */}
                  <span className="week-range" />
                </th>
                {periods.map((p, i) => (
                  <th key={p.start} scope="col" className="num" data-week-col={i}>
                    {dayLabel(p.start)}
                    <span className="week-range">{rangeLabel(p, settings.labColumns)}</span>
                  </th>
                ))}
                <th scope="col" className="num">
                  Total
                  <span className="week-range" />
                </th>
              </tr>
              <NotesRow weeks={weeks} notes={notes} run={run} />
              <tr className="balance-row">
                <th scope="row" className="row-label">
                  Start of week
                </th>
                {running.map((w, i) =>
                  i === 0 ? (
                    <td key={w.week} className={`num start-cell${toneClass(w.start)}`}>
                      <button
                        type="button"
                        className="icon-button copy-income"
                        disabled={trackedIncome === 0}
                        title={
                          trackedIncome === 0
                            ? `Nothing is tracked as income in ${monthLabel(firstMonth)} yet, so there's nothing to bring in.`
                            : `Bring in the income tracked in ${monthLabel(firstMonth)}: ${number.format(trackedIncome / 100)}`
                        }
                        aria-label={`Start with the income tracked in ${monthLabel(firstMonth)}`}
                        onClick={() => void updateSettings({ labStartCents: trackedIncome })}
                      >
                        <ArrowInIcon />
                      </button>
                      <StartAmount
                        label={`Money at the start of the week of ${dayLabel(w.week)}`}
                        cents={settings.labStartCents}
                        onSave={(cents) => run(() => updateSettings({ labStartCents: cents }))}
                      />
                    </td>
                  ) : (
                    <td key={w.week} className={`num balance${toneClass(w.start)}`} title={toneTitle(tone(w.start), settings)}>
                      {number.format(w.start / 100)}
                    </td>
                  ),
                )}
                <td />
              </tr>
            </>
          }
          foot={
            <tfoot>
              <tr className="balance-row">
                <th scope="row" className="row-label">
                  Left at the end
                </th>
                {running.map((w) => (
                  <td key={w.week} className={`num balance${toneClass(w.end)}`} title={toneTitle(tone(w.end), settings)}>
                    {number.format(w.end / 100)}
                  </td>
                ))}
                <td className={`num balance strong${last ? toneClass(last.end) : ''}`}>{last && number.format(last.end / 100)}</td>
              </tr>
              <tr className="saved-row">
                <th scope="row" className="row-label">
                  Saved so far
                </th>
                {running.map((w) => (
                  <td key={w.week} className="num">
                    {fmt(w.saved)}
                  </td>
                ))}
                <td className="num strong">{last && fmt(last.saved)}</td>
              </tr>
            </tfoot>
          }
        />
      </div>
    </section>
  )
}

/** Under a column's first day: "weekend", "to 18 Oct", or nothing. */
function rangeLabel(p: LabPeriod, columns: LabColumns): string {
  if (columns === 'split') return p.days === 2 ? 'weekend' : ''
  if (columns === 'fortnight') {
    const [y, m, d] = p.start.split('-').map(Number) as [number, number, number]
    const end = new Date(y, m - 1, d + p.days - 1)
    return `to ${end.toLocaleString(undefined, { day: 'numeric', month: 'short' })}`
  }
  return ''
}

function toneTitle(tone: 'low' | 'high' | null, settings: Settings): string | undefined {
  if (tone === 'low') return `Below ${number.format(settings.labLow / 100)} (the red line in Settings → Plug-ins)`
  if (tone === 'high') return `Above ${number.format(settings.labHigh / 100)} (the green line in Settings → Plug-ins)`
  return undefined
}

const toCell = (e: Pick<LabEntry, 'cents' | 'formula'>): CellValue => ({ kind: 'fixed', cents: e.cents, ...(e.formula ? { formula: e.formula } : {}) })
const fromCell = (v: CellValue | null): Value | null =>
  v === null || v.kind !== 'fixed' ? null : { cents: v.cents, ...(v.formula ? { formula: v.formula } : {}) }

/**
 * The pretend amounts, as a grid that works like the planner's: select with a click, a drag or
 * Shift; copy, paste, Delete; drag the corner square to repeat a pattern; drag a selected cell
 * to move the selection.
 */
function LabGrid({
  categories,
  periods,
  entries,
  running,
  run,
  head,
  foot,
}: {
  categories: Category[]
  periods: LabPeriod[]
  entries: LabEntry[]
  running: LabWeek[]
  run: Run
  head: ReactNode
  foot: ReactNode
}) {
  const [anchor, setAnchor] = useState<Pos | null>(null)
  const [focus, setFocus] = useState<Pos | null>(null)
  const dragging = useRef(false)
  const [fill, setFill] = useState<{ source: Rect; target: Rect } | null>(null)
  const [move, setMove] = useState<{ source: Rect; from: Pos; to: Pos } | null>(null)
  const finish = useRef<(copyOnly: boolean) => void>(() => {})

  useEffect(() => {
    const stop = (e: MouseEvent) => {
      dragging.current = false
      finish.current(e.ctrlKey || e.metaKey || e.altKey)
    }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [])

  const weeks = periods.map((p) => p.start)
  const entryMap = new Map(entries.map((e) => [e.id, e]))
  const editRows = BLOCKS.flatMap((block) =>
    flattenTree(buildTree(categories, block))
      .filter((n) => n.children.length === 0)
      .map((n) => n.category),
  )
  const rowIndex = new Map(editRows.map((c, i) => [c.id, i]))
  const size = { rows: editRows.length, cols: weeks.length }
  const rect = anchor && focus ? rectOf(anchor, focus) : null
  const multi = rect !== null && rectSize(rect) > 1

  const valueAt = (p: Pos): CellValue | null => {
    const e = entryMap.get(labEntryId(editRows[p.row]!.id, weeks[p.col]!))
    return e ? toCell(e) : null
  }
  const apply = (writes: CellWrite[]) =>
    run(() =>
      setLabEntries(
        writes.flatMap((w) => {
          const category = editRows[w.row]
          const week = weeks[w.col]
          if (!category || !week || (w.value !== null && w.value.kind !== 'fixed')) return []
          return [{ categoryId: category.id, week, value: fromCell(w.value) }]
        }),
      ),
    )
  const select = (p: Pos, extend: boolean) => {
    if (!extend || !anchor) setAnchor(p)
    setFocus(p)
  }
  const focusCell = (p: Pos) => document.querySelector<HTMLInputElement>(`.lab [data-cell="${p.row}-${p.col}"] input`)?.focus()
  const isEditing = (el: EventTarget) => el instanceof HTMLInputElement && !el.readOnly
  const posOf = (el: EventTarget): Pos | null => {
    const key = (el as HTMLElement).closest?.('[data-cell]')?.getAttribute('data-cell')
    if (!key) return null
    const [row, col] = key.split('-').map(Number) as [number, number]
    return { row, col }
  }

  finish.current = (copyOnly: boolean) => {
    if (fill) {
      setFill(null)
      const writes = fillTo(fill.source, fill.target, valueAt)
      if (writes.length === 0) return
      setAnchor({ row: fill.target.top, col: fill.target.left })
      setFocus({ row: fill.target.bottom, col: fill.target.right })
      void apply(writes)
    }
    if (move) {
      setMove(null)
      const dr = move.to.row - move.from.row
      const dc = move.to.col - move.from.col
      // A click without dragging just selects that one cell.
      if (dr === 0 && dc === 0) {
        select(move.from, false)
        return
      }
      const writes = moveTo(move.source, dr, dc, valueAt, size, copyOnly, (a, b) => toCell(combineEntries(fromCell(a)!, fromCell(b)!)))
      if (writes.length === 0) return
      setAnchor({ row: move.source.top + dr, col: move.source.left + dc })
      setFocus({ row: move.source.bottom + dr, col: move.source.right + dc })
      void apply(writes)
    }
  }
  const moveRect = move ? shiftRect(move.source, move.to.row - move.from.row, move.to.col - move.from.col) : null

  const onKeyDown = (e: KeyboardEvent) => {
    const here = posOf(e.target)
    if (!here) return
    const mod = e.ctrlKey || e.metaKey
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    const step = moves[e.key]
    const clamp = (p: Pos) => ({ row: Math.min(size.rows - 1, Math.max(0, p.row)), col: Math.min(size.cols - 1, Math.max(0, p.col)) })
    if (step && e.shiftKey) {
      e.preventDefault()
      const from = focus ?? here
      if (!anchor) setAnchor(here)
      setFocus(clamp({ row: from.row + step[0], col: from.col + step[1] }))
      return
    }
    const editing = isEditing(e.target)
    if (step && !mod && (!editing || step[0] !== 0)) {
      e.preventDefault()
      focusCell(clamp({ row: here.row + step[0], col: here.col + step[1] }))
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      if (here.row + 1 < size.rows) requestAnimationFrame(() => focusCell({ row: here.row + 1, col: here.col }))
      return
    }
    if (editing) return
    const r = rect ?? rectOf(here, here)
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      void apply(clear(multi ? r : rectOf(here, here)))
    } else if (multi && mod && e.key.toLowerCase() === 'r') {
      e.preventDefault()
      void apply(fillRight(r, valueAt))
    } else if (multi && mod && e.key.toLowerCase() === 'd') {
      e.preventDefault()
      void apply(fillDown(r, valueAt))
    } else if (e.key === 'Escape') {
      setAnchor(here)
      setFocus(here)
    }
  }
  const onCopy = (e: ClipboardEvent, cut = false) => {
    const here = posOf(e.target)
    if (!here || isEditing(e.target)) return
    e.preventDefault()
    const r = rect ?? rectOf(here, here)
    e.clipboardData.setData('text/plain', toTsv(copy(r, valueAt)))
    if (cut) void apply(clear(r))
  }
  const onPaste = (e: ClipboardEvent) => {
    const here = posOf(e.target)
    if (!here || isEditing(e.target)) return
    e.preventDefault()
    const matrix = fromTsv(e.clipboardData.getData('text'))
    if (!matrix || matrix.some((line) => line.some((v) => v !== null && v.kind !== 'fixed'))) {
      void run(async () => {
        throw new Error('Only amounts and sums can be pasted here.')
      })
      return
    }
    ;(e.target as HTMLInputElement).blur()
    void apply(paste(rect ?? rectOf(here, here), matrix, size))
  }

  const handleAt = fill || move ? null : rect ? { row: rect.bottom, col: rect.right } : anchor

  return (
    <table
      className={`planner lab${move ? ' moving' : ''}`}
      onKeyDown={onKeyDown}
      onCopy={(e) => onCopy(e)}
      onCut={(e) => onCopy(e, true)}
      onPaste={onPaste}
      onDragStart={(e) => e.preventDefault()}
      onMouseDown={(e) => {
        const p = posOf(e.target)
        if (!p || e.button !== 0) return
        if ((e.target as HTMLElement).classList.contains('fill-handle')) {
          e.preventDefault()
          const source = rect ?? rectOf(p, p)
          setFill({ source, target: source })
          return
        }
        if (isEditing(e.target)) return
        e.preventDefault()
        if (e.shiftKey && anchor) {
          select(p, true)
          return
        }
        // Pressing on what is already selected grabs it, to move it; anywhere else starts a new selection.
        const current = rect ?? (anchor ? rectOf(anchor, anchor) : null)
        if (current && inRect(current, p) && valueAt(p) !== null) {
          setMove({ source: current, from: p, to: p })
          focusCell(p)
          return
        }
        focusCell(p)
        select(p, false)
        dragging.current = true
      }}
      onMouseOver={(e) => {
        const p = posOf(e.target)
        if (!p) return
        if (fill) setFill({ ...fill, target: fillTarget(fill.source, p) })
        else if (move) setMove({ ...move, to: p })
        else if (dragging.current) setFocus(p)
      }}
      onFocus={(e) => {
        const p = posOf(e.target)
        if (p && !dragging.current && !multi && !move) select(p, false)
      }}
    >
      <thead>{head}</thead>
      {BLOCKS.map((block) => {
        const rows = flattenTree(buildTree(categories, block))
        const total = (w: LabWeek) => w[block]
        return (
          <tbody key={block} className={`block-${block}`}>
            <tr className="block-head">
              <th scope="col">{BLOCK_LABELS[block]}</th>
              {weeks.map((w) => (
                <th key={w} aria-hidden="true" />
              ))}
              <th />
            </tr>
            {rows.length === 0 && (
              <tr>
                <td className="row-label muted" colSpan={weeks.length + 2}>
                  No {BLOCK_LABELS[block].toLowerCase()} categories yet. Add them in Settings → Categories.
                </td>
              </tr>
            )}
            {rows.map(({ category, depth, children }) => {
              const isParent = children.length > 0
              const ids = isParent ? descendantIds(categories, category.id) : new Set([category.id])
              const sumOf = (week?: string) =>
                entries.reduce((s, e) => (ids.has(e.categoryId) && (week === undefined ? weeks.includes(e.week) : e.week === week) ? s + e.cents : s), 0)
              const row = rowIndex.get(category.id)
              return (
                <tr key={category.id} className={isParent ? 'parent' : undefined}>
                  <th scope="row" className="row-label" style={{ paddingLeft: `${0.6 + depth * 1}rem` }}>
                    <span>{category.name}</span>
                  </th>
                  {weeks.map((week, col) => {
                    if (isParent || row === undefined) {
                      return (
                        <td key={week} className="num">
                          {fmt(sumOf(week))}
                        </td>
                      )
                    }
                    const p = { row, col }
                    const classes = ['num', 'input-cell']
                    if (multi && rect && inRect(rect, p)) classes.push('selected')
                    if (anchor && anchor.row === row && anchor.col === col) classes.push('picked')
                    if (fill && inRect(fill.target, p)) classes.push('fill-preview')
                    if (moveRect && inRect(moveRect, p)) classes.push('move-preview')
                    const entry = entryMap.get(labEntryId(category.id, week))
                    return (
                      <td key={week} data-cell={`${row}-${col}`} className={classes.join(' ')}>
                        {handleAt?.row === row && handleAt.col === col && (
                          <span className="fill-handle" title="Drag to repeat these cells to the right or down" aria-hidden="true" />
                        )}
                        <LabCellInput
                          label={`${category.name}, ${dayLabel(week)}`}
                          value={entry ?? null}
                          onSave={(v) => apply([{ row, col, value: v ? toCell(v) : null }])}
                        />
                      </td>
                    )
                  })}
                  <td className="num strong">{fmt(sumOf())}</td>
                </tr>
              )
            })}
            <tr className="total">
              <th scope="row" className="row-label">
                Total {BLOCK_LABELS[block].toLowerCase()}
              </th>
              {running.map((w) => (
                <td key={w.week} className="num">
                  {fmt(total(w))}
                </td>
              ))}
              <td className="num">{fmt(running.reduce((s, w) => s + total(w), 0))}</td>
            </tr>
          </tbody>
        )
      })}
      {foot}
    </table>
  )
}

function shiftRect(r: Rect, dr: number, dc: number): Rect {
  return { top: r.top + dr, bottom: r.bottom + dr, left: r.left + dc, right: r.right + dc }
}

/** Reads what was typed: an amount or a sum like 350+300, kept as typed. undefined when it can't be read. */
function readAmount(text: string): Value | null | undefined {
  const s = text.trim()
  if (s === '') return null
  const cents = evalAmount(s)
  if (cents === null) return undefined
  return isSum(s) ? { cents, formula: s.replace(/^=/, '').replace(/\s+/g, '') } : { cents }
}
const asText = (v: Value | null) => (v ? (v.formula ?? plain(v.cents)) : '')

/** One cell, like the planner's: selected on click, edited on a double-click, F2 or typing. */
function LabCellInput({ label, value, onSave }: { label: string; value: Value | null; onSave: (value: Value | null) => unknown }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const editing = draft !== null
  const stored = asText(value)
  useEffect(() => {
    setDraft((d) => (d === null ? d : stored))
    setInvalid(false)
  }, [stored])

  const commit = () => {
    if (draft === null) return
    const next = readAmount(draft)
    if (next === undefined) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setDraft(null)
    if (asText(next) !== stored) void onSave(next)
  }
  return (
    <input
      aria-label={label}
      className={invalid ? 'invalid' : value?.formula ? 'formula' : value && value.cents < 0 ? 'neg' : undefined}
      title={invalid ? 'Type an amount like 45.50 or a sum like 350+300' : !editing && value?.formula ? `${value.formula} = ${number.format(value.cents / 100)}` : undefined}
      value={editing ? draft : value ? number.format(value.cents / 100) : ''}
      readOnly={!editing}
      inputMode="decimal"
      onDoubleClick={(e) => {
        if (editing) return
        setDraft(stored)
        const input = e.currentTarget
        requestAnimationFrame(() => input.select())
      }}
      onChange={(e) => (setDraft(e.target.value), setInvalid(false))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (!editing) {
          if (e.key === 'F2') {
            e.preventDefault()
            setDraft(stored)
          } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault()
            setDraft(e.key)
          }
          return
        }
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(null)
          setInvalid(false)
        }
      }}
    />
  )
}

/** The money at the start: an amount (or a sum) typed straight into the first cell. */
function StartAmount({ label, cents, onSave }: { label: string; cents: number; onSave: (cents: number) => unknown }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const cancelled = useRef(false)
  return (
    <input
      className={`start-input${invalid ? ' invalid' : ''}`}
      aria-label={label}
      inputMode="decimal"
      title={invalid ? 'Type an amount like 650 or a sum like 600+50' : 'Money in the account on the first day'}
      value={draft ?? number.format(cents / 100)}
      onFocus={(e) => (setDraft(plain(cents)), requestAnimationFrame(() => e.target.select()))}
      onChange={(e) => (setDraft(e.target.value), setInvalid(false))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          cancelled.current = true
          e.currentTarget.blur()
        }
      }}
      onBlur={() => {
        if (cancelled.current || draft === null) {
          cancelled.current = false
          setDraft(null)
          setInvalid(false)
          return
        }
        const next = readAmount(draft)
        if (next === undefined) return setInvalid(true)
        setDraft(null)
        if ((next?.cents ?? 0) !== cents) void onSave(next?.cents ?? 0)
      }}
    />
  )
}

/**
 * Notes under the week dates, e.g. "Paris trip". A note can stretch over the next weeks by
 * dragging the square at its right edge; the cells it covers merge into one.
 */
function NotesRow({ weeks, notes, run }: { weeks: string[]; notes: LabNote[]; run: Run }) {
  // While an edge or the whole note is dragged: the note being changed, what is dragged, and
  // the weeks it covers so far. `grab` is how many weeks into the note it was picked up.
  const [stretch, setStretch] = useState<{
    week: string
    edge: 'left' | 'right' | 'move'
    first: number
    last: number
    grab: number
    moved: boolean
  } | null>(null)
  const latest = useRef(stretch)
  latest.current = stretch
  const shown = stretch
    ? [
        ...notes.filter((n) => n.week !== stretch.week),
        { ...notes.find((n) => n.week === stretch.week)!, week: weeks[stretch.first]!, span: stretch.last - stretch.first + 1 },
      ]
    : notes
  const cells = noteCells(weeks, shown)

  const row = useRef<HTMLTableRowElement>(null)
  const stretching = stretch !== null
  useEffect(() => {
    if (!stretching) return
    // The week column under the pointer decides where the dragged edge goes, either way.
    const onMove = (e: PointerEvent) => {
      const s = latest.current
      if (!s) return
      const cols = [...(row.current?.closest('table')?.querySelectorAll<HTMLElement>('th[data-week-col]') ?? [])]
      const rects = cols.map((c) => c.getBoundingClientRect())
      // Past the first or last column counts as that column.
      let index = rects.findIndex((r) => e.clientX >= r.left && e.clientX < r.right)
      if (index < 0 && rects.length > 0) index = e.clientX < rects[0]!.left ? 0 : e.clientX >= rects[rects.length - 1]!.right ? rects.length - 1 : -1
      if (index < 0) return
      let next = s
      if (s.edge === 'right') next = { ...s, last: Math.max(s.first, index) }
      else if (s.edge === 'left') next = { ...s, first: Math.min(s.last, index) }
      else {
        // The whole note follows the pointer, keeping its length, and stays inside the table.
        const length = s.last - s.first
        const first = Math.max(0, Math.min(weeks.length - 1 - length, index - s.grab))
        next = { ...s, first, last: first + length }
      }
      if (next.first !== s.first || next.last !== s.last) setStretch({ ...next, moved: true })
    }
    const onUp = () => {
      const s = latest.current
      setStretch(null)
      if (!s) return
      if (s.moved) void run(() => setLabNoteRange(s.week, weeks[s.first]!, s.last - s.first + 1, weeks))
      // A click that didn't move anything opens the note for typing.
      else if (s.edge === 'move') row.current?.querySelector<HTMLInputElement>(`input[data-note="${s.week}"]`)?.focus()
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
    }
  }, [stretching, weeks, run])

  const handle = (c: (typeof cells)[number], edge: 'left' | 'right') => (
    <span
      className={`note-handle ${edge}`}
      title={edge === 'right' ? 'Drag to stretch this note to later weeks, or back' : 'Drag to stretch this note to earlier weeks, or back'}
      aria-hidden="true"
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.releasePointerCapture?.(e.pointerId)
        setStretch({ week: c.week, edge, first: c.index, last: c.index + c.span - 1, grab: 0, moved: false })
      }}
    />
  )

  return (
    <tr ref={row} className={`notes-row${stretch?.edge === 'move' ? (stretch.moved ? ' moving-note' : '') : stretching ? ' stretching' : ''}`}>
      <th scope="row" className="row-label">
        <span className="muted">Notes</span>
      </th>
      {cells.map((c) => (
        <td
          key={c.week}
          colSpan={c.span}
          className={`note-cell${c.span > 1 ? ' merged' : ''}${c.note ? ' has-note' : ''}${stretch?.edge === 'move' && stretch.moved && weeks[stretch.first] === c.week ? ' moving' : ''}`}
          onPointerDown={(e) => {
            // Dragging a note moves it to other weeks; a plain click still types in it.
            const input = e.target as HTMLElement
            if (!c.note || e.button !== 0 || !(input instanceof HTMLInputElement) || document.activeElement === input) return
            e.preventDefault()
            const cols = [...(row.current?.closest('table')?.querySelectorAll<HTMLElement>('th[data-week-col]') ?? [])]
            const at = cols.findIndex((col) => {
              const r = col.getBoundingClientRect()
              return e.clientX >= r.left && e.clientX < r.right
            })
            const grab = at < 0 ? 0 : Math.max(0, Math.min(c.span - 1, at - c.index))
            setStretch({ week: c.week, edge: 'move', first: c.index, last: c.index + c.span - 1, grab, moved: false })
          }}
        >
          <NoteInput week={c.week} text={c.note?.text ?? ''} run={run} />
          {c.note && handle(c, 'left')}
          {c.note && handle(c, 'right')}
          {c.note && (
            <span className="sr-only">
              <button type="button" onClick={() => void run(() => setLabNoteSpan(c.week, c.span + 1, weeks))}>
                Stretch the note over one more week
              </button>
              {c.span > 1 && (
                <button type="button" onClick={() => void run(() => setLabNoteSpan(c.week, c.span - 1, weeks))}>
                  Make the note one week shorter
                </button>
              )}
              {c.index > 0 && (
                <button type="button" onClick={() => void run(() => setLabNoteRange(c.week, weeks[c.index - 1]!, c.span + 1, weeks))}>
                  Stretch the note over the week before
                </button>
              )}
              {c.index > 0 && (
                <button type="button" onClick={() => void run(() => setLabNoteRange(c.week, weeks[c.index - 1]!, c.span, weeks))}>
                  Move the note one week earlier
                </button>
              )}
              {c.index + c.span < weeks.length && (
                <button type="button" onClick={() => void run(() => setLabNoteRange(c.week, weeks[c.index + 1]!, c.span, weeks))}>
                  Move the note one week later
                </button>
              )}
            </span>
          )}
        </td>
      ))}
      <td />
    </tr>
  )
}

/** A note's text box. */
function NoteInput({ week, text, run }: { week: string; text: string; run: Run }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      className="week-note"
      data-note={week}
      placeholder="note"
      title={text ? 'Drag to move this note to other weeks, or click to change it' : undefined}
      aria-label={`Note for the week of ${dayLabel(week)}`}
      value={draft ?? text}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      onBlur={() => {
        if (draft !== null && draft !== text) void run(() => setLabNote(week, draft))
        setDraft(null)
      }}
    />
  )
}

type Payment = Expected & { seenIn: boolean }
const dayOf = (p: Payment) => Number(p.date.slice(8))

/**
 * A toolbox button with the payments Pulse has learnt come every month (rent, the gym, the
 * salary). The ticked ones go into the weeks that hold their usual day of the month.
 */
function UsualPayments({
  payments,
  categories,
  onAdd,
}: {
  payments: Payment[]
  categories: Category[]
  onAdd: (picked: Array<{ categoryId: string; cents: number; day: number }>) => Promise<unknown>
}) {
  const [off, setOff] = useState<Set<string>>(new Set())
  const known = new Set(categories.map((c) => c.id))
  const list = payments.filter((p) => known.has(p.categoryId)).sort((a, b) => dayOf(a) - dayOf(b) || b.cents - a.cents)
  return (
    <Menu
      label="Add the usual monthly payments"
      title="Add the usual monthly payments: rent, the gym, insurance, your salary… learnt from Tracking, into the weeks they fall in"
      icon={<ImportIcon />}
      buttonClass="tool"
      panelClass="popover expected usual"
    >
      {(close) =>
        list.length === 0 ? (
          <p className="muted small">
            Nothing learnt yet. Payments that come once a month with about the same amount show up here after two
            months of tracking.
          </p>
        ) : (
          <>
            <h3>
              Usual monthly payments{' '}
              <Info>
                Payments that came once in each of the last two months in Tracking, with about the same amount. Each ticked
                one goes into every week that holds its usual day of the month, added to what is already there. They
                stay pretend: nothing is added to Tracking.
              </Info>
            </h3>
            <ul>
              {list.map((p) => (
                <li key={p.key} className={`block-${p.block}`}>
                  <label className="usual-pick">
                    <input
                      type="checkbox"
                      checked={!off.has(p.key)}
                      onChange={(e) => {
                        const next = new Set(off)
                        if (e.target.checked) next.delete(p.key)
                        else next.add(p.key)
                        setOff(next)
                      }}
                    />
                    <span className="date">day {dayOf(p)}</span>
                    <span className="expected-what">
                      {p.details || categoryPath(categories, p.categoryId)}
                      {p.details && <span className="muted small"> · {categoryPath(categories, p.categoryId)}</span>}
                    </span>
                    <span className="amount">{number.format(p.cents / 100)}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="usual-buttons">
              <button
                type="button"
                className="primary"
                disabled={list.every((p) => off.has(p.key))}
                onClick={() => {
                  close()
                  void onAdd(list.filter((p) => !off.has(p.key)).map((p) => ({ categoryId: p.categoryId, cents: p.cents, day: dayOf(p) })))
                }}
              >
                Add to the playground
              </button>
            </div>
          </>
        )
      }
    </Menu>
  )
}
