import { expect, it } from 'vitest'
import { brokenParents } from '../domain/categories'
import { flagOf, upcomingEvents } from '../domain/upcoming'
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

  const events = upcomingEvents(
    {
      categories,
      cells: await db.budgetCells.toArray(),
      transactions,
      wishes: await db.wishItems.toArray(),
      items: await db.upcomingItems.toArray(),
      overrides: await db.upcomingOverrides.toArray(),
      settings,
    },
    today,
  )
  const flags = new Set(events.map((e) => flagOf(e, today)))
  for (const flag of ['priceUp', 'cancelSoon', 'warrantySoon', 'dueSoon']) expect(flags).toContain(flag)
  const sources = new Set(events.map((e) => e.source))
  for (const source of ['planner', 'tracking', 'subscription', 'warranty', 'own']) expect(sources).toContain(source)
  // Worth: own and owe accounts, each with a balance in the first month.
  const accounts = await db.accounts.toArray()
  const balances = await db.balances.toArray()
  expect(accounts.length).toBeGreaterThan(3)
  expect(accounts.every((a) => balances.some((b) => b.accountId === a.id))).toBe(true)
  // A monthly bill that hasn't come yet this month.
  expect(events.some((e) => e.name === 'FiberNet internet' && !e.done && e.date < today)).toBe(today.slice(8) > '03')
})

it('is the same every time', () => {
  expect(JSON.stringify(demoBackup('2026-10-09'))).toBe(JSON.stringify(demoBackup('2026-10-09')))
})
