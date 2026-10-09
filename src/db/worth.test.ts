import { expect, it } from 'vitest'
import { PulseDB } from './db'
import { deleteAccount, saveAccount, setBalances } from './worth'

let n = 0
const fresh = () => new PulseDB(`worth-${n++}`)

it('adds an account with its balance, updates a month and deletes it with its history', async () => {
  const db = fresh()
  const id = await saveAccount({ name: ' Bank ', kind: 'bank', startCents: 50000, month: '2026-10' }, undefined, db)
  expect((await db.accounts.get(id))?.name).toBe('Bank')
  expect((await db.balances.get(`${id}|2026-10`))?.cents).toBe(50000)
  await setBalances('2026-11', [{ accountId: id, cents: 60000 }], db)
  await setBalances('2026-10', [{ accountId: id, cents: null }], db)
  expect((await db.balances.toArray()).map((x) => x.month)).toEqual(['2026-11'])
  await deleteAccount(id, db)
  expect(await db.accounts.count()).toBe(0)
  expect(await db.balances.count()).toBe(0)
})

it('refuses a name left empty and a balance below zero', async () => {
  const db = fresh()
  await expect(saveAccount({ name: ' ', kind: 'bank' }, undefined, db)).rejects.toThrow('name')
  await expect(saveAccount({ name: 'Loan', kind: 'loan', startCents: -5, month: '2026-10' }, undefined, db)).rejects.toThrow('minus')
  await expect(setBalances('2026-10', [{ accountId: 'x', cents: -1 }], db)).rejects.toThrow('minus')
})
