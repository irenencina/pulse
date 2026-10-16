import { EMPTY_SHEET, PIN_PATTERN, sheetBills, snapshotOf, type EmergencyContact, type EmergencySheet, type SheetSnapshot } from '../domain/emergency'
import { upcomingEvents } from '../domain/upcoming'
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

async function hashPin(pin: string, salt: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Sets the PIN that unlocks editing. Only a salted hash is kept. */
export async function setPin(pin: string, repeat: string, db: PulseDB = defaultDb): Promise<void> {
  if (!PIN_PATTERN.test(pin)) throw new Error('Use 4 to 6 digits.')
  if (pin !== repeat) throw new Error('The two PINs don’t match.')
  const pinSalt = newId()
  const pinHash = await hashPin(pin, pinSalt)
  await change((s) => ({ ...s, pinSalt, pinHash }), db)
}

/** True when there's no PIN yet, or `pin` is it. */
export async function checkPin(pin: string, db: PulseDB = defaultDb): Promise<boolean> {
  const sheet = (await getSettings(db)).emergency
  if (!sheet?.pinHash || !sheet.pinSalt) return true
  return (await hashPin(pin, sheet.pinSalt)) === sheet.pinHash
}

/** "Forgot PIN": takes the PIN away, and notes the day so the owner can tell. */
export async function resetPin(day: string, db: PulseDB = defaultDb): Promise<void> {
  await change((s) => {
    const { pinHash: _h, pinSalt: _s, ...rest } = s
    return { ...rest, pinResetOn: day }
  }, db)
}

/** Done editing: the sheet counts as checked today, and what's on it is noted to tell what changes next. */
export async function checkIn(day: string, snapshot: SheetSnapshot, db: PulseDB = defaultDb): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Pick the day you checked it.')
  await change((s) => ({ ...s, checkedOn: day, snapshot }), db)
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

/** The accounts and bills on the sheet today, noted the way a check notes them. */
export async function sheetSnapshot(today: string, db: PulseDB = defaultDb): Promise<SheetSnapshot> {
  const settings = await getSettings(db)
  const accounts = await db.accounts.toArray()
  const events = upcomingEvents(
    {
      categories: await db.categories.toArray(),
      cells: await db.budgetCells.toArray(),
      transactions: await db.transactions.toArray(),
      wishes: settings.pluginWishlist ? await db.wishItems.toArray() : [],
      items: await db.upcomingItems.toArray(),
      overrides: await db.upcomingOverrides.toArray(),
      settings,
      accounts,
      balances: await db.balances.toArray(),
    },
    today,
  )
  return snapshotOf(accounts, sheetBills(events, accounts))
}
