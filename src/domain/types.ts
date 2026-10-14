/**
 * The three fixed main blocks. Everything you budget or track belongs to one of them.
 * Blocks are not categories: categories and subcategories live inside a block.
 */
export const BLOCKS = ['income', 'expenses', 'savings'] as const
export type Block = (typeof BLOCKS)[number]

export const BLOCK_LABELS: Record<Block, string> = {
  income: 'Income',
  expenses: 'Expenses',
  savings: 'Savings',
}

/** What happens to unspent expense budget at the end of a month. */
export type CarryOverMode = 'carry' | 'toMainPot'

/**
 * A pocket's leftovers. 'carry': you top up the same amount every month, and what's left adds to
 * next month's budget. 'reset': you top up only what's missing, so each month starts at the budget.
 */
export type PocketLeftovers = 'carry' | 'reset'

export const LEFTOVER_LABELS: Record<PocketLeftovers, string> = { reset: 'Reset each month', carry: 'Carried over' }

export interface Category {
  id: string
  block: Block
  /** null for a top-level category directly inside its block. */
  parentId: string | null
  name: string
  /** Position among siblings, ascending. */
  order: number
  archived: boolean
  /** Expenses only. Undefined means "use the default from Settings". */
  carryOver?: CarryOverMode
  /** Paid once a year: the planner puts the amount in its month (1–12) and 0 in the others. */
  yearly?: YearlyCost
  /** Top-level expenses: needed to live (rent, groceries), for the Safety net. Undefined means Pulse guesses from the name. */
  essential?: boolean
  /** Top-level savings: part of your safety net (an emergency fund). Undefined means Pulse guesses from the name. */
  safetyNet?: boolean
}

export interface YearlyCost {
  month: number
  cents: number
}

export type TagBudgetPeriod = 'total' | 'month' | 'year'

export interface Tag {
  id: string
  /** Normalised: lowercase, no leading '#', words joined by '-'. */
  name: string
  /** Optional amount to aim for with this tag, e.g. a trip, over budgetPeriod. */
  budgetCents?: number
  /** How long the budget lasts: everything ever tagged (the default), each month, or each year. */
  budgetPeriod?: TagBudgetPeriod
  /** Finished tags (an old trip) stay on their transactions but aren't suggested any more. */
  archived?: boolean
  /**
   * Days the tag covers ("YYYY-MM-DD", both included), e.g. a trip. Every expense on these
   * days gets the tag, also ones added or imported later.
   */
  from?: string
  to?: string
}

export type SavingsRateMode = 'allocated' | 'notSpent'

export interface Settings {
  /** First year shown in the planner. Mirrors "Starting Year" in the Excel. */
  startingYear: number
  /** Month (1-12) of the starting year in which budgeting starts. Earlier months count as zero. */
  startingMonth: number
  /** ISO 4217 code. Only EUR is offered for now, but every amount is stored with its currency. */
  currency: string
  /** Treat income received on or after `lateIncomeDay` as income for the next month. */
  shiftLateIncome: boolean
  lateIncomeDay: number
  /** Also shift everything else from that day in tracking, so a tracking month runs from day N to day N−1. */
  shiftWholeMonth: boolean
  /** Income left after expenses and savings goes to the Main Pot automatically. */
  saveNonAllocated: boolean
  /** The Main Pot may cover months where expenses exceed income. */
  allowDissaving: boolean
  /**
   * allocated: savings rate = savings / income.
   * notSpent:  savings rate = (income - expenses) / income.
   */
  savingsRateMode: SavingsRateMode
  /** Default for expense categories that don't set their own carry-over. */
  carryOverDefault: CarryOverMode
  /** Lab: the day weeks start on, 0 Sunday, 1 Monday … 6 Saturday. */
  labWeekStart: number
  /** Lab: a week starting below this is shown in red, above labHigh in green (cents). */
  labLow: number
  labHigh: number
  /** Lab: the money in the account at the start of the first week (cents). */
  labStartCents: number
  /** Lab: first day of the first week ("YYYY-MM-DD"); null means the current week. */
  labFirstWeek: string | null
  /** Lab: how many columns are shown. */
  labWeeks: number
  /** Lab: what one column covers. */
  labColumns: 'split' | 'week' | 'fortnight'
  /** Dashboard: add the playground's pretend amounts as a forecast. */
  dashPlayground: boolean
  /** Plug-ins: each adds its own tab when on. Their data is kept when switched off. */
  pluginPlayground: boolean
  pluginWishlist: boolean
  /** The Resale plug-in: things to sell second hand. */
  pluginResale: boolean
  /** Wealth's pocket check: the pockets in your order (by name); new ones go at the end. */
  pocketOrder: string[]
  /** Wealth's pocket check: a colour per pocket (by name). */
  pocketColours: Record<string, string>
  /** What happens to money left in a pocket at the end of a month (by name); unset is 'reset'. */
  pocketLeftovers: Record<string, PocketLeftovers>
  /** The plug-ins in your order: their boxes in Settings and their tabs in the top bar. */
  pluginOrder: PluginKey[]
  /** Upcoming's From Tracking: only payments seen more than once with the same amount. */
  upcomingRepeatsOnly: boolean
  /** Imports reuse a shop's last category only once it was seen this many times. */
  ruleMinUses: number
  /** Wishlist: the rows shown on each card, in card order (name and picture always show). */
  wishCardFields: WishCardField[]
  /** Wishlist: broken, lost, sold or cancelled things move to the Archived tab. */
  wishArchiveEnded: boolean
  /** Wishlist: a card opens in the middle of the page or as a panel on the side. */
  wishPeek: 'center' | 'side'
  /** Wishlist: the sales periods a wish can wait for, in your order; see salesOf. */
  sales?: Sale[]
  /** Wishlist, before sales periods could be added: read through salesOf. */
  saleDates?: SaleDates
  /** Resale: the sites things get posted on, in your order. */
  resaleSites: string[]
  /** Resale: the income category a sale was last added to in Tracking. */
  resaleIncomeCategory?: string
}

