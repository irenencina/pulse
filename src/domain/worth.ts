import { descendantIds } from './categories'
import { monthKey, type MonthKey } from './periods'
import type { Pocket, Transaction } from './transactions'
import type { Category, PocketLeftovers } from './types'

/**
 * Worth: what you own and what you owe, from a balance you note once a month or read from a Revolut statement.
 * Net worth = everything owned − everything owed.
 */
export type AccountSide = 'own' | 'owe'

export type AccountKind = 'bank' | 'pocket' | 'savings' | 'investment' | 'valuable' | 'otherOwn' | 'loan' | 'card' | 'otherOwe'

export const ACCOUNT_KINDS: Record<AccountSide, AccountKind[]> = {
  own: ['bank', 'pocket', 'savings', 'investment', 'valuable', 'otherOwn'],
  owe: ['loan', 'card', 'otherOwe'],
}

export const KIND_LABELS: Record<AccountKind, string> = {
  bank: 'Bank account',
  pocket: 'Pocket',
  savings: 'Savings',
  investment: 'Investments',
  valuable: 'Car, home or valuables',
  otherOwn: 'Other',
  loan: 'Loan',
  card: 'Credit card',
  otherOwe: 'Other debt',
}

export const SIDE_LABELS: Record<AccountSide, string> = { own: 'Own', owe: 'Owe' }

export const sideOf = (kind: AccountKind): AccountSide => (ACCOUNT_KINDS.owe.includes(kind) ? 'owe' : 'own')

export interface Account {
  id: string
  name: string
  kind: AccountKind
  /** Position in its side's list, ascending. */
  order: number
  /** Its name in a Revolut statement ("Personal Account", a pocket, "Savings"): importing one fills in its balances. */
  bankName?: string
  /**
   * The category its money moves through in Tracking: a Savings category for savings (what you put in or take out),
   * an Expenses category for a loan's payments. Update balances suggests a balance from it.
   */
  categoryId?: string
  /** A loan's terms, for when it ends and what paying more would change. */
  loan?: LoanTerms
}

export interface LoanTerms {
  /** Yearly interest, in percent (3.5 for 3.5%). */
  ratePct: number
  /** What you pay each month. */
  paymentCents: number
  /** The day of the month it's paid (1–31). */
  day: number
}

/** Loans and credit cards can carry terms. */
export const hasTerms = (kind: AccountKind) => kind === 'loan' || kind === 'card' || kind === 'otherOwe'

/** What an account held (or what was still owed) in a month. Always zero or more: the side gives the sign. */
export interface Balance {
  /** `${accountId}|${month}` */
  id: string
  accountId: string
  month: MonthKey
  cents: number
  /** When it was noted, and whether it came from an imported statement. */
  notedAt?: number
  imported?: boolean
}

export const balanceId = (accountId: string, month: MonthKey) => `${accountId}|${month}`

export function addMonths(month: MonthKey, by: number): MonthKey {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const index = y * 12 + (m - 1) + by
  return monthKey(Math.floor(index / 12), (index % 12) + 1)
}

/** The balance noted in `month`, or else the last one before it; null when nothing was noted yet. */
export function balanceIn(balances: Balance[], accountId: string, month: MonthKey): Balance | null {
  let best: Balance | null = null
  for (const b of balances) {
    if (b.accountId !== accountId || b.month > month) continue
    if (!best || b.month > best.month) best = b
  }
  return best
}

export interface WorthPoint {
  month: MonthKey
  own: number
  owe: number
  net: number
}

/** Own, owe and net worth in a month. An account not updated that month counts with its last balance. */
export function worthIn(accounts: Account[], balances: Balance[], month: MonthKey): WorthPoint {
  let own = 0
  let owe = 0
  for (const a of accounts) {
    const cents = balanceIn(balances, a.id, month)?.cents ?? 0
    if (sideOf(a.kind) === 'own') own += cents
    else owe += cents
  }
  return { month, own, owe, net: own - owe }
}

/** From the first month with a balance up to `until`, at most `max` months (the latest ones). */
export function worthHistory(accounts: Account[], balances: Balance[], until: MonthKey, max = 24): WorthPoint[] {
  const ids = new Set(accounts.map((a) => a.id))
  const first = balances.filter((b) => ids.has(b.accountId) && b.month <= until).reduce<MonthKey | null>((min, b) => (min === null || b.month < min ? b.month : min), null)
  if (first === null) return []
  const points: WorthPoint[] = []
  for (let m = first; m <= until; m = addMonths(m, 1)) points.push(worthIn(accounts, balances, m))
  return points.slice(-max)
}

