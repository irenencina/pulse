import type { ResalePhoto } from '../domain/resale'
import { db as defaultDb, type PulseDB } from './db'

export type { ResalePhoto }

/** A photo as the editor holds it: one already saved keeps its id. */
export type PhotoDraft = Pick<ResalePhoto, 'name' | 'dataUrl'> & { id?: string }

const newId = () => crypto.randomUUID()

/** An item's photos, in order. */
export async function photosOf(itemId: string, db: PulseDB = defaultDb): Promise<ResalePhoto[]> {
  return (await db.resalePhotos.where('itemId').equals(itemId).toArray()).sort((a, b) => a.order - b.order)
}

/** Saves an item's photos as the editor shows them: in this order, and only these. */
export async function setPhotos(itemId: string, photos: PhotoDraft[], db: PulseDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.resalePhotos, async () => {
    await db.resalePhotos.where('itemId').equals(itemId).delete()
    await db.resalePhotos.bulkAdd(photos.map((p, order) => ({ id: p.id ?? newId(), itemId, order, name: p.name, dataUrl: p.dataUrl })))
  })
}

/** Adds photos after the ones an item already has. */
export async function addPhotos(itemId: string, photos: PhotoDraft[], db: PulseDB = defaultDb): Promise<void> {
  const current = await photosOf(itemId, db)
  await setPhotos(itemId, [...current, ...photos], db)
}

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg' }

/** A safe folder or file name: no characters Windows refuses. */
export const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Photos'

/** "Winter boots 1.jpg", "Winter boots 2.jpg": names that keep the order, safe for any folder. */
export function photoFileNames(itemName: string, photos: Pick<ResalePhoto, 'dataUrl'>[]): string[] {
  const base = safeName(itemName)
  return photos.map((p, i) => `${base} ${i + 1}.${EXTENSIONS[p.dataUrl.slice(5, p.dataUrl.indexOf(';'))] ?? 'jpg'}`)
}
