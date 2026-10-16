import { beforeEach, expect, it } from 'vitest'
import { ensureInitialised, getSettings } from './actions'
import { PulseDB } from './db'
import { deleteContact, markChecked, saveContact, setAccountAccess, setWhereThings } from './emergency'
import { saveAccount } from './worth'

let db: PulseDB
let n = 0
beforeEach(async () => {
  db = new PulseDB(`emergency-${n++}`)
  await ensureInitialised(db)
})

it('keeps contacts, notes and the last check', async () => {
  await expect(saveContact({ name: '  ' }, db)).rejects.toThrow('name')
  const id = await saveContact({ name: ' Sam ', role: 'Sister', reach: '' }, db)
  await saveContact({ id, name: 'Sam Rivera', role: 'Sister', reach: '+34 600' }, db)
  const other = await saveContact({ name: 'Insurer' }, db)
  await deleteContact(other, db)
  await setWhereThings('  Blue folder  ', db)
  await markChecked('2026-10-16', db)
  expect((await getSettings(db)).emergency).toEqual({ contacts: [{ id, name: 'Sam Rivera', role: 'Sister', reach: '+34 600' }], whereThings: 'Blue folder', checkedOn: '2026-10-16' })
  await setWhereThings('', db)
  expect((await getSettings(db)).emergency!.whereThings).toBeUndefined()
})

it('notes how to get to an account, and editing the account keeps it', async () => {
  const id = await saveAccount({ name: 'Bank', kind: 'bank' }, undefined, db)
  await setAccountAccess(id, 'App on my phone', db)
  await saveAccount({ name: 'Main bank', kind: 'bank' }, id, db)
  expect(await db.accounts.get(id)).toMatchObject({ name: 'Main bank', access: 'App on my phone' })
  await setAccountAccess(id, ' ', db)
  expect((await db.accounts.get(id))!.access).toBeUndefined()
})
