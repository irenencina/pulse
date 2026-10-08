/**
 * The Dashboard's Safety net: how many months your savings could cover the spending you
 * can't avoid, if your income stopped. It reads the plan, since Pulse doesn't know real
 * account balances yet.
 */
import { computePlan, startMonth, type BudgetCell } from './budget'
import { previousMonth } from './recurring'
import { countsFor, type Transaction } from './transactions'
import type { Category, Settings } from './types'

const ESSENTIAL_GUESS = /rent|mortgage|housing|grocer|food|utilit|bills?\b|energy|electric|water|insurance|health|medic|transport|phone/i
const SAFETY_GUESS = /emergency|buffer|safety|rainy/i

/** A top-level expense you need to live; Pulse guesses from the name until you say. */
export const isEssential = (c: Category) => c.block === 'expenses' && c.parentId === null && (c.essential ?? ESSENTIAL_GUESS.test(c.name))
/** A top-level savings fund that is there for emergencies; Pulse guesses from the name until you say. */
export const isSafetyNet = (c: Category) => c.block === 'savings' && c.parentId === null && (c.safetyNet ?? SAFETY_GUESS.test(c.name))

export interface SafetyNet {
  /** The Main Pot plus the safety-net funds, as planned to the end of this month. */
  netCents: number
  /** Average essential spending a month. */
  monthlyCents: number
  /** Null when there is no essential spending to divide by. */
  months: number | null
  /** Tracked over the last 6 months, or planned when there isn't enough history yet. */
  basis: 'tracked' | 'planned'
  /** How many months the tracked average uses. */
  trackedMonths: number
  funds: string[]
  essentials: string[]
}

const HISTORY = 6

export function safetyNet(
  categories: Category[],
  cells: BudgetCell[],
  transactions: Transaction[],
  settings: Settings,
  today: string,
): SafetyNet {
  const live = categories.filter((c) => !c.archived)
  const funds = live.filter(isSafetyNet)
  const essentials = live.filter(isEssential)
  const thisMonth = today.slice(0, 7)
  const year = Number(today.slice(0, 4))

  // What the plan has put into the Main Pot and the safety-net funds by the end of this month.
  let netCents = 0
  for (let y = Math.min(settings.startingYear, year); y <= year; y++) {
    const plan = computePlan(categories, cells, settings, y)
    plan.months.forEach((m, i) => {
      if (m > thisMonth) return
      for (const f of funds) netCents += plan.amounts.get(f.id)?.[i] ?? 0
      if (y === year && m === thisMonth) netCents += plan.totals[i]!.potBalance
    })
  }

  // Essential spending: each category with everything under it.
  const byId = new Map(categories.map((c) => [c.id, c]))
  const rootOf = (id: string | null): Category | undefined => {
    let c = id === null ? undefined : byId.get(id)
    for (let n = 0; c && c.parentId !== null && n < 50; n++) c = byId.get(c.parentId)
    return c
  }
  const essentialIds = new Set(essentials.map((c) => c.id))
  const start = startMonth(settings)
  const recent = Array.from({ length: HISTORY }, (_, i) => previousMonth(thisMonth, i + 1)).filter((m) => m >= start)
  const spent = new Map(recent.map((m) => [m, 0]))
  const anyExpense = new Set<string>()
  for (const t of transactions) {
    if (t.block !== 'expenses') continue
    const month = countsFor(t, settings)
    if (!spent.has(month)) continue
    anyExpense.add(month)
    const root = rootOf(t.categoryId)
    if (root && essentialIds.has(root.id)) spent.set(month, spent.get(month)! + t.cents)
  }
  const tracked = recent.filter((m) => anyExpense.has(m))
  let monthlyCents: number
  let basis: SafetyNet['basis']
  if (tracked.length >= 2) {
    monthlyCents = Math.round(tracked.reduce((sum, m) => sum + spent.get(m)!, 0) / tracked.length)
    basis = 'tracked'
  } else {
    const plan = computePlan(categories, cells, settings, year)
    const active = plan.months.filter((m) => m >= start)
    const total = essentials.reduce((sum, c) => sum + (plan.amounts.get(c.id) ?? []).reduce((a, b, i) => a + (plan.months[i]! >= start ? b : 0), 0), 0)
    monthlyCents = active.length > 0 ? Math.round(total / active.length) : 0
    basis = 'planned'
  }
  const net = Math.max(0, netCents)
  return {
    netCents: net,
    monthlyCents,
    months: monthlyCents > 0 ? net / monthlyCents : null,
    basis,
    trackedMonths: tracked.length,
    funds: funds.map((c) => c.name),
    essentials: essentials.map((c) => c.name),
  }
}

/** Red under a month, amber up to 3, neutral up to 6, green from 6. */
export function safetyLevel(months: number | null): 'low' | 'thin' | 'ok' | 'good' {
  if (months === null || months < 1) return 'low'
  if (months < 3) return 'thin'
  if (months < 6) return 'ok'
  return 'good'
}
