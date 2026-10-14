import { expect, it } from 'vitest'
import { brokenParents } from '../domain/categories'
import { flagOf, upcomingEvents } from '../domain/upcoming'
import { pocketTopUps } from '../domain/topups'
import { pocketStatements, suggestBalance } from '../domain/worth'
import { pocketBudgets } from '../domain/pocketBudgets'
import { wishAffordability, wishTiming } from '../domain/wishTiming'
import { ensureInitialised, getSettings } from './actions'
import { PulseDB } from './db'
import { demoBackup, loadDemo } from './demo'

it.each(['2026-10-09', '2026-01-02', '2026-12-31', '2027-03-28'])('loads and shows every kind of line on %s', async (today) => {
  const db = new PulseDB(`demo-${today}`)
  await ensureInitialised(db)
  await loadDemo(today, db)
  const settings = await getSettings(db)
  expect(settings.pluginWishlist).toBe(true)
  const categories = await db.categories.toArray()
  expect(brokenParents(categories)).toEqual([])
  const transactions = await db.transactions.toArray()
  expect(transactions.every((t) => t.date <= today)).toBe(true)
  // Every line points at a category that exists.
  const ids = new Set(categories.map((c) => c.id))
  expect(transactions.every((t) => t.categoryId === null || ids.has(t.categoryId))).toBe(true)

  const accounts = await db.accounts.toArray()
  const balances = await db.balances.toArray()
  const events = upcomingEvents(
    {
      categories,
      cells: await db.budgetCells.toArray(),
      transactions,
      wishes: await db.wishItems.toArray(),
      resale: await db.resaleItems.toArray(),
      items: await db.upcomingItems.toArray(),
      overrides: await db.upcomingOverrides.toArray(),
      settings,
      accounts,
      balances,
    },
    today,
  )
  const flags = new Set(events.map((e) => flagOf(e, today)))
  for (const flag of ['priceUp', 'cancelSoon', 'warrantySoon', 'dueSoon', 'readySoon', 'resaleSoon']) expect(flags).toContain(flag)
  const sources = new Set(events.map((e) => e.source))
  for (const source of ['planner', 'tracking', 'subscription', 'warranty', 'loan', 'wishlist', 'resale', 'own']) expect(sources).toContain(source)
  // A loan paid through Tracking shows once, from Tracking.
  expect(events.filter((e) => e.name.startsWith('Student loan') && !e.done)).toHaveLength(1)
  // Worth: own and owe accounts, each with a balance in the first month.
  expect(accounts.length).toBeGreaterThan(3)
  expect(accounts.every((a) => balances.some((b) => b.accountId === a.id))).toBe(true)
  // Over time has about two and a half years of history to show.
  expect(new Set(balances.map((b) => b.month)).size).toBeGreaterThanOrEqual(30)
  // Update balances works out this month's ETF portfolio from Tracking, and the student loan from its terms.
  const month = today.slice(0, 7)
  const from = (name: string) => suggestBalance(accounts.find((a) => a.name === name)!, balances, month, transactions, categories)?.from
  expect(from('ETF portfolio')).toBe('tracking')
  expect(from('Student loan')).toBe('loan')
  // Wealth: every pocket has this month's statement, and start + put in − paid out = in it now.
  const pockets = await db.pockets.toArray()
  const statements = pocketStatements(pockets, accounts, balances, transactions, month)
  expect(statements.length).toBe(4)
  for (const st of statements) {
    expect(st.month).toBe(month)
    expect(st.startCents! + st.inCents! - st.outCents).toBe(st.nowCents)
  }
  // Dashboard: every pocket has a budget, and Mind & Fun carries a leftover over.
  const cells = await db.budgetCells.toArray()
  const budgets = pocketBudgets(pockets, categories, cells, transactions, settings, month)
  expect(budgets.every((p) => p.budgetCents > 0)).toBe(true)
  expect(budgets.find((p) => p.pocket === 'Mind & Fun')!.carriedCents).toBeGreaterThan(0)
  expect(budgets.find((p) => p.pocket === 'Bills')).toMatchObject({ leftovers: 'reset', carriedCents: 0 })
  // Upcoming shows the payday top-ups: always for a pocket that carries over, for the others only what's missing.
  const topUps = pocketTopUps({ pockets, accounts, balances, categories, cells, transactions, settings }, today)
  expect(topUps.map((t) => t.pocket)).toContain('Mind & Fun')
  expect(topUps.every((t) => t.cents > 0)).toBe(true)
  // Wishlist: a wish waiting, one ready, and each kind of affordability.
  const wishes = (await db.wishItems.toArray()).filter((w) => !w.owned)
  const timings = wishes.map((w) => wishTiming(w, today))
  expect(timings.some((t) => t && !t.ready)).toBe(true)
  expect(timings.some((t) => t?.ready)).toBe(true)
  const affords = wishAffordability(await db.wishItems.toArray(), { categories, cells, transactions, settings, accounts, balances }, today)
  const states = new Set(wishes.map((w) => affords.get(w.id)?.state))
  for (const state of ['now', 'later', 'over']) expect(states).toContain(state)
  // Resale: something at every step, both nudges, and a sale that reached Tracking.
  const resale = await db.resaleItems.toArray()
  expect(new Set(resale.map((r) => r.status))).toEqual(new Set(['toPost', 'posted', 'reserved', 'sold', 'given']))
  expect(new Set(events.filter((e) => e.source === 'resale').map((e) => e.nudge))).toEqual(new Set(['post', 'lower']))
  const sold = resale.find((r) => r.status === 'sold')!
  expect(transactions.find((t) => t.id === sold.transactionId)).toMatchObject({ block: 'income', cents: sold.soldCents })
  // A monthly bill that hasn't come yet this month.
  expect(events.some((e) => e.name === 'FiberNet internet' && !e.done && e.date < today)).toBe(today.slice(8) > '03')
})

it('is the same every time', () => {
  expect(JSON.stringify(demoBackup('2026-10-09'))).toBe(JSON.stringify(demoBackup('2026-10-09')))
})
