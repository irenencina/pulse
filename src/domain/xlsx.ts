/**
 * Reads the first worksheet of an .xlsx file into rows of text, without any library:
 * an .xlsx is a zip of XML files, and the browser can inflate zip entries itself.
 */

/** Rows of cell text; empty cells are ''. Numbers stay as written in the file. */
export async function readFirstSheet(bytes: Uint8Array): Promise<string[][]> {
  const files = await unzip(bytes, (name) => name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
  const sheetName = Object.keys(files)
    .filter((n) => n.startsWith('xl/worksheets/'))
    .sort((a, b) => sheetNumber(a) - sheetNumber(b))[0]
  if (!sheetName) throw new Error('This Excel file has no worksheet.')
  const shared = files['xl/sharedStrings.xml'] ? sharedStrings(files['xl/sharedStrings.xml']) : []
  return sheetRows(files[sheetName]!, shared)
}

const sheetNumber = (name: string) => Number(/sheet(\d+)/.exec(name)![1])

export function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

async function unzip(bytes: Uint8Array, wanted: (name: string) => boolean): Promise<Record<string, string>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // The central directory lists every entry; find its end record from the back.
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error('This file is not a readable Excel file.')
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const out: Record<string, string> = {}
  const decoder = new TextDecoder()
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('This file is not a readable Excel file.')
    const method = view.getUint16(at + 10, true)
    const compressedSize = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const localHeader = view.getUint32(at + 42, true)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    at += 46 + nameLength + extraLength + commentLength
    if (!wanted(name)) continue
    const dataStart = localHeader + 30 + view.getUint16(localHeader + 26, true) + view.getUint16(localHeader + 28, true)
    const data = bytes.subarray(dataStart, dataStart + compressedSize)
    if (method === 0) out[name] = decoder.decode(data)
    else if (method === 8) out[name] = decoder.decode(await inflate(data))
    else throw new Error('This Excel file uses a compression Pulse can’t read.')
  }
  return out
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, code: string) => {
    if (code[0] === '#') return String.fromCodePoint(code[1] === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)))
    return ENTITIES[code] ?? m
  })
}

/** All the text inside the <t> elements of a fragment (rich text has several). */
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1]!)).join('')

function sharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]!))
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A'
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
}

function sheetRows(xml: string, shared: string[]): string[][] {
  const rows: string[][] = []
  for (const row of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells: string[] = []
    for (const cell of (row[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1]!
      const body = cell[2] ?? ''
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1]
      const type = /\bt="(\w+)"/.exec(attrs)?.[1]
      const value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
      let text = ''
      if (type === 's') text = shared[Number(value)] ?? ''
      else if (type === 'inlineStr') text = textOf(body)
      else if (value !== undefined) text = unescapeXml(value)
      const col = ref ? columnIndex(ref) : cells.length
      while (cells.length < col) cells.push('')
      cells[col] = text
    }
    rows.push(cells)
  }
  return rows
}