/**
 * A day a sale starts or ends each year: a date, a week of the month (1–7, 8–14, 15–21, or 22 to
 * the end; the start of that week for a first day, its end for a last day), or a weekday such as the
 * first Monday (nth 5 is the last one in the month). Months go from 1 to 12.
 */
export type SaleDay =
  | { on: 'date'; month: number; day: number }
  | { on: 'week'; month: number; week: 1 | 2 | 3 | 4 }
  | { on: 'weekday'; month: number; nth: 1 | 2 | 3 | 4 | 5; weekday: number }

/** A sale's first and last day each year. A last day before the first runs into the next year. */
export interface SaleDays {
  from: SaleDay
  to: SaleDay
}

/** Before sales periods could be added: the days of the January and summer sales. */
export interface SaleDates {
  januarySales: SaleDays
  summerSales: SaleDays
}

/**
 * A sales period a wish can wait for. Black Friday follows its own rule (the Friday after the
 * fourth Thursday of November to Cyber Monday); the others run on their days each year.
 */
export interface Sale extends SaleDays {
  id: string
  name: string
  /** Off: not offered for wishes any more, but wishes already waiting for it keep counting down. */
  on: boolean
  rule?: 'blackFriday'
}

/** The common sales, ready to use; the last few are there to switch on. */
export const DEFAULT_SALES: Sale[] = [
  { id: 'blackFriday', name: 'Black Friday', on: true, rule: 'blackFriday', from: { on: 'date', month: 11, day: 27 }, to: { on: 'date', month: 11, day: 30 } },
  { id: 'januarySales', name: 'January sales', on: true, from: { on: 'date', month: 1, day: 2 }, to: { on: 'date', month: 1, day: 31 } },
  { id: 'summerSales', name: 'Summer sales', on: true, from: { on: 'date', month: 7, day: 1 }, to: { on: 'date', month: 7, day: 31 } },
  { id: 'primeDay', name: 'Prime Day', on: false, from: { on: 'week', month: 7, week: 2 }, to: { on: 'week', month: 7, week: 2 } },
  { id: 'backToSchool', name: 'Back to school', on: false, from: { on: 'week', month: 8, week: 4 }, to: { on: 'week', month: 9, week: 2 } },
  { id: 'singlesDay', name: "Singles' Day", on: false, from: { on: 'date', month: 11, day: 11 }, to: { on: 'date', month: 11, day: 11 } },
]

/** The sales periods, from settings saved before they could be added too. */
export function salesOf(settings: { sales?: Sale[]; saleDates?: SaleDates }): Sale[] {
  if (settings.sales) return settings.sales
  const old = settings.saleDates
  return DEFAULT_SALES.map((s) => (old && (s.id === 'januarySales' || s.id === 'summerSales') ? { ...s, ...old[s.id] } : s))
}

export type PluginKey = 'pluginWishlist' | 'pluginResale' | 'pluginPlayground'
export const PLUGINS: PluginKey[] = ['pluginWishlist', 'pluginResale', 'pluginPlayground']

/** Every plug-in once, in the saved order; ones the order doesn't know yet go at the end. */
export function orderedPlugins(order: readonly string[] | undefined): PluginKey[] {
  const known = (order ?? []).filter((k, i, all): k is PluginKey => PLUGINS.includes(k as PluginKey) && all.indexOf(k) === i)
  return [...known, ...PLUGINS.filter((k) => !known.includes(k))]
}

/** The order after moving one plug-in up (-1) or down (+1). */
export function movePlugin(order: readonly string[] | undefined, key: PluginKey, by: -1 | 1): PluginKey[] {
  const next = orderedPlugins(order)
  const i = next.indexOf(key)
  const j = i + by
  if (j < 0 || j >= next.length) return next
  const moved = next.slice()
  moved.splice(i, 1)
  moved.splice(j, 0, key)
  return moved
}

export type WishCardField = 'brand' | 'price' | 'chips' | 'ownedFor' | 'status' | 'giftShare'
export const WISH_CARD_FIELDS: Array<[WishCardField, string]> = [
  ['brand', 'Brand'],
  ['price', 'Price'],
  ['giftShare', 'Gift share'],
  ['chips', 'Categories and tags'],
  ['ownedFor', 'How long owned'],
  ['status', 'Status'],
]

export const DEFAULT_SETTINGS: Settings = {
  startingYear: new Date().getFullYear(),
  startingMonth: 1,
  currency: 'EUR',
  shiftLateIncome: true,
  lateIncomeDay: 20,
  shiftWholeMonth: false,
  saveNonAllocated: true,
  allowDissaving: true,
  savingsRateMode: 'allocated',
  carryOverDefault: 'carry',
  labWeekStart: 1,
  labLow: 0,
  labHigh: 100000,
  labStartCents: 0,
  labFirstWeek: null,
  labWeeks: 12,
  labColumns: 'week',
  dashPlayground: false,
  pluginPlayground: false,
  pluginWishlist: false,
  pluginResale: false,
  pocketOrder: [],
  pocketColours: {},
  pocketLeftovers: {},
  pluginOrder: [...PLUGINS],
  upcomingRepeatsOnly: true,
  ruleMinUses: 1,
  wishCardFields: ['brand', 'price', 'giftShare', 'chips', 'ownedFor', 'status'],
  wishArchiveEnded: true,
  wishPeek: 'center',
  resaleSites: ['Wallapop', 'Vinted', 'eBay', 'Facebook Marketplace'],
}
