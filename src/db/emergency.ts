import { EMPTY_SHEET, type EmergencyContact, type EmergencySheet } from '../domain/emergency'
import { getSettings, updateSettings } from './actions'
import { db as defaultDb, type PulseDB } from './db'

const newId = () => crypto.randomUUID()

async function change(edit: (sheet: EmergencySheet) => EmergencySheet, db: PulseDB): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const sheet = (await getSettings(db)).emergency ?? EMPTY_SHEET
    await updateSettings({ emergency: edit(sheet) }, db)
  })
}

/** Adds someone to call, or saves changes to them. */
export async function saveContact(input: Omit<EmergencyContact, 'id' | 'reach'> & { id?: string }, db: PulseDB = defaultDb): Promise<string> {
  const name = input.name.trim()
  if (!name) throw new Error('Type their name.')
  const phone = input.phone?.trim()
  const email = input.email?.trim()
  if (!phone && !email) throw new Error('Add a phone number or an email, so they can be reached.')
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('That email doesn’t look right.')
  const id = input.id ?? newId()
  const contact: EmergencyContact = { id, name }
  const role = input.role?.trim()
  if (role) contact.role = role
  if (phone) contact.phone = phone
  if (email) contact.email = email
  await change((s) => ({ ...s, contacts: s.contacts.some((c) => c.id === id) ? s.contacts.map((c) => (c.id === id ? contact : c)) : [...s.contacts, contact] }), db)
  return id
}

export async function deleteContact(id: string, db: PulseDB = defaultDb): Promise<void> {
  await change((s) => ({ ...s, contacts: s.contacts.filter((c) => c.id !== id) }), db)
}

/** Where papers, keys and documents are kept; empty clears it. */
export async function setWhereThings(text: string, db: PulseDB = defaultDb): Promise<void> {
  await change((s) => {
    const { whereThings: _w, ...rest } = s
    return text.trim() ? { ...rest, whereThings: text.trim() } : rest
  }, db)
}

/** Notes that the sheet is still right; Upcoming reminds you again six months later. */
export async function markChecked(day: string, db: PulseDB = defaultDb): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Pick the day you checked it.')
  await change((s) => ({ ...s, checkedOn: day }), db)
}

/** How someone else gets to an account; empty clears it. */
export async function setAccountAccess(id: string, text: string, db: PulseDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.accounts, async () => {
    const account = await db.accounts.get(id)
    if (!account) throw new Error('That account no longer exists.')
    const { access: _a, ...rest } = account
    await db.accounts.put(text.trim() ? { ...rest, access: text.trim() } : rest)
  })
}
