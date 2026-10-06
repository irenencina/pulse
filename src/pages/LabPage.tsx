import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import ConfirmButton from '../components/ConfirmButton'
import Info from '../components/Info'
import { CopyInIcon, ImportIcon, MinusIcon, PlusIcon, TrashIcon } from '../components/icons'
import Menu from '../components/Menu'
import { useErrorMessage } from '../components/useErrorMessage'
import { getSettings, updateSettings } from '../db/actions'
import { db } from '../db/db'
import { addLabPayments, clearLab, moveLabEntry, setLabEntry, setLabNote, setLabNoteRange, setLabNoteSpan } from '../db/lab'
import { buildTree, categoryPath, descendantIds, flattenTree } from '../domain/categories'
import { addDays, balanceTone, LAB_TITLE, labEntryId, labPeriods, labRunning, noteCells, type LabColumns, type LabPeriod, weekStartOf, type LabEntry, type LabNote, type LabWeek } from '../domain/lab'
import { monthlyPayments, type Expected } from '../domain/recurring'
import { evalAmount, isSum } from '../domain/money'
import { effectiveMonth } from '../domain/periods'
import { trackedTotals } from '../domain/transactions'
import { BLOCKS, BLOCK_LABELS, type Block, type Category, type Settings } from '../domain/types'
import { dayLabel, monthLabel, todayIso } from './tracking/format'

const number = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (cents: number) => (cents === 0 ? '–' : number.format(cents / 100))
const plain = (cents: number) => (cents / 100).toFixed(2).replace(/\.00$/, '')
const DRAG_TYPE = 'application/x-pulse-lab'
type Run = (action: () => Promise<unknown>) => Promise<boolean>

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
  const entryMap = new Map(entries.map((e) => [e.id, e]))
  const shown = new Set(weeks)
  const hidden = entries.filter((e) => !shown.has(e.week)).length

  const firstMonth = effectiveMonth(firstWeek, false, settings)
  const trackedIncome = trackedTotals(transactions, firstMonth, settings).income
  const tone = (cents: number) => balanceTone(cents, settings.labLow, settings.labHigh)
  const toneClass = (cents: number) => ({ low: ' tone-low', high: ' tone-high', null: '' })[String(tone(cents))]
  const last = running[running.length - 1]
  const today = todayIso()
  const usual = monthlyPayments(transactions, today.slice(0, 7), settings)

  return (
    <section className="page wide lab-page">
      <div className="page-head">
        <h1>
          {LAB_TITLE}{' '}
          <Info>
            Try out a tight budget week by week with pretend money. Nothing here is a real transaction, and nothing here
            counts in the planner, tracking or dashboard. Each week starts with what the week before left. Click a cell
            to type an amount or a sum like 350+300; Delete empties it. Drag a filled cell to another week or category
            to move it (hold Ctrl to copy); dropped on a filled cell, the two are added up. A note can stretch over
            several weeks: drag the small square at its left or right edge. Choose the day weeks start
            on and the red and green lines in Settings → Playground.
          </Info>
        </h1>
        <div className="head-tools">
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
          {hidden} pretend {hidden === 1 ? 'amount is' : 'amounts are'} in columns not shown. Show more columns with the + at the
          end of the table, or change the first week in Settings → Playground.
        </p>
      )}

      <div className="grid-scroll">
        <table className="planner lab">
          <thead>
            <tr className="week-head">
              <th scope="col" className="row-label">
                Week
              </th>
              {periods.map((p, i) => (
                <th key={p.start} scope="col" className="num" data-week-col={i}>
                  {dayLabel(p.start)}
                  <span className="week-range">{rangeLabel(p, settings.labColumns)}</span>
                </th>
              ))}
              <th scope="col" className="num">
                Total
              </th>
              <th scope="col" className="week-buttons">
                <button
                  type="button"
                  className="icon-button"
                  title="Show one column less"
                  aria-label="Show one column less"
                  disabled={settings.labWeeks <= 1}
                  onClick={() => void updateSettings({ labWeeks: settings.labWeeks - 1 })}
                >
                  <MinusIcon />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  title="Show four more columns"
                  aria-label="Show four more columns"
                  onClick={() => void updateSettings({ labWeeks: settings.labWeeks + 4 })}
                >
                  <PlusIcon />
                </button>
              </th>
            </tr>
            <NotesRow weeks={weeks} notes={notes} run={run} />
            <tr className="balance-row">
              <th scope="row" className="row-label">
                <span>Start of week</span>
                <button
                  type="button"
                  className="icon-button copy-income"
                  disabled={trackedIncome === 0}
                  title={
                    trackedIncome === 0
                      ? `Nothing is tracked as income in ${monthLabel(firstMonth)} yet, so there's nothing to copy.`
                      : `Start with the income tracked in ${monthLabel(firstMonth)}: ${number.format(trackedIncome / 100)}`
                  }
                  aria-label="Start with this month's tracked income"
                  onClick={() => void updateSettings({ labStartCents: trackedIncome })}
                >
                  <CopyInIcon />
                </button>
              </th>
              {running.map((w, i) =>
                i === 0 ? (
                  <td key={w.week} className={`num input-cell${toneClass(w.start)}`}>
                    <AmountCell
                      label={`Money at the start of the week of ${dayLabel(w.week)}`}
                      value={{ cents: settings.labStartCents }}
                      title={`Money in the account on ${dayLabel(w.week)}`}
                      onSave={(v) => run(() => updateSettings({ labStartCents: v?.cents ?? 0 }))}
                      showZero
                    />
                  </td>
                ) : (
                  <td key={w.week} className={`num balance${toneClass(w.start)}`} title={toneTitle(tone(w.start), settings)}>
                    {number.format(w.start / 100)}
                  </td>
                ),
              )}
              <td />
              <td />
            </tr>
          </thead>
          {BLOCKS.map((block) => (
            <BlockRows key={block} block={block} categories={categories} weeks={weeks} running={running} entries={entries} entryMap={entryMap} run={run} />
          ))}
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
              <td />
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
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

