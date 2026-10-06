import { imageFromDrop } from '../../domain/wishlist'

/** A picture file made small enough to keep in the browser: at most 480 px wide or tall. */
export async function fileToSmallImage(file: File, max = 480): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.82)
}

/** The picture in something dropped or pasted: an image file, or a picture or link copied from a web page. */
export async function imageFromTransfer(data: DataTransfer): Promise<string | null> {
  const file = [...data.files].find((f) => f.type.startsWith('image/'))
  if (file) return fileToSmallImage(file)
  return imageFromDrop(data.getData('text/uri-list'), data.getData('text/html'), data.getData('text/plain'))
}
