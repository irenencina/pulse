import { monthKey, type MonthKey } from './periods'

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
}

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
