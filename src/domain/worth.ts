import { descendantIds } from './categories'
import { monthKey, type MonthKey } from './periods'
import type { Transaction } from './transactions'
import type { Category } from './types'

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
