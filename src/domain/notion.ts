/**
 * TEMPORARY: reads a Notion wishlist export, so Irene can try the Wishlist with her own items.
 * Remove this file, src/db/notion.ts and the button in Plug-ins before PR #8 is merged.
 */
import { isZip, unzipFiles } from './xlsx'


/** Rows of a CSV file (Notion's export), honouring quotes and line breaks inside them. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/** Notion writes a linked page as "Acme (Brands%20…/Acme%20….md)"; this keeps the names. */
export function notionNames(cell: string): string[] {
  return cell
    .replace(/\s*\([^()]*\.md\)/g, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** "May 13, 2024 12:28 PM" or "November 10, 2023" → "2024-05-13". */
export function notionDate(cell: string): string | undefined {
  const m = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(cell.trim())
  if (!m) return undefined
  const month = MONTHS.findIndex((name) => name.startsWith(m[1]!.toLowerCase().slice(0, 3)))
  if (month < 0) return undefined
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2]!.padStart(2, '0')}`
}

/** "€1,234.50" → 123450. */
export function notionPrice(cell: string): number | null {
  const digits = cell.replace(/[^\d.,-]/g, '').replace(/,/g, '')
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

export interface NotionItem {
  name: string
  priceCents: number | null
  url?: string
  desired: boolean
  owned: boolean
  brand?: string
  categories: string[]
  tags: string[]
  addedOn?: string
  purchasedOn?: string
  giftShare?: number
  giftFor?: string
  importKey: string
}

/** Reads Notion's wishlist table. Throws when the columns don't look like it. */
export function readNotionWishlist(text: string): NotionItem[] {
  const [head, ...rows] = parseCsv(text)
  if (!head) throw new Error('This file is empty.')
  const col = (name: string) => head.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase())
  const name = col('Name')
  if (name < 0 || (col('Price') < 0 && col('Owned') < 0)) throw new Error('This doesn’t look like a Notion wishlist table.')
  const get = (row: string[], header: string) => {
    const i = col(header)
    return i < 0 ? '' : (row[i] ?? '').trim()
  }
  return rows
    .filter((r) => (r[name] ?? '').trim() !== '')
    .map((r) => {
      const share = get(r, 'Present')
      const giftShare = share ? Math.round(Number(share.replace('%', '').replace(',', '.'))) : undefined
      const addedOn = notionDate(get(r, 'Date added'))
      const item: NotionItem = {
        name: get(r, 'Name'),
        priceCents: notionPrice(get(r, 'Price')),
        desired: get(r, 'Most desired').toLowerCase() === 'yes',
        owned: get(r, 'Owned').toLowerCase() === 'yes',
        categories: notionNames(get(r, 'Category')),
        tags: notionNames(get(r, 'Tags')),
        importKey: `notion|${get(r, 'Name').toLowerCase()}|${get(r, 'Date added')}`,
      }
      const url = get(r, 'URL')
      if (url) item.url = url
      const brand = notionNames(get(r, 'Brand'))[0]
      if (brand) item.brand = brand
      if (addedOn) item.addedOn = addedOn
      const purchasedOn = notionDate(get(r, 'Date purchased'))
      if (purchasedOn) item.purchasedOn = purchasedOn
      if (giftShare !== undefined && Number.isFinite(giftShare) && giftShare > 0) item.giftShare = Math.min(100, giftShare)
      const giftFor = notionNames(get(r, 'Gifting to')).join(', ')
      if (giftFor) item.giftFor = giftFor
      return item
    })
}

/**
 * Picks the full wishlist table from a Notion export. Notion writes each view as its own CSV
 * and the whole table as "…_all.csv"; the one with the most rows and a Name/Price header wins.
 */
export function pickNotionTable(files: Record<string, string>): { name: string; items: NotionItem[] } {
  let best: { name: string; items: NotionItem[] } | null = null
  for (const [name, text] of Object.entries(files)) {
    if (!name.toLowerCase().endsWith('.csv')) continue
    let items: NotionItem[]
    try {
      items = readNotionWishlist(text)
    } catch {
      continue
    }
    if (!best || items.length > best.items.length) best = { name, items }
  }
  if (!best) throw new Error('No wishlist table was found in this file. Export the Notion page as “Markdown & CSV”.')
  return best
}

/** The CSV files inside a Notion export (a zip, sometimes with another zip inside), or a single CSV. */
export async function notionExportFiles(bytes: Uint8Array, fileName: string): Promise<Record<string, string>> {
  const decoder = new TextDecoder()
  if (!isZip(bytes)) return { [fileName]: decoder.decode(bytes) }
  const out: Record<string, string> = {}
  const walk = async (zip: Uint8Array, depth: number) => {
    const files = await unzipFiles(zip, (n) => /\.(csv|zip)$/i.test(n))
    for (const [name, data] of Object.entries(files)) {
      if (/\.zip$/i.test(name)) {
        if (depth < 3) await walk(data, depth + 1)
      } else out[name] = decoder.decode(data)
    }
  }
  await walk(bytes, 0)
  return out
}