/** Under a column's first day: "Mon–Fri", "weekend" or "to 18 Oct". */
function rangeLabel(p: LabPeriod, columns: LabColumns): string {
  if (columns === 'split') return p.days === 2 ? 'weekend' : 'workweek'
  if (columns === 'fortnight') return `to ${dayLabel(addDays(p.start, p.days - 1))}`
  return ''
}

function toneTitle(tone: 'low' | 'high' | null, settings: Settings): string | undefined {
  if (tone === 'low') return `Below ${number.format(settings.labLow / 100)} (the red line in Settings → Playground)`
  if (tone === 'high') return `Above ${number.format(settings.labHigh / 100)} (the green line in Settings → Playground)`
  return undefined
}

function BlockRows({
  block,
  categories,
  weeks,
  running,
  entries,
  entryMap,
  run,
}: {
  block: Block
  categories: Category[]
  weeks: string[]
  running: LabWeek[]
  entries: LabEntry[]
  entryMap: Map<string, LabEntry>
  run: Run
}) {
  const rows = flattenTree(buildTree(categories, block))
  const [over, setOver] = useState<string | null>(null)
  const totalOf = (w: LabWeek) => w[block]
  const sumOf = (ids: Set<string>, week?: string) =>
    entries.reduce((s, e) => (ids.has(e.categoryId) && (week === undefined || e.week === week) && weeks.includes(e.week) ? s + e.cents : s), 0)

  const dropProps = (categoryId: string, week: string) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = e.ctrlKey || e.altKey || e.metaKey ? 'copy' : 'move'
      setOver(labEntryId(categoryId, week))
    },
    onDragLeave: () => setOver(null),
    onDrop: (e: DragEvent) => {
      const from = e.dataTransfer.getData(DRAG_TYPE)
      setOver(null)
      if (!from) return
      e.preventDefault()
      void run(() => moveLabEntry(from, { categoryId, week }, e.ctrlKey || e.altKey || e.metaKey))
    },
  })

  return (
    <tbody className={`block-${block}`}>
      <tr className="block-head">
        <th scope="col">{BLOCK_LABELS[block]}</th>
        {weeks.map((w) => (
          <th key={w} aria-hidden="true" />
        ))}
        <th />
        <th />
      </tr>
      {rows.length === 0 && (
        <tr>
          <td className="row-label muted" colSpan={weeks.length + 3}>
            No {BLOCK_LABELS[block].toLowerCase()} categories yet. Add them on the Categories page.
          </td>
        </tr>
      )}
      {rows.map(({ category, depth, children }) => {
        const isParent = children.length > 0
        const ids = isParent ? descendantIds(categories, category.id) : new Set([category.id])
        return (
          <tr key={category.id} className={isParent ? 'parent' : undefined}>
            <th scope="row" className="row-label" style={{ paddingLeft: `${0.6 + depth * 1}rem` }}>
              <span>{category.name}</span>
            </th>
            {weeks.map((week) => {
              const id = labEntryId(category.id, week)
              if (isParent) {
                return (
                  <td key={week} className="num">
                    {fmt(sumOf(ids, week))}
                  </td>
                )
              }
              const entry = entryMap.get(id)
              return (
                <td
                  key={week}
                  className={`num input-cell${over === id ? ' drop-target' : ''}`}
                  data-lab-cell={id}
                  {...dropProps(category.id, week)}
                >
                  <AmountCell
                    label={`${category.name}, week of ${dayLabel(week)}`}
                    value={entry ?? null}
                    dragId={entry ? id : undefined}
                    onSave={(v) => run(() => setLabEntry(category.id, week, v))}
                  />
                </td>
              )
            })}
            <td className="num strong">{fmt(sumOf(ids))}</td>
            <td />
          </tr>
        )
      })}
      <tr className="total">
        <th scope="row" className="row-label">
          Total {BLOCK_LABELS[block].toLowerCase()}
        </th>
        {running.map((w) => (
          <td key={w.week} className="num">
            {fmt(totalOf(w))}
          </td>
        ))}
        <td className="num">{fmt(running.reduce((s, w) => s + totalOf(w), 0))}</td>
        <td />
      </tr>
    </tbody>
  )
}

