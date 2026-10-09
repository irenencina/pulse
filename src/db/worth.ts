import type { MonthKey } from '../domain/periods'
import { balanceId, sideOf, type Account, type AccountKind } from '../domain/worth'
import { db as defaultDb, type PulseDB } from './db'

/** Adds an account (with its balance this month, if given), or renames it or changes what it is. */
export async function saveAccount(
  input: { name: string; kind: AccountKind; startCents?: number | null; month?: MonthKey },
  id?: string,
  db: PulseDB = defaultDb,
): Promise<string> {
  const name = input.name.trim()
  if (!name) throw new Error('Give it a name.')
  if (input.startCents !== undefined && input.startCents !== null && input.startCents < 0) throw new Error('Type the balance without a minus: whether it is owed comes from its type.')
  return db.transaction('rw', db.accounts, db.balances, async () => {
    if (id) {
      const current = await db.accounts.get(id)
      if (!current) throw new Error('That account no longer exists.')
      // Moving to the other side puts it at the end of that list.
      const moved = sideOf(current.kind) !== sideOf(input.kind)
      const order = moved ? await nextOrder(db) : current.order
      await db.accounts.put({ ...current, name, kind: input.kind, order })
      return id
    }
    const account: Account = { id: crypto.randomUUID(), name, kind: input.kind, order: await nextOrder(db) }
    await db.accounts.add(account)
    if (input.startCents !== undefined && input.startCents !== null && input.month) {
      await db.balances.put({ id: balanceId(account.id, input.month), accountId: account.id, month: input.month, cents: input.startCents })
    }
    return account.id
  })
}

async function nextOrder(db: PulseDB): Promise<number> {
  const last = await db.accounts.orderBy('order').last()
  return (last?.order ?? -1) + 1
}

/** Removes an account and every balance noted for it. */
export async function deleteAccount(id: string, db: PulseDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.accounts, db.balances, async () => {
    await db.balances.where('accountId').equals(id).delete()
    await db.accounts.delete(id)
  })
}

/** Notes the balances of a month at once; null clears an account's balance for that month. */
export async function setBalances(month: MonthKey, entries: Array<{ accountId: string; cents: number | null }>, db: PulseDB = defaultDb): Promise<void> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Pick the month.')
  for (const e of entries) if (e.cents !== null && (!Number.isFinite(e.cents) || e.cents < 0)) throw new Error('Type each balance without a minus.')
  await db.transaction('rw', db.balances, async () => {
    for (const e of entries) {
      const id = balanceId(e.accountId, month)
      if (e.cents === null) await db.balances.delete(id)
      else await db.balances.put({ id, accountId: e.accountId, month, cents: e.cents })
    }
  })
}
