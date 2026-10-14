import { useRef, useState } from 'react'
import { PlusIcon } from '../../components/icons'
import type { PhotoDraft } from '../../db/photos'
import { fileToSmallImage } from '../wishlist/images'

/** Photos are kept at most this many pixels wide or tall: sharp on any site, small enough for the browser. */
export const PHOTO_SIZE = 2000

/** Reads picked or dropped photo files, made a sensible size. */
export const readPhotos = (files: File[]): Promise<PhotoDraft[]> =>
  Promise.all(files.filter((f) => f.type.startsWith('image/')).map(async (f) => ({ name: f.name, dataUrl: await fileToSmallImage(f, PHOTO_SIZE, 0.9) })))

/**
 * A thing's photos in a row: add from the computer or the phone's camera and gallery, drag to
 * change the order (the first is the cover), × to remove.
 */
export default function PhotoStrip({ photos, onChange }: { photos: PhotoDraft[]; onChange: (photos: PhotoDraft[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [dropping, setDropping] = useState(false)
  const add = async (files: File[]) => onChange([...photos, ...(await readPhotos(files))])
  const move = (from: number, to: number) => {
    const next = photos.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved!)
    onChange(next)
  }
  return (
    <div
      className={`photo-strip${dropping ? ' dropping' : ''}`}
      onDragOver={(e) => {
        if (dragging !== null || !e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDropping(true)
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        if (dragging !== null || e.dataTransfer.files.length === 0) return
        e.preventDefault()
        setDropping(false)
        void add([...e.dataTransfer.files])
      }}
    >
      {photos.map((p, i) => (
        <figure
          key={p.id ?? p.dataUrl.slice(-40) + i}
          className={`photo-tile${dragging === i ? ' moving' : ''}`}
          draggable
          title={i === 0 ? 'The cover: shown on the card. Drag to change the order.' : 'Drag to change the order'}
          onDragStart={(e) => {
            setDragging(i)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragEnd={() => setDragging(null)}
          onDragOver={(e) => {
            if (dragging === null) return
            e.preventDefault()
            if (dragging !== i) {
              move(dragging, i)
              setDragging(i)
            }
          }}
          onDrop={(e) => e.preventDefault()}
        >
          <img src={p.dataUrl} alt={p.name} draggable={false} />
          {i === 0 && <figcaption>Cover</figcaption>}
          <button type="button" className="photo-remove" aria-label={`Remove photo ${i + 1}`} title="Remove" onClick={() => onChange(photos.filter((_, j) => j !== i))}>
            ×
          </button>
        </figure>
      ))}
      <button type="button" className="photo-add" title="Add photos: from your files, or the camera and gallery on a phone" onClick={() => input.current?.click()}>
        <PlusIcon />
        <span>Add photos</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void add([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
    </div>
  )
}