type Value = { cents: number; formula?: string }

/**
 * One amount: shows the number, and turns into a text box on click or when you start typing.
 * Takes sums like 350+300 and keeps them as typed. A filled cell can be dragged elsewhere.
 */
function AmountCell({
  label,
  value,
  onSave,
  dragId,
  title,
  showZero,
}: {
  label: string
  value: Value | null
  onSave: (value: Value | null) => Promise<boolean> | void
  dragId?: string
  title?: string
  showZero?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const asText = (v: Value | null) => (v ? (v.formula ?? plain(v.cents)) : '')

  const commit = (moveDown: boolean, from: HTMLElement) => {
    if (draft === null) return
    const text = draft.trim()
    const cents = text === '' ? null : evalAmount(text)
    if (text !== '' && cents === null) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setDraft(null)
    const next = cents === null ? null : { cents, ...(isSum(text) ? { formula: text.replace(/^=/, '').replace(/\s+/g, '') } : {}) }
    if (asText(next) !== asText(value)) void onSave(next)
    if (moveDown) focusBelow(from)
  }

  if (draft !== null) {
    return (
      <input
        autoFocus
        aria-label={label}
        className={invalid ? 'invalid' : undefined}
        title={invalid ? 'Type an amount like 45.50 or a sum like 350+300' : undefined}
        inputMode="decimal"
        value={draft}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => (setDraft(e.target.value), setInvalid(false))}
        onBlur={(e) => commit(false, e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit(true, e.currentTarget)
          }
          if (e.key === 'Escape') {
            setDraft(null)
            setInvalid(false)
          }
        }}
      />
    )
  }
  const cents = value?.cents ?? 0
  return (
    <button
      type="button"
      className={`amount-cell${value?.formula ? ' formula' : ''}${cents < 0 ? ' neg' : ''}`}
      aria-label={`${label}: ${value ? number.format(cents / 100) : 'empty'}`}
      title={value?.formula ? `${value.formula} = ${number.format(cents / 100)}` : title}
      draggable={!!dragId}
      onDragStart={(e) => {
        if (!dragId) return
        e.dataTransfer.setData(DRAG_TYPE, dragId)
        e.dataTransfer.effectAllowed = 'copyMove'
      }}
      onClick={() => setDraft(asText(value))}
      onKeyDown={(e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          if (value) void onSave(null)
        } else if (e.key === 'F2') {
          e.preventDefault()
          setDraft(asText(value))
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') {
          e.preventDefault()
          setDraft(e.key)
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault()
          moveFocus(e.currentTarget, e.key)
        }
      }}
    >
      {value || showZero ? number.format(cents / 100) : ''}
    </button>
  )
}

