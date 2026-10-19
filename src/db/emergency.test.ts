import { beforeEach, expect, it } from 'vitest'
import { ensureInitialised, getSettings } from './actions'
import { PulseDB } from './db'
import { checkIn, deleteContact, saveContact, setAccountAccess, setWhereThings } from './emergency'
import { saveAccount } from './worth'

let db: PulseDB
let n = 0
beforeEach(async () => {
  db = new PulseDB(`emergency-${n++}`)
  await ensureInitialised(db)
})

it('keeps contacts, notes and the last check', async () => {
  await expect(saveContact({ name: '  ', phone: '1' }, db)).rejects.toThrow('name')
  // At least a phone or an email.
  await expect(saveContact({ name: 'Sam', phone: ' ', email: '' }, db)).rejects.toThrow('phone number or an email')
  await expect(saveContact({ name: 'Sam', email: 'sam@' }, db)).rejects.toThrow('email')
  const id = await saveContact({ name: ' Sam ', role: 'Sister', email: 'sam@example.com' }, db)
  await saveContact({ id, name: 'Sam Rivera', role: 'Sister', phone: '+34 600', email: '' }, db)
  const other = await saveContact({ name: 'Insurer', email: 'claims@example.com' }, db)
  await deleteContact(other, db)
  await setWhereThings('  Blue folder  ', db)
  const snapshot = { accounts: [{ id: 'a', name: 'Bank' }], bills: [{ key: 'own:gym', name: 'Gym' }] }
  await checkIn('2026-10-16', '09:30', snapshot, db)
  expect((await getSettings(db)).emergency).toEqual({ contacts: [{ id, name: 'Sam Rivera', role: 'Sister', phone: '+34 600' }], whereThings: 'Blue folder', checkedOn: '2026-10-16', checkedAt: '09:30', snapshot })
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
