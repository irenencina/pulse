import { effectiveMonth, type MonthRule } from './periods'
import type { Transaction } from './transactions'
import type { Block, Category } from './types'

/**
 * The Lab: a pretend week-by-week budget. Nothing here is a real transaction and nothing
 * here counts anywhere else in Pulse. Each week starts with what was left of the week before.
 */

/** The page's name, in one place while it's being decided. */
export const LAB_TITLE = 'Playground'

/** One pretend amount: a category in a week ("YYYY-MM-DD" of the week's first day). */
export interface LabEntry {
  id: string
  categoryId: string
  week: string
  /** Positive, like transactions: the block of the category says whether it comes in or goes out. */
  cents: number
  /** The sum as typed, e.g. "350+300", when it was one. */
  formula?: string
}

/** A short note for a week, e.g. "Paris trip", that can stretch over the next weeks. */
export interface LabNote {
  week: string
  text: string
  /** How many weeks it covers, this one included; 1 when left out. */
  span?: number
}

export const labEntryId = (categoryId: string, week: string) => `${categoryId}|${week}`

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

/** Today on this device, "YYYY-MM-DD". */
export const localToday = () => iso(new Date())

export function addDays(date: string, days: number): string {
  const d = parse(date)
  d.setDate(d.getDate() + days)
  return iso(d)
}

/** The first day of the week that holds `date`; weekStart 0 is Sunday, 1 Monday … 6 Saturday. */
export function weekStartOf(date: string, weekStart: number): string {
  const back = (parse(date).getDay() - weekStart + 7) % 7
  return addDays(date, -back)
}

export function labWeekList(firstWeek: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(firstWeek, i * 7))
}

export interface LabWeek {
  week: string
  /** Money at the start of the week: the starting amount, then whatever the week before left. */
  start: number
  income: number
  expenses: number
  savings: number
  /** start + income − expenses − savings */
  end: number
  /** Everything put into savings so far, this week included. */
  saved: number
}

export function labRunning(entries: LabEntry[], categories: Category[], weeks: string[], startCents: number): LabWeek[] {
  const blockOf = new Map(categories.map((c) => [c.id, c.block]))
  const byWeek = new Map<string, Record<Block, number>>()
  for (const e of entries) {
    const block = blockOf.get(e.categoryId)
    if (!block) continue
    const totals = byWeek.get(e.week) ?? { income: 0, expenses: 0, savings: 0 }
    totals[block] += e.cents
    byWeek.set(e.week, totals)
  }
  let start = startCents
  let saved = 0
  return weeks.map((week) => {
    const t = byWeek.get(week) ?? { income: 0, expenses: 0, savings: 0 }
    const end = start + t.income - t.expenses - t.savings
    saved += t.savings
    const row = { week, start, ...t, end, saved }
    start = end
    return row
  })
}

/** 'low' below the red line, 'high' above the green one, else null. */
export function balanceTone(cents: number, low: number, high: number): 'low' | 'high' | null {
  if (cents < low) return 'low'
  if (cents > high) return 'high'
  return null
}

/** What a cell holds after another one is dropped onto it: both added up, keeping the sum readable. */
export function combineEntries(target: Pick<LabEntry, 'cents' | 'formula'>, moved: Pick<LabEntry, 'cents' | 'formula'>): Pick<LabEntry, 'cents' | 'formula'> {
  const text = (e: Pick<LabEntry, 'cents' | 'formula'>) => e.formula ?? (e.cents / 100).toFixed(2).replace(/\.00$/, '')
  const right = text(moved)
  return { cents: target.cents + moved.cents, formula: `${text(target)}${right.startsWith('-') ? '' : '+'}${right}` }
}

/** The note row: one cell per note, as wide as the weeks it covers, and one per free week. */
export function noteCells(weeks: string[], notes: LabNote[]): Array<{ week: string; index: number; span: number; note: LabNote | null }> {
  const byWeek = new Map(notes.map((n) => [n.week, n]))
  const cells: Array<{ week: string; index: number; span: number; note: LabNote | null }> = []
  for (let i = 0; i < weeks.length; ) {
    const week = weeks[i]!
    const note = byWeek.get(week) ?? null
    const span = Math.max(1, Math.min(note?.span ?? 1, weeks.length - i))
    cells.push({ week, index: i, span, note })
    i += span
  }
  return cells
}


