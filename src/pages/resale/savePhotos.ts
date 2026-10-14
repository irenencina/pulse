import { db } from '../../db/db'
import { photoFileNames, safeName, type ResalePhoto } from '../../db/photos'
import { dataUrlBytes, zipFiles } from '../../domain/zip'

const FOLDER_KEY = 'resalePhotos'

type DirectoryPicker = (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
type WithPermission = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>
}

const picker = () => (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker

/** Whether this browser can save into a folder you pick (Chrome and Edge on a computer). */
export const canUseFolder = () => typeof picker() === 'function' && window.self === window.top

/** The folder photos are saved into, if one was picked. */
export async function photoFolder(): Promise<FileSystemDirectoryHandle | undefined> {
  return (await db.folders.get(FOLDER_KEY))?.handle
}

/** Asks for the folder to keep Resale photos in; each thing gets its own folder inside it. */
export async function pickPhotoFolder(): Promise<FileSystemDirectoryHandle> {
  const handle = await picker()!({ id: 'pulse-resale', mode: 'readwrite' })
  await db.folders.put({ key: FOLDER_KEY, handle })
  return handle
}

async function writable(handle: WithPermission): Promise<boolean> {
  if ((await handle.queryPermission?.({ mode: 'readwrite' })) === 'granted') return true
  return (await handle.requestPermission?.({ mode: 'readwrite' })) === 'granted'
}

/**
 * Saves a thing's photos, named in order: into its own folder inside your photos folder when the
 * browser allows it, otherwise as one .zip download. Says where they went.
 */
export async function savePhotos(itemName: string, photos: ResalePhoto[]): Promise<string> {
  const names = photoFileNames(itemName, photos)
  if (canUseFolder()) {
    try {
      let root = await photoFolder()
      if (!root || !(await writable(root))) root = await pickPhotoFolder()
      const folder = await root.getDirectoryHandle(safeName(itemName), { create: true })
      for (const [i, photo] of photos.entries()) {
        const file = await folder.getFileHandle(names[i]!, { create: true })
        const out = await file.createWritable()
        await out.write(dataUrlBytes(photo.dataUrl))
        await out.close()
      }
      return `Saved in ${root.name}/${folder.name}`
    } catch (e) {
      // Closing the folder picker is a no.
      if (e instanceof DOMException && e.name === 'AbortError') throw new Error('No folder picked, so nothing was saved.')
      // Anything else: fall back to a download.
    }
  }
  const zip = zipFiles(photos.map((p, i) => ({ name: names[i]!, bytes: dataUrlBytes(p.dataUrl) })))
  const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName(itemName)}.zip`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return `Downloaded ${a.download}`
}
