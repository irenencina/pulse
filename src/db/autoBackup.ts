import { useEffect, useState } from 'react'
import { backupDue } from '../domain/backupPlan'
import { getSettings } from './actions'
import { backupFileName, createBackup } from './backup'

/**
 * Backups that happen by themselves: a folder chosen once (a cloud drive's folder is a good
 * choice) gets a dated backup file whenever one is due, while Pulse is open. Browsers that can't
 * write to a folder (phones, Firefox, Safari) get a reminder in Upcoming instead.
 */

const LAST_BACKUP = 'pulse.lastBackup'
const CHANGED = 'pulse-backup-changed'

/** The day of the last backup from this browser ("YYYY-MM-DD"), or null. */
export function lastBackup(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP)
  } catch {
    return null
  }
}

export function noteBackup(day: string): void {
  try {
    localStorage.setItem(LAST_BACKUP, day)
  } catch {
    // Only a reminder; nothing is lost without it.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGED))
}

/** The last backup's day, kept up to date when one is made anywhere in Pulse. */
export function useLastBackup(): string | null {
  const [last, setLast] = useState(lastBackup)
  useEffect(() => {
    const update = () => setLast(lastBackup())
    window.addEventListener(CHANGED, update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener(CHANGED, update)
      window.removeEventListener('storage', update)
    }
  }, [])
  return last
}

type Permission = 'granted' | 'denied' | 'prompt'
interface FolderHandle {
  name: string
  queryPermission(o: { mode: 'readwrite' }): Promise<Permission>
  requestPermission(o: { mode: 'readwrite' }): Promise<Permission>
  getFileHandle(name: string, o: { create: true }): Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }>
}
type Picker = (o: { id?: string; mode: 'readwrite'; startIn?: string }) => Promise<FolderHandle>

/** True where Pulse can save into a folder by itself (Chrome and Edge on a computer). */
export function canUseFolder(): boolean {
  try {
    return typeof (window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker === 'function' && window.top === window
  } catch {
    return false
  }
}

// The folder lives in its own small database: it can't go into a backup file, and it belongs to this browser only.
const STORE = 'handles'
function handles(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('pulse-files', 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE)
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
  })
}

async function stored<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await handles()
  return new Promise<T>((resolve, reject) => {
    const request = act(db.transaction(STORE, mode).objectStore(STORE))
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error)
  }).finally(() => db.close())
}

export async function backupFolder(): Promise<FolderHandle | null> {
  if (!canUseFolder()) return null
  try {
    return (await stored<FolderHandle | undefined>('readonly', (s) => s.get('backupFolder'))) ?? null
  } catch {
    return null
  }
}

/** Asks which folder backups go into. Returns its name, or null when the person cancelled. */
export async function chooseBackupFolder(): Promise<string | null> {
  const pick = (window as unknown as { showDirectoryPicker: Picker }).showDirectoryPicker
  let folder: FolderHandle
  try {
    folder = await pick({ id: 'pulse-backups', mode: 'readwrite', startIn: 'documents' })
  } catch {
    return null
  }
  await stored('readwrite', (s) => s.put(folder, 'backupFolder'))
  window.dispatchEvent(new Event(CHANGED))
  return folder.name
}

export async function forgetBackupFolder(): Promise<void> {
  await stored('readwrite', (s) => s.delete('backupFolder'))
  window.dispatchEvent(new Event(CHANGED))
}

const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

async function writeTo(folder: FolderHandle): Promise<void> {
  const blob = new Blob([JSON.stringify(await createBackup(), null, 1)], { type: 'application/json' })
  const file = await folder.getFileHandle(backupFileName(), { create: true })
  const out = await file.createWritable()
  await out.write(blob)
  await out.close()
  noteBackup(today())
}

/**
 * Saves a backup into the chosen folder now. `ask` may show the browser's "let Pulse edit
 * this folder?" question, so only pass it from a click. Returns false when there's no folder or
 * the browser didn't allow it.
 */
export async function saveToFolder(ask: boolean): Promise<boolean> {
  const folder = await backupFolder()
  if (!folder) return false
  let allowed = await folder.queryPermission({ mode: 'readwrite' })
  if (allowed === 'prompt' && ask) allowed = await folder.requestPermission({ mode: 'readwrite' })
  if (allowed !== 'granted') return false
  await writeTo(folder)
  return true
}

/** When a backup is due and the folder may be written to without asking, saves it. */
export async function backupIfDue(): Promise<void> {
  const settings = await getSettings()
  if (!backupDue(settings.backupEvery, lastBackup(), today())) return
  await saveToFolder(false).catch(() => false)
}

/** Checks on opening, then every hour and whenever Pulse comes back into view. */
export function useAutoBackup(): void {
  useEffect(() => {
    if (!canUseFolder()) return
    const check = () => void backupIfDue()
    check()
    const timer = setInterval(check, 60 * 60 * 1000)
    const visible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', visible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [])
}

/** The chosen folder's name (null when none), kept up to date. */
export function useBackupFolder(): string | null {
  const [name, setName] = useState<string | null>(null)
  useEffect(() => {
    const update = () => void backupFolder().then((f) => setName(f?.name ?? null))
    update()
    window.addEventListener(CHANGED, update)
    return () => window.removeEventListener(CHANGED, update)
  }, [])
  return name
}