/** How the playground splits time into columns: workweek + weekend, one week, or two weeks. */
export type LabColumns = 'split' | 'week' | 'fortnight'

export const LAB_COLUMN_LABELS: Record<LabColumns, string> = {
  split: 'Workweek + weekend',
  week: '1 week',
  fortnight: '2 weeks',
}

/** One column: its first day and how many days it covers. */
export interface LabPeriod {
  start: string
  days: number
}

const dayDiff = (a: string, b: string) => Math.round((parse(a).getTime() - parse(b).getTime()) / 86_400_000)

/** `count` columns from `firstWeek` (the first day of a week). */
export function labPeriods(firstWeek: string, count: number, columns: LabColumns): LabPeriod[] {
  if (columns === 'week') return labWeekList(firstWeek, count).map((start) => ({ start, days: 7 }))
  if (columns === 'fortnight') return Array.from({ length: count }, (_, i) => ({ start: addDays(firstWeek, i * 14), days: 14 }))
  return Array.from({ length: count }, (_, i) => {
    const week = addDays(firstWeek, Math.floor(i / 2) * 7)
    return i % 2 === 0 ? { start: week, days: 5 } : { start: addDays(week, 5), days: 2 }
  })
}

/** How many days the column starting on `start` covers. */
export function periodDays(start: string, columns: LabColumns, weekStart: number): number {
  if (columns === 'week') return 7
  if (columns === 'fortnight') return 14
  return weekStartOf(start, weekStart) === start ? 5 : 2
}

/** The first day of the column that holds `date`. Two-week columns count from `firstWeek`. */
export function periodStartOf(date: string, columns: LabColumns, weekStart: number, firstWeek: string): string {
  const week = weekStartOf(date, weekStart)
  if (columns === 'week') return week
  if (columns === 'split') return dayDiff(date, week) >= 5 ? addDays(week, 5) : week
  const weeks = Math.round(dayDiff(week, weekStartOf(firstWeek, weekStart)) / 7)
  return ((weeks % 2) + 2) % 2 === 1 ? addDays(week, -7) : week
}

/** The columns that hold day `day` of a month (the month's last day when it is shorter), like the 1st for rent. */
export function periodsWithDay(periods: LabPeriod[], day: number): string[] {
  return periods
    .filter((p) =>
      Array.from({ length: p.days }, (_, i) => addDays(p.start, i)).some((date) => {
        const [y, m, d] = date.split('-').map(Number) as [number, number, number]
        return d === Math.min(day, new Date(y, m, 0).getDate())
      }),
    )
    .map((p) => p.start)
}

/**
 * The playground as transactions for the Dashboard's forecast. Columns that are over count
 * nothing (what really happened is tracked); the column of today counts what's left of each
 * pretend amount after what was really tracked in it; later columns count in full. Each one
 * counts for the month of its column's middle day (so the month that holds most of it), after
 * the late-income shift: a salary in the week of the 25th counts for the next month, like a real one.
 */
export function pretendTransactions(
  entries: LabEntry[],
  categories: Category[],
  real: Transaction[],
  layout: { columns: LabColumns; weekStart: number },
  today: string,
  settings: MonthRule,
): Transaction[] {
  const blockOf = new Map(categories.map((c) => [c.id, c.block]))
  const out: Transaction[] = []
  for (const e of entries) {
    const block = blockOf.get(e.categoryId)
    if (!block || e.cents <= 0) continue
    const days = periodDays(e.week, layout.columns, layout.weekStart)
    const end = addDays(e.week, days - 1)
    if (end < today) continue
    let cents = e.cents
    if (e.week <= today) {
      const spent = real.reduce((s, t) => (t.categoryId === e.categoryId && t.date >= e.week && t.date <= end ? s + t.cents : s), 0)
      cents = Math.max(0, cents - spent)
    }
    if (cents === 0) continue
    out.push({
      id: `playground:${e.id}`,
      date: e.week,
      month: effectiveMonth(addDays(e.week, Math.floor((days - 1) / 2)), block === 'income', settings),
      pretend: true,
      block,
      categoryId: e.categoryId,
      cents,
      details: 'Playground',
      tagIds: [],
      source: 'manual',
      createdAt: 0,
    })
  }
  return out
}