/** The latest month anything was noted in, or null. */
export const lastUpdated = (balances: Balance[]): MonthKey | null => balances.reduce<MonthKey | null>((max, b) => (max === null || b.month > max ? b.month : max), null)

/** The balance noted most recently (by when it was noted, not by its month), or null. */
export const lastNoted = (balances: Balance[]): Balance | null =>
  balances.reduce<Balance | null>((latest, b) => (b.notedAt !== undefined && (!latest || b.notedAt > latest.notedAt!) ? b : latest), null)

export interface Payoff {
  /** Payments left; null when the payment doesn't even cover the interest, so it never ends. */
  months: number | null
  /** The month of the last payment. */
  endMonth: MonthKey | null
  /** Interest still to pay until then. */
  interestCents: number
}

/** Paying `paymentCents` a month off `owedCents` (noted in `from`), with interest added monthly. Payments start the month after. */
export function payoff(owedCents: number, ratePct: number, paymentCents: number, from: MonthKey): Payoff {
  const rate = ratePct / 100 / 12
  if (owedCents <= 0) return { months: 0, endMonth: from, interestCents: 0 }
  if (paymentCents <= Math.round(owedCents * rate)) return { months: null, endMonth: null, interestCents: 0 }
  let owed = owedCents
  let interest = 0
  let months = 0
  while (owed > 0 && months < 1200) {
    const added = Math.round(owed * rate)
    interest += added
    owed += added - paymentCents
    months++
  }
  return { months, endMonth: addMonths(from, months), interestCents: interest }
}

/** What paying `extraCents` more each month changes: months sooner and interest saved. */
export function payMore(owedCents: number, terms: LoanTerms, extraCents: number, from: MonthKey): { months: number; sooner: number; savedCents: number; endMonth: MonthKey | null } | null {
  const now = payoff(owedCents, terms.ratePct, terms.paymentCents, from)
  const more = payoff(owedCents, terms.ratePct, terms.paymentCents + extraCents, from)
  if (more.months === null) return null
  return {
    months: more.months,
    sooner: now.months === null ? Infinity : now.months - more.months,
    savedCents: now.months === null ? 0 : now.interestCents - more.interestCents,
    endMonth: more.endMonth,
  }
}

export interface Suggestion {
  cents: number
  /** Where it comes from: Tracking's payments in the linked category, or the loan's terms. */
  from: 'tracking' | 'loan'
  /** How far it moved from the last balance. */
  changeCents: number
}

/**
 * A balance for `month` worked out from what Pulse knows, for Update balances to fill in:
 * a loan with terms, the last balance plus interest minus its payments; an account linked to a
 * category, the last balance plus what Tracking shows going in (and minus what came out) since.
 * Null when there's nothing to go on.
 */
export function suggestBalance(
  account: Account,
  balances: Balance[],
  month: MonthKey,
  transactions: Transaction[],
  categories: Category[],
): Suggestion | null {
  const last = balanceIn(balances, account.id, addMonths(month, -1))
  if (!last) return null
  if (account.loan && sideOf(account.kind) === 'owe') {
    const rate = account.loan.ratePct / 100 / 12
    let owed = last.cents
    for (let m = addMonths(last.month, 1); m <= month; m = addMonths(m, 1)) owed = Math.max(0, owed + Math.round(owed * rate) - account.loan.paymentCents)
    return owed === last.cents ? null : { cents: owed, from: 'loan', changeCents: owed - last.cents }
  }
  if (account.categoryId && categories.some((c) => c.id === account.categoryId)) {
    const ids = descendantIds(categories, account.categoryId)
    let moved = 0
    for (const t of transactions) {
      const m = t.date.slice(0, 7)
      if (t.categoryId !== null && ids.has(t.categoryId) && m > last.month && m <= month) moved += t.cents
    }
    if (moved === 0) return null
    const cents = Math.max(0, last.cents + moved)
    return { cents, from: 'tracking', changeCents: cents - last.cents }
  }
  return null
}

const rank = (order: string[], name: string) => (order.includes(name) ? order.indexOf(name) : Infinity)

