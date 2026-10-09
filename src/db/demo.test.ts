import { expect, it } from 'vitest'
import { brokenParents } from '../domain/categories'
import { flagOf, upcomingEvents } from '../domain/upcoming'
import { suggestBalance } from '../domain/worth'
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
      items: await db.upcomingItems.toArray(),
      overrides: await db.upcomingOverrides.toArray(),
      settings,
      accounts,
      balances,
    },
    today,
  )
  const flags = new Set(events.map((e) => flagOf(e, today)))
  for (const flag of ['priceUp', 'cancelSoon', 'warrantySoon', 'dueSoon']) expect(flags).toContain(flag)
  const sources = new Set(events.map((e) => e.source))
  for (const source of ['planner', 'tracking', 'subscription', 'warranty', 'loan', 'own']) expect(sources).toContain(source)
  // A loan paid through Tracking shows once, from Tracking.
  expect(events.filter((e) => e.name.startsWith('Student loan') && !e.done)).toHaveLength(1)
  // Worth: own and owe accounts, each with a balance in the first month.
  expect(accounts.length).toBeGreaterThan(3)
  expect(accounts.every((a) => balances.some((b) => b.accountId === a.id))).toBe(true)
  // Update balances works out this month's ETF portfolio from Tracking, and the student loan from its terms.
  const month = today.slice(0, 7)
  const from = (name: string) => suggestBalance(accounts.find((a) => a.name === name)!, balances, month, transactions, categories)?.from
  expect(from('ETF portfolio')).toBe('tracking')
  expect(from('Student loan')).toBe('loan')
  // A monthly bill that hasn't come yet this month.
  expect(events.some((e) => e.name === 'FiberNet internet' && !e.done && e.date < today)).toBe(today.slice(8) > '03')
})

it('is the same every time', () => {
  expect(JSON.stringify(demoBackup('2026-10-09'))).toBe(JSON.stringify(demoBackup('2026-10-09')))
})
