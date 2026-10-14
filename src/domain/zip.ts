/** A plain .zip file (stored, not compressed: photos are compressed already) holding the given files. */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export function zipFiles(files: Array<{ name: string; bytes: Uint8Array }>): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    const crc = crc32(file.bytes)
    const size = file.bytes.length
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    // Bit 11: the name is UTF-8.
    lv.setUint16(6, 0x0800, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    locals.push(local, file.bytes)
    centrals.push(central)
    offset += local.length + size
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  const parts = [...locals, ...centrals, end]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** The bytes in a data link ("data:image/jpeg;base64,…" or a percent-encoded one). */
export function dataUrlBytes(dataUrl: string): Uint8Array<ArrayBuffer> {
  const comma = dataUrl.indexOf(',')
  const head = dataUrl.slice(0, comma)
  const body = dataUrl.slice(comma + 1)
  if (head.endsWith(';base64')) return Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
  return new Uint8Array(new TextEncoder().encode(decodeURIComponent(body)))
}
