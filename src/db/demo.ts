import { cellId, type BudgetCell } from '../domain/budget'
import { weekStartOf, type LabEntry, type LabNote } from '../domain/lab'
import { monthKey, type MonthKey } from '../domain/periods'
import { groupKey } from '../domain/recurring'
import type { Pocket, Transaction } from '../domain/transactions'
import { DEFAULT_SETTINGS, type Block, type Category, type Tag } from '../domain/types'
import type { UpcomingItem, UpcomingOverride } from '../domain/upcoming'
import { balanceId, type Account, type AccountKind, type Balance } from '../domain/worth'
import { STARTER_WISH_CATEGORIES, type WishCategory, type WishItem } from '../domain/wishlist'
import { restoreBackup, type Backup } from './backup'
import { db as defaultDb, type PulseDB } from './db'
import type { ImportRecord } from './db'

/*
 * Made-up data for trying Pulse out: about six months of a pretend person's money, dated
 * around today so every page has something to show. Every name and amount is invented.
 * Add to it whenever a feature is added, so the feature can be explored straight away.
 */

/** The same "random" numbers every time, so the demo looks the same on every load. */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function addMonths(month: MonthKey, by: number): MonthKey {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const index = y * 12 + (m - 1) + by
  return monthKey(Math.floor(index / 12), (index % 12) + 1)
}

