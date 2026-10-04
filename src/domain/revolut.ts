import { parseAmount } from './money'

/** One row of a Revolut account statement, ready to review before it is saved. */
export interface BankRow {
  date: string
  /** Signed: negative money left the account (after any fee), positive came in. */
  cents: number
  description: string
  type: string
  product: string
  importKey: string
}

export interface BankFile {
  rows: BankRow[]
  /** Rows left out, with the reason, e.g. { 'still pending': 2 }. */
  skipped: Record<string, number>
}

/** Splits CSV text into rows of fields. Handles quoted fields with commas, quotes and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^\uFEFF/, '')
  // Most exports use commas; some spreadsheet apps save with semicolons instead.
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = firstLine.includes(',') || !firstLine.includes(';') ? ',' : ';'
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  row.push(field)
  if (row.some((f) => f !== '')) rows.push(row)
  return rows
}

const COLUMNS = {
  type: 'type',
  product: 'product',
  started: 'started date',
  completed: 'completed date',
  description: 'description',
  amount: 'amount',
  fee: 'fee',
  currency: 'currency',
  state: 'state',
} as const

/**
 * Reads a Revolut account statement (CSV export from the app: Type, Product, Started Date,
 * Completed Date, Description, Amount, Fee, Currency, State, Balance). Only completed
 * euro transactions are kept; fees are added to the amount they belong to.
 */
export function parseRevolut(text: string): BankFile {
  const [header, ...lines] = parseCsv(text)
  if (!header) throw new Error('This file is empty.')
  const index = Object.fromEntries(
    Object.entries(COLUMNS).map(([key, name]) => [key, header.findIndex((h) => h.trim().toLowerCase() === name)]),
  ) as Record<keyof typeof COLUMNS, number>
  const missing = (['started', 'description', 'amount'] as const).filter((k) => index[k] < 0)
  if (missing.length > 0) {
    throw new Error(
      'This doesn’t look like a Revolut statement. Export it from the Revolut app as CSV (Statement → Excel/CSV).',
    )
  }

  const rows: BankRow[] = []
  const skipped: Record<string, number> = {}
  const skip = (reason: string) => (skipped[reason] = (skipped[reason] ?? 0) + 1)
  const get = (line: string[], key: keyof typeof COLUMNS) => (index[key] >= 0 ? (line[index[key]] ?? '').trim() : '')

  for (const line of lines) {
    const state = get(line, 'state').toUpperCase()
    if (state && state !== 'COMPLETED') {
      skip(state === 'PENDING' ? 'still pending' : 'not completed (declined or reverted)')
      continue
    }
    const currency = get(line, 'currency').toUpperCase()
    if (currency && currency !== 'EUR') {
      skip('not in euro')
      continue
    }
    const amount = parseAmount(get(line, 'amount'))
    const fee = parseAmount(get(line, 'fee') || '0') ?? 0
    const started = get(line, 'started')
    const date = (get(line, 'completed') || started).slice(0, 10)
    if (amount === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      skip('unreadable')
      continue
    }
    const cents = amount - fee
    if (cents === 0) {
      skip('zero amount')
      continue
    }
    const description = get(line, 'description')
    const product = get(line, 'product')
    rows.push({
      date,
      cents,
      description,
      type: get(line, 'type'),
      product,
      importKey: ['revolut', started, get(line, 'amount'), description, product].join('|'),
    })
  }
  return { rows, skipped }
}
