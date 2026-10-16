import type { MonthKey } from './periods'
import type { UpcomingEvent } from './upcoming'
import { balanceIn, estimateOwed, hasTerms, payoff, sideOf, type Account, type Balance } from './worth'
import { statusOf, type WishItem } from './wishlist'

/** Someone to call when your money needs handling: family, a bank, an insurer, an accountant. */
export interface EmergencyContact {
  id: string
  name: string
  /** Who they are to you: "Sister", "Accountant", "Home insurance". */
  role?: string
  phone?: string
  email?: string
  /** Before phone and email were apart: one or the other. */
  reach?: string
}

/** A contact's phone, also from before phone and email were apart. */
export const contactPhone = (c: EmergencyContact) => c.phone ?? (c.reach && !c.reach.includes('@') ? c.reach : undefined)
export const contactEmail = (c: EmergencyContact) => c.email ?? (c.reach?.includes('@') ? c.reach : undefined)

/** The emergency sheet's own details; the rest comes from Wealth, Upcoming and the Wishlist. */
export interface EmergencySheet {
  contacts: EmergencyContact[]
  /** Where papers, keys and documents are kept. */
  whereThings?: string
  /** The last day you checked the sheet was still right. */
  checkedOn?: string
}

/** Where the sheet opens: under Wealth, where the accounts are. */
export const EMERGENCY_PATH = '/wealth/emergency'

export const EMPTY_SHEET: EmergencySheet = { contacts: [] }

/** Months between checks of the sheet; Upcoming reminds you when one is due. */
export const CHECK_MONTHS = 6
/** Days before a check is due that Upcoming shows it. */
export const CHECK_NOTICE_DAYS = 14

/** The day the next check is due: six months after the last one; null when it was never checked. */
export function nextCheck(sheet: EmergencySheet | undefined): string | null {
  if (!sheet?.checkedOn) return null
  const [y, m, d] = sheet.checkedOn.split('-').map(Number) as [number, number, number]
  const index = y * 12 + (m - 1) + CHECK_MONTHS
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

export interface SheetAccount {
  account: Account
  /** Its latest balance (what it holds, or what's owed), with the month it's from. */
  cents: number | null
  month: MonthKey | null
}

export interface SheetDebt extends SheetAccount {
  /** What's paid each month, and the month it's paid off, when its terms are known. */
  monthlyCents: number | null
  endMonth: MonthKey | null
}

/** What you own and what you owe, as of `month`: the latest balance of each, and a loan's payments. */
export function sheetAccounts(accounts: Account[], balances: Balance[], month: MonthKey): { own: SheetAccount[]; owe: SheetDebt[] } {
  const sorted = [...accounts].sort((a, b) => a.order - b.order)
  const latest = (a: Account) => {
    const b = balanceIn(balances, a.id, month)
    if (b) return { cents: b.cents, month: b.month }
    const estimate = estimateOwed(a.loan, month)
    return estimate === null ? { cents: null, month: null } : { cents: estimate, month }
  }
  const own = sorted.filter((a) => sideOf(a.kind) === 'own').map((a) => ({ account: a, ...latest(a) }))
  const owe = sorted
    .filter((a) => sideOf(a.kind) === 'owe')
    .map((a) => {
      const now = latest(a)
      const terms = hasTerms(a.kind) ? a.loan : undefined
      const end = terms && now.cents !== null && now.month ? payoff(now.cents, terms.ratePct, terms.paymentCents, now.month).endMonth : null
      return { account: a, ...now, monthlyCents: terms?.paymentCents ?? null, endMonth: end }
    })
  return { own, owe }
}

/**
 * One line per bill or subscription: the next payment of each. Loans are left out, also when Tracking pays
 * them through their category: they're listed with what you owe.
 */
export function sheetBills(events: UpcomingEvent[], accounts: Account[] = []): UpcomingEvent[] {
  const loanCategories = new Set(accounts.filter((a) => sideOf(a.kind) === 'owe' && a.categoryId).map((a) => a.categoryId))
  const seen = new Set<string>()
  const bills: UpcomingEvent[] = []
  for (const e of [...events].sort((a, b) => a.date.localeCompare(b.date))) {
    if (e.kind !== 'payment' || e.done || e.source === 'loan' || (e.categoryId && loanCategories.has(e.categoryId)) || seen.has(e.sourceKey)) continue
    seen.add(e.sourceKey)
    bills.push(e)
  }
  const often = { month: 0, year: 1, once: 2 } as const
  return bills.sort((a, b) => often[a.repeat] - often[b.repeat] || a.name.localeCompare(b.name))
}

/** Things you own that are still under warranty, the one ending first on top. */
export function sheetWarranties(wishes: WishItem[], today: string): WishItem[] {
  return wishes
    .filter((w) => w.owned && statusOf(w) === 'inUse' && w.warrantyUntil && w.warrantyUntil >= today)
    .sort((a, b) => a.warrantyUntil!.localeCompare(b.warrantyUntil!))
}