/** A day in a month, moved to the month's last day when it is shorter. */
function dayIn(month: MonthKey, day: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${month}-${pad(Math.min(day, last))}`
}

type CategorySeed = { key: string; name: string; parent?: string; monthly?: number; percent?: number; extra?: Partial<Category> }

const CATEGORIES: Record<Block, CategorySeed[]> = {
  income: [
    { key: 'salary', name: 'Job (Net)', monthly: 3300 },
    { key: 'otherIncome', name: 'Other' },
  ],
  expenses: [
    { key: 'rent', name: 'Rent', monthly: 900 },
    { key: 'insurance', name: 'Health Insurance', monthly: 160 },
    { key: 'utilities', name: 'Utilities' },
    { key: 'energy', name: 'Energy', parent: 'utilities', monthly: 65 },
    { key: 'internet', name: 'Internet & Phone', parent: 'utilities', monthly: 60 },
    { key: 'groceries', name: 'Groceries', monthly: 320 },
    { key: 'transport', name: 'Transportation', monthly: 80 },
    { key: 'subscriptions', name: 'Subscriptions', monthly: 35 },
    { key: 'sports', name: 'Sports & Gym' },
    { key: 'gym', name: 'Gym', parent: 'sports', monthly: 35 },
    { key: 'football', name: 'Football club', parent: 'sports' },
    { key: 'fun', name: 'Fun & Leisure' },
    { key: 'eatingOut', name: 'Eating out', parent: 'fun', monthly: 120 },
    { key: 'dancing', name: 'Dancing', parent: 'fun', monthly: 75 },
    { key: 'goingOut', name: 'Going out', parent: 'fun', monthly: 60 },
    { key: 'shopping', name: 'Shopping & Presents', monthly: 80 },
    { key: 'clothing', name: 'Clothing', monthly: 60 },
    { key: 'body', name: 'Medicine & Body Care', monthly: 30 },
    { key: 'education', name: 'Education', monthly: 40 },
    { key: 'travel', name: 'Travel & Vacation', monthly: 100 },
    { key: 'loanPayment', name: 'Student loan', monthly: 150 },
    { key: 'oldPhone', name: 'Old phone plan', extra: { archived: true } },
  ],
  savings: [
    { key: 'emergency', name: 'Emergency Fund', monthly: 200, extra: { safetyNet: true } },
    { key: 'etf', name: 'ETF Investing', percent: 15 },
    { key: 'pension', name: 'Pension Investing', monthly: 50 },
    { key: 'travelFund', name: 'Travel Fund', monthly: 100 },
  ],
}

const POCKETS: Record<string, string[]> = {
  Bills: ['rent', 'insurance', 'energy', 'internet', 'subscriptions', 'gym'],
  Household: ['groceries', 'transport', 'body'],
  'Mind & Fun': ['eatingOut', 'dancing', 'goingOut', 'education'],
  'Gear & Gifts': ['shopping', 'clothing'],
}

const DINNERS = ['Pizza night', 'Thai takeaway', 'Burger place', 'Sushi dinner', 'Tapas bar', 'Ramen shop']

/** The demo, with dates around `today` ("YYYY-MM-DD"). */
export function demoBackup(today: string): Backup {
  const random = seeded(7)
  const between = (lo: number, hi: number) => Math.round((lo + random() * (hi - lo)) * 100)
  const thisMonth = today.slice(0, 7) as MonthKey
  const todayDay = Number(today.slice(8, 10))
  const firstMonth = addMonths(thisMonth, -5)
  const [startYear, startMonth] = firstMonth.split('-').map(Number) as [number, number]
  const months = Array.from({ length: 6 }, (_, i) => addMonths(firstMonth, i))

  // Categories, with fixed ids so the rest can point at them.
  const id = (key: string) => `demo-${key}`
  const categories: Category[] = []
  for (const block of ['income', 'expenses', 'savings'] as Block[]) {
    const order = new Map<string | null, number>()
    for (const c of CATEGORIES[block]) {
      const parentId = c.parent ? id(c.parent) : null
      const n = order.get(parentId) ?? 0
      order.set(parentId, n + 1)
      categories.push({ id: id(c.key), block, parentId, name: c.name, order: n, archived: false, ...c.extra })
    }
  }
  // Paid once a year, next month: shows in the planner's month and in Upcoming.
  const football = categories.find((c) => c.id === id('football'))!
  football.yearly = { month: Number(addMonths(thisMonth, 1).slice(5)), cents: 18000 }

  // The plan: from the first demo month to the end of next year.
  const budgetCells: BudgetCell[] = []
  const lastPlanned = monthKey(Number(today.slice(0, 4)) + 1, 12)
  for (let m = firstMonth; m <= lastPlanned; m = addMonths(m, 1)) {
    for (const block of ['income', 'expenses', 'savings'] as Block[]) {
      for (const c of CATEGORIES[block]) {
        const cid = id(c.key)
        if (c.percent) budgetCells.push({ id: cellId(cid, m), categoryId: cid, month: m, kind: 'percent', basisPoints: c.percent * 100 })
        else if (c.monthly) budgetCells.push({ id: cellId(cid, m), categoryId: cid, month: m, kind: 'fixed', cents: c.monthly * 100 })
      }
    }
  }
  // December has a bit more for presents, typed as a sum.
  const december = monthKey(Number(today.slice(0, 4)), 12)
  const presents = budgetCells.find((c) => c.id === cellId(id('shopping'), december))
  if (presents && presents.kind === 'fixed') Object.assign(presents, { cents: 23000, formula: '80+150' })

  // Tags: a trip two months ago with its own dates and budget, a hobby with a yearly budget.
  const tripMonth = addMonths(thisMonth, -2)
  const tripFrom = dayIn(tripMonth, 12)
  const tripTo = dayIn(tripMonth, 16)
  const tags: Tag[] = [
    { id: id('tag-trip'), name: 'lisbon-trip', budgetCents: 45000, from: tripFrom, to: tripTo },
    { id: id('tag-dancing'), name: 'dancing', budgetCents: 90000, budgetPeriod: 'year' },
    { id: id('tag-gifts'), name: 'gifts' },
    { id: id('tag-flat'), name: 'old-flat', archived: true },
  ]

  const pocketOf = new Map<string, string>()
  for (const [name, keys] of Object.entries(POCKETS)) for (const k of keys) pocketOf.set(id(k), name)

  const transactions: Transaction[] = []
  let n = 0
  const add = (date: string, key: string, euros: number | [number, number], details: string, extra: Partial<Transaction> = {}) => {
    if (date > today || date < `${firstMonth}-01`) return
    const category = categories.find((c) => c.id === id(key))!
    const cents = typeof euros === 'number' ? Math.round(euros * 100) : between(euros[0], euros[1])
    const tagIds = date >= tripFrom && date <= tripTo && category.block === 'expenses' ? [id('tag-trip')] : []
    const pocket = pocketOf.get(category.id)
    n += 1
    transactions.push({
      id: `demo-t${n}`,
      date,
      block: category.block,
      categoryId: category.id,
      cents,
      details,
      tagIds,
      source: 'manual',
      createdAt: Date.parse(`${date}T12:00:00Z`),
      ...(pocket ? { pocket } : {}),
      ...extra,
      ...(extra.tagIds ? { tagIds: [...new Set([...tagIds, ...extra.tagIds])] } : {}),
    })
  }

  // The salary comes on the 24th and counts for the next month (Settings: late income).
  for (let i = 0; i < months.length; i++) {
    const paidIn = addMonths(months[i]!, -1)
    add(dayIn(paidIn, 24), 'salary', i === 3 ? 3450 : 3300, 'Salary Northwind Ltd')
  }
  add(dayIn(addMonths(thisMonth, -3), 9), 'otherIncome', 120, 'Sold old bike')

  // Spotify's price went up last month and this month's hasn't come yet.
  const spotifyDay = Math.min(todayDay + 3, 28)
  for (const [i, m] of months.entries()) {
    const current = m === thisMonth
    add(dayIn(m, 1), 'rent', 900, 'Rent Parkview Homes')
    add(dayIn(m, 1), 'insurance', 160, 'Health insurer')
    add(dayIn(m, 5), 'energy', i % 2 ? 71.2 : 64.8, 'GreenPower energy')
    // This month's internet bill is late: Upcoming shows it as not paid.
    if (!current) add(dayIn(m, 3), 'internet', 45.5, 'FiberNet internet')
    add(dayIn(m, 12), 'internet', 15, 'Mobile plan')
    add(dayIn(m, 8), 'subscriptions', 13.99, 'Netflix')
    add(dayIn(m, 18), 'subscriptions', 2.99, 'iCloud storage')
    if (!current) add(dayIn(m, spotifyDay), 'subscriptions', m === addMonths(thisMonth, -1) ? 12.99 : 10.99, 'Spotify')
    add(dayIn(m, 2), 'gym', 34.99, 'FitHub Gym')
    if (i >= 2) add(dayIn(m, 10), 'education', 39.9, 'Online design course')

    // Everyday spending.
    for (let week = 0; week < 5; week++) {
      const day = 1 + week * 7
      add(dayIn(m, day + 1), 'groceries', [25, 60], 'Lidl')
      add(dayIn(m, day + 4), 'groceries', [8, 35], week % 2 ? 'Albert Heijn' : 'Market stall')
      add(dayIn(m, day + 2), 'dancing', 18.5, 'Dance class', { tagIds: [id('tag-dancing')] })
      if (week % 2 === 0) add(dayIn(m, day + 5), 'eatingOut', [12, 45], week === 0 ? DINNERS[i % DINNERS.length]! : 'Lunch with colleagues')
      if (week === 1 || week === 3) add(dayIn(m, day + 3), 'transport', [4, 22], 'NS train')
    }
    add(dayIn(m, 20), 'transport', 20, 'OV top-up')
    add(dayIn(m, 14), 'goingOut', [15, 55], i % 2 ? 'Cinema' : 'Drinks with friends')
    if (i % 2 === 0) add(dayIn(m, 22), 'clothing', [25, 90], 'Second-hand shop')
    if (i % 3 === 1) add(dayIn(m, 16), 'body', [8, 30], 'Pharmacy')
    if (i % 2 === 1) add(dayIn(m, 26), 'shopping', [20, 60], 'Birthday present', { tagIds: [id('tag-gifts')] })

    // Saving at the start of each month, from the salary that came just before.
    add(dayIn(m, 2), 'emergency', i === 0 ? 2800 : 200, i === 0 ? 'Moved old savings in' : 'To emergency savings')
    add(dayIn(m, 2), 'etf', 495, 'ETF monthly buy')
    add(dayIn(m, 2), 'pension', 50, 'Pension top-up')
    add(dayIn(m, 2), 'travelFund', 100, 'To travel savings')
    add(dayIn(m, 25), 'loanPayment', 150, 'Student loan repayment')
  }

  // The trip: tagged by its dates, and over budget on eating out.
  add(addDays(tripFrom, -20), 'travel', 189, 'Flights to Lisbon')
  add(tripFrom, 'travel', 236, 'Guesthouse Alfama')
  add(addDays(tripFrom, 1), 'eatingOut', 38.4, 'Seafood dinner')
  add(addDays(tripFrom, 2), 'eatingOut', 22.9, 'Pastries and coffee')
  add(addDays(tripFrom, 2), 'transport', 12, 'Tram day pass')
  add(addDays(tripFrom, 3), 'goingOut', 25, 'Fado night')
  // A big one-off: overspends Shopping that month (the dark part of its bar).
  add(dayIn(addMonths(thisMonth, -1), 6), 'shopping', 219, 'New phone case and charger')

  // Imported from the bank but not sorted yet: Tracking asks for a category.
  const importId = 'demo-import'
  const unsorted = [
    { day: Math.max(1, todayDay - 2), cents: 1450, details: 'Bakery Zonnig', pocket: 'Household' },
    { day: Math.max(1, todayDay - 1), cents: 6299, details: 'Webshop order 2231', pocket: 'Gear & Gifts' },
    { day: todayDay, cents: 875, details: 'Parking garage', pocket: 'Household' },
  ]
  for (const [i, u] of unsorted.entries()) {
    transactions.push({
      id: `demo-import-${i}`,
      date: dayIn(thisMonth, u.day),
      block: 'expenses',
      categoryId: null,
      cents: u.cents,
      details: u.details,
      tagIds: [],
      source: 'revolut',
      pocket: u.pocket,
      importKey: `demo-${i}`,
      importId,
      createdAt: Date.parse(`${today}T09:00:00Z`),
    })
  }
  const imports: ImportRecord[] = [{ id: importId, fileName: 'Demo bank export.xlsx', at: Date.parse(`${today}T09:00:00Z`), count: unsorted.length, replaced: [] }]
  const pockets: Pocket[] = Object.entries(POCKETS).map(([name, keys]) => ({ name, categoryIds: keys.map(id) }))

  // Upcoming: your own lines, with alerts, a notice period, one with no cost and one cancelled.
  const upcomingItems: UpcomingItem[] = [
    { id: id('up-dentist'), name: 'Dentist check-up', cents: 6500, date: addDays(today, 5), repeat: 'once', categoryId: id('body'), remindDays: 7 },
    { id: id('up-contents'), name: 'Home contents insurance', cents: 12000, date: addDays(today, 40), repeat: 'year', categoryId: id('insurance'), noticeDays: 30 },
    { id: id('up-passport'), name: 'Passport renewal', cents: null, date: addDays(today, 150), repeat: 'once', categoryId: null },
    { id: id('up-taxes'), name: 'Tax return', cents: null, date: addDays(today, 70), repeat: 'year', categoryId: null, remindDays: 14 },
    { id: id('up-magazine'), name: 'Magazine subscription', cents: 899, date: dayIn(addMonths(thisMonth, -3), 15), repeat: 'month', categoryId: id('subscriptions'), cancelledOn: addDays(today, -6) },
  ]
  const tx = (details: string) => transactions.find((t) => t.details === details)!
  const upcomingOverrides: UpcomingOverride[] = [
    // A reminder and a notice period on payments Pulse found in Tracking.
    { id: `tracking:${groupKey(tx('Netflix'))}`, remindDays: 3 },
    { id: `tracking:${groupKey(tx('FitHub Gym'))}`, noticeDays: 14 },
    // Hidden from Upcoming: shows in its Hidden list.
    { id: `tracking:${groupKey(tx('Mobile plan'))}`, hidden: true },
  ]

  // Wishlist: wishes, things you own (with warranties and an older copy), and a subscription.
  const wishCategories: WishCategory[] = STARTER_WISH_CATEGORIES.map((name, i) => ({ id: id(`wc-${name.toLowerCase()}`), name, order: i }))
  const wc = (name: string) => id(`wc-${name.toLowerCase()}`)
  let order = 0
  const wish = (w: Omit<WishItem, 'order' | 'addedOn' | 'tagIds' | 'desired' | 'owned'> & Partial<WishItem>): WishItem => ({
    tagIds: [],
    desired: true,
    owned: false,
    addedOn: addDays(today, -120 + order * 7),
    order: order++,
    ...w,
  })
  const wishItems: WishItem[] = [
    wish({ id: id('w-headphones'), name: 'Noise-cancelling headphones', kind: 'item', priceCents: 24900, categoryIds: [wc('Tech')], brand: 'Sonora', paidFrom: id('shopping') }),
    wish({ id: id('w-desk'), name: 'Standing desk', kind: 'item', priceCents: 39900, categoryIds: [wc('Home')], paidFrom: id('shopping') }),
    wish({ id: id('w-bike'), name: 'Road bike', kind: 'item', priceCents: 120000, categoryIds: [wc('Sport')], brand: 'Velo', paidFrom: id('travelFund') }),
    wish({ id: id('w-jacket'), name: 'Rain jacket', kind: 'item', priceCents: 14000, categoryIds: [wc('Apparel')], paidFrom: id('clothing') }),
    wish({ id: id('w-pottery'), name: 'Pottery workshop', kind: 'experience', priceCents: 8500, categoryIds: [wc('Experiences')], paidFrom: id('goingOut') }),
    wish({ id: id('w-watch'), name: 'Smartwatch', kind: 'item', priceCents: 29900, categoryIds: [wc('Tech'), wc('Sport')], desired: false }),
    // Owned: the e-reader's warranty ends soon, so Upcoming shows it.
    wish({ id: id('w-ereader'), name: 'E-reader', kind: 'item', priceCents: 13000, categoryIds: [wc('Tech'), wc('Books')], brand: 'Inkly', owned: true, purchasedOn: addDays(today, -705), paidCents: 12900, status: 'inUse', warrantyUntil: addDays(today, 25) }),
    wish({ id: id('w-coffee'), name: 'Coffee machine', kind: 'item', priceCents: 18000, categoryIds: [wc('Home')], brand: 'Brava', owned: true, purchasedOn: addDays(today, -300), paidCents: 17500, giftShare: 50, status: 'inUse', warrantyUntil: addDays(today, 430) }),
    // Bought again after the first pair wore out.
    wish({
      id: id('w-shoes'), name: 'Running shoes', kind: 'item', priceCents: 11000, categoryIds: [wc('Sport'), wc('Apparel')], brand: 'Stride', owned: true,
      purchasedOn: addDays(today, -60), paidCents: 10500, status: 'inUse', warrantyUntil: addDays(today, 670),
      history: [{ purchasedOn: addDays(today, -480), paidCents: 9900, endedOn: addDays(today, -62), end: 'broken' }],
    }),
    // Ended ones: in the Archived tab.
    wish({ id: id('w-blender'), name: 'Blender', kind: 'item', priceCents: 6000, categoryIds: [wc('Home')], owned: true, purchasedOn: addDays(today, -900), paidCents: 5900, status: 'broken', endedOn: addDays(today, -30) }),
    wish({ id: id('w-tablet'), name: 'Old tablet', kind: 'item', priceCents: 30000, categoryIds: [wc('Tech')], owned: true, purchasedOn: addDays(today, -1400), paidCents: 28000, status: 'sold', endedOn: addDays(today, -90) }),
    // A subscription bought through the Wishlist, not paid through Tracking: Upcoming adds it.
    wish({ id: id('w-language'), name: 'Language app', kind: 'subscription', priceCents: 999, categoryIds: [wc('Subscriptions')], owned: true, purchasedOn: dayIn(addMonths(thisMonth, -4), Math.min(todayDay + 9, 28)), paidCents: 999, status: 'inUse', paidFrom: id('education') }),
    wish({ id: id('w-concert'), name: 'Concert tickets', kind: 'experience', priceCents: 9000, categoryIds: [wc('Experiences')], owned: true, purchasedOn: addDays(today, -45), paidCents: 9000, giftShare: 50 }),
  ]

  // Worth: a balance per account each month. The credit card isn't updated yet this month, and neither are the ETF
  // portfolio and the student loan: Update balances works those out from Tracking and the loan's terms.
  // Revolut's main account, its pockets and savings are linked by their statement names, so an import fills them in.
  const last = months.length - 1
  const withLast = (i: number, value: number, lastValue: number) => (i === last ? lastValue : value)
  const accountSeeds: Array<[string, string, AccountKind, (i: number) => number | null, Partial<Account>?]> = [
    ['current', 'Main account', 'bank', () => 1450 + Math.round(random() * 600), { bankName: 'Personal Account' }],
    // This month: the pocket check finds Bills with a little spare, Mind & Fun with plenty, the others to top up.
    ['bills', 'Bills', 'pocket', (i) => withLast(i, 40 + Math.round(random() * 60), 120), { bankName: 'Bills' }],
    ['household', 'Household', 'pocket', () => 60 + Math.round(random() * 140), { bankName: 'Household' }],
    ['mindFun', 'Mind & Fun', 'pocket', (i) => withLast(i, 20 + Math.round(random() * 120), 420), { bankName: 'Mind & Fun' }],
    ['gearGifts', 'Gear & Gifts', 'pocket', (i) => (i % 2 ? 35 : 90), { bankName: 'Gear & Gifts' }],
    ['savings', 'Instant Access', 'savings', (i) => 3000 + i * 300 - (i >= 3 ? 425 : 0), { bankName: 'Savings' }],
    ['etf', 'ETF portfolio', 'investment', (i) => (i === last ? null : Math.round(6200 + i * 495 + (random() - 0.4) * 500)), { categoryId: id('etf') }],
    ['pension', 'Pension', 'investment', (i) => 11800 + i * 60, { categoryId: id('pension') }],
    ['bike', 'Bike', 'valuable', (i) => 650 - i * 10],
    // Paid through Tracking: Upcoming leaves its payment to Tracking.
    ['studentLoan', 'Student loan', 'loan', (i) => (i === last ? null : 14800 - i * 120), { categoryId: id('loanPayment'), loan: { ratePct: 2.5, paymentCents: 15000, day: 25 } }],
    // Not in Tracking: Upcoming shows its payment from Worth.
    ['laptop', 'Laptop instalments', 'otherOwe', (i) => 550 - i * 50, { loan: { ratePct: 0, paymentCents: 5000, day: 15 } }],
    ['card', 'Credit card', 'card', (i) => (i === last ? null : [120, 310, 85, 460, 240][i]!)],
  ]
  const accounts: Account[] = accountSeeds.map(([key, name, kind, , extra], order) => ({ id: id(`acc-${key}`), name, kind, order, ...extra }))
  const balances: Balance[] = []
  for (const [key, , , value] of accountSeeds) {
    for (const [i, m] of months.entries()) {
      const euros = value(i)
      if (euros !== null) balances.push({ id: balanceId(id(`acc-${key}`), m), accountId: id(`acc-${key}`), month: m, cents: euros * 100 })
    }
  }

  // Playground: a few pretend weeks from this one on.
  const thisWeek = weekStartOf(today, 1)
  const labEntries: LabEntry[] = []
  for (let w = 0; w < 4; w++) {
    const week = addDays(thisWeek, w * 7)
    const entry = (key: string, cents: number, formula?: string) =>
      labEntries.push({ id: `${id(key)}|${week}`, categoryId: id(key), week, cents, ...(formula ? { formula } : {}) })
    entry('groceries', 7000 + w * 500)
    entry('eatingOut', w === 2 ? 9500 : 3000, w === 2 ? '35+60' : undefined)
    entry('transport', 2000)
    if (w === 1) entry('salary', 80000)
  }
  const labNotes: LabNote[] = [{ week: addDays(thisWeek, 14), text: 'Weekend away', span: 2 }]

  const settings = {
    ...DEFAULT_SETTINGS,
    key: 'app',
    startingYear: startYear,
    startingMonth: startMonth,
    pluginWishlist: true,
    pluginWorth: true,
    pluginPlayground: true,
    labStartCents: 40000,
    labFirstWeek: thisWeek,
  }

  return {
    app: 'pulse',
    format: 1,
    exportedAt: new Date(`${today}T12:00:00Z`).toISOString(),
    tables: {
      settings: [settings],
      categories,
      tags,
      budgetCells,
      transactions,
      pockets,
      skippedImports: [],
      skippedRecurring: [],
      imports,
      merchantRules: [{ merchant: 'fithub gym', categoryId: id('gym') }],
      labEntries,
      labNotes,
      wishItems,
      wishCategories,
      upcomingItems,
      upcomingOverrides,
      accounts,
      balances,
    },
  }
}

/** Replaces everything in Pulse with the demo. */
export async function loadDemo(today: string, db: PulseDB = defaultDb): Promise<void> {
  await restoreBackup(demoBackup(today), db)
}