/** The pocket order after moving `name` to just before or after `target`. */
export function movePocket(names: string[], name: string, target: string, after: boolean): string[] {
  const rest = names.filter((n) => n !== name)
  const at = rest.indexOf(target)
  if (at < 0) return names
  rest.splice(after ? at + 1 : at, 0, name)
  return rest
}

/** The pockets in your order (by name); the rest by their Wealth account's order, then by name. */
export function sortPockets<T extends { pocket: string; account?: Account | null }>(list: T[], order: string[] = []): T[] {
  return [...list].sort(
    (a, b) => rank(order, a.pocket) - rank(order, b.pocket) || (a.account?.order ?? Infinity) - (b.account?.order ?? Infinity) || a.pocket.localeCompare(b.pocket),
  )
}

/**
 * A pocket's month as the bank shows it: what it held at the start, what went in, what was paid
 * out of it (per category, as sorted in Tracking) and what it holds now. Only imported balances
 * and payments paid from the pocket count; the plan plays no part.
 */
export interface PocketStatement {
  pocket: string
  account: Account | null
  /** The month of its latest balance; null before any. */
  month: MonthKey | null
  /** Its balance at the end of the month before; null when that wasn't noted. */
  startCents: number | null
  /** Put in during the month: what it holds now, minus the start, plus what was paid out. */
  inCents: number | null
  /** Paid out of it, per category (null: not sorted yet). */
  out: Array<{ categoryId: string | null; cents: number }>
  outCents: number
  nowCents: number | null
  /** When the latest balance was noted or imported. */
  asOf?: number
}

const isoDay = (at: number) => {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function pocketStatements(
  pockets: Pocket[],
  accounts: Account[],
  balances: Balance[],
  transactions: Transaction[],
  month: MonthKey,
  order: string[] = [],
): PocketStatement[] {
  return sortPockets(
    pockets.map((p) => {
      const account = accounts.find((a) => a.bankName === p.name) ?? null
      const now = account ? balanceIn(balances, account.id, month) : null
      if (!now) return { pocket: p.name, account, month: null, startCents: null, inCents: null, out: [], outCents: 0, nowCents: null }
      const start = balances.find((b) => b.accountId === account!.id && b.month === addMonths(now.month, -1)) ?? null
      // Payments after the balance was noted aren't in it yet.
      const until = now.notedAt !== undefined && isoDay(now.notedAt).slice(0, 7) === now.month ? isoDay(now.notedAt) : `${now.month}-31`
      const byCategory = new Map<string | null, number>()
      for (const t of transactions) {
        if (t.pocket !== p.name || t.block === 'income' || t.date.slice(0, 7) !== now.month || t.date > until) continue
        byCategory.set(t.categoryId, (byCategory.get(t.categoryId) ?? 0) + t.cents)
      }
      const out = [...byCategory].map(([categoryId, cents]) => ({ categoryId, cents })).sort((a, b) => b.cents - a.cents)
      const outCents = out.reduce((sum, o) => sum + o.cents, 0)
      return {
        pocket: p.name,
        account,
        month: now.month,
        startCents: start?.cents ?? null,
        inCents: start ? now.cents - start.cents + outCents : null,
        out,
        outCents,
        nowCents: now.cents,
        ...(now.notedAt !== undefined ? { asOf: now.notedAt } : {}),
      }
    }),
    order,
  )
}

/** Colours to pick for a pocket: the app's own first, then a few more. */
export const POCKET_COLOURS = ['#1b2550', '#2bb673', '#e5197d', '#2f6fd6', '#f59e0b', '#8b5cf6', '#14b8a6', '#ef6c4a', '#eab308', '#64748b']

/** A pocket's colour: the one you picked, else one by its place in the pocket check. */
export const pocketColour = (colours: Record<string, string>, pocket: string, i: number) => colours[pocket] ?? POCKET_COLOURS[(i + 3) % POCKET_COLOURS.length]!

/**
 * What to put in a pocket on payday for the month it pays for. Carried over: always the budget.
 * Reset each month: only what's missing, counting what the bank says is in it now.
 */
export function topUpCents(leftovers: PocketLeftovers, nextBudgetCents: number, inPocketCents: number | null): number {
  if (leftovers === 'carry') return nextBudgetCents
  return Math.max(0, nextBudgetCents - Math.max(0, inPocketCents ?? 0))
}
