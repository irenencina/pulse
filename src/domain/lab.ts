import type { Block, Category } from './types'

/**
 * The Lab: a pretend week-by-week budget. Nothing here is a real transaction and nothing
 * here counts anywhere else in Pulse. Each week starts with what was left of the week before.
 */

/** The page's name, in one place while it's being decided. */
export const LAB_TITLE = 'Stress test'

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

/** A short note for a week, e.g. "Paris trip". */
export interface LabNote {
  week: string
  text: string
}

export const labEntryId = (categoryId: string, week: string) => `${categoryId}|${week}`

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

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