/** The cell's button `dr` rows down and `dc` columns across, in the whole table. */
function cellAt(from: HTMLElement, dr: number, dc: number): HTMLElement | null {
  const td = from.closest('td')
  const tr = td?.closest('tr')
  const table = tr?.closest('table')
  if (!td || !tr || !table) return null
  const rows = [...table.querySelectorAll('tr')]
  let r = rows.indexOf(tr) + dr
  const col = [...tr.children].indexOf(td) + dc
  // Skip rows without a cell to type in (block headings, totals, parents).
  while (r >= 0 && r < rows.length) {
    const target = rows[r]!.children[col]?.querySelector<HTMLElement>('button.amount-cell')
    if (target) return target
    if (dr === 0) return null
    r += dr
  }
  return null
}

function focusBelow(from: HTMLElement) {
  const td = from.closest('td')
  // Wait for the box to turn back into a button.
  requestAnimationFrame(() => {
    const start = td?.querySelector<HTMLElement>('button.amount-cell')
    if (start) cellAt(start, 1, 0)?.focus()
  })
}

function moveFocus(from: HTMLElement, key: string) {
  const [dr, dc] = key === 'ArrowDown' ? [1, 0] : key === 'ArrowUp' ? [-1, 0] : key === 'ArrowLeft' ? [0, -1] : [0, 1]
  cellAt(from, dr, dc)?.focus()
}

/**
 * Notes under the week dates, e.g. "Paris trip". A note can stretch over the next weeks by
 * dragging the square at its right edge; the cells it covers merge into one.
 */
function NotesRow({ weeks, notes, run }: { weeks: string[]; notes: LabNote[]; run: Run }) {
  // While an edge is dragged: the note being changed, which edge, and the weeks it covers so far.
  const [stretch, setStretch] = useState<{ week: string; edge: 'left' | 'right'; first: number; last: number } | null>(null)
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
      const next = s.edge === 'right' ? { ...s, last: Math.max(s.first, index) } : { ...s, first: Math.min(s.last, index) }
      if (next.first !== s.first || next.last !== s.last) setStretch(next)
    }
    const onUp = () => {
      const s = latest.current
      setStretch(null)
      if (s) void run(() => setLabNoteRange(s.week, weeks[s.first]!, s.last - s.first + 1, weeks))
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
        setStretch({ week: c.week, edge, first: c.index, last: c.index + c.span - 1 })
      }}
    />
  )

  return (
    <tr ref={row} className={stretching ? 'notes-row stretching' : 'notes-row'}>
      <th scope="row" className="row-label">
        <span className="muted">Notes</span>
      </th>
      {cells.map((c) => (
        <td key={c.week} colSpan={c.span} className={c.span > 1 ? 'note-cell merged' : 'note-cell'}>
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
            </span>
          )}
        </td>
      ))}
      <td />
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
      placeholder="note"
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
