import { parseAmount } from './money'
import type { Block } from './types'
import { isZip, readFirstSheet } from './xlsx'

/** One row of a Revolut statement, ready to review before it is saved. */
export interface BankRow {
  date: string
  /** Signed: negative money left the account (after any fee), positive came in. */
  cents: number
  description: string
  /** The Revolut pocket it was paid from or into; null for the main account. */
  pocket: string | null
  /** Set when the kind of row is known, e.g. money put into a savings account. */
  block?: Block
  /** Shown next to the row while reviewing. */
  note?: string
  /** Whether the row starts ticked for import. */
  include: boolean
  importKey: string
}

export interface BankFile {
  rows: BankRow[]
  /** Rows left out, with the reason, e.g. { 'still pending': 2 }. */
  skipped: Record<string, number>
  /** What each account held at the end of each month in the file, for Worth. */
  balances?: BankBalance[]
}

/** An account's balance at the end of a month (or of the statement, for its last month). */
export interface BankBalance {
  /** The account's name in the statement: "Personal Account", a pocket's name, or "Savings". */
  account: string
  role: 'main' | 'pocket' | 'savings'
  /** "YYYY-MM" */
  month: string
  cents: number
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
 * Reads a statement downloaded from Revolut: either the Excel "consolidated statement"
 * (all accounts and pockets in one file) or the CSV account statement.
 */
export async function readBankFile(bytes: Uint8Array): Promise<BankFile> {
  if (isZip(bytes)) return parseRevolutStatement(await readFirstSheet(bytes))
  return parseRevolut(new TextDecoder().decode(bytes))
}

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
    const otherAccount = product !== '' && product.toLowerCase() !== 'current'
    rows.push({
      date,
      cents,
      description,
      pocket: null,
      note: otherAccount ? `From your Revolut ${product} account` : undefined,
      include: !otherAccount,
      importKey: ['revolut', started, get(line, 'amount'), description, product].join('|'),
    })
  }
  return { rows, skipped }
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** "Sep 7, 2026" -> "2026-09-07". */
function englishDate(text: string): string | null {
  const m = /([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})/.exec(text)
  if (!m) return null
  const month = MONTHS.indexOf(m[1]!.toLowerCase())
  if (month < 0) return null
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2]!.padStart(2, '0')}`
}

/** "-€1,099.56" (the euro sign sometimes garbled) -> -109956. */
function statementAmount(text: string): number | null {
  const negative = /^\s*-/.test(text)
  const cents = parseAmount(text.replace(/[^\d.,]/g, ''))
  return cents === null ? null : negative ? -cents : cents
}

const INTERNAL = /^(to pocket .* from |pocket withdrawal$)/i
const TO_SAVINGS = /^to (instant access )?savings|^to .*savings vault/i
const FROM_SAVINGS = /^from (instant access )?savings|^from .*savings vault/i

/**
 * Reads Revolut's Excel "consolidated statement". It stacks one block per account: the
 * main account, each pocket, and the savings account (interest only). Money moved between
 * your own pockets is left out, so nothing counts twice; money put into savings is
 * marked as savings; daily interest is added up into one line per month.
 */
export function parseRevolutStatement(sheet: string[][]): BankFile {
  const rows: BankRow[] = []
  const skipped: Record<string, number> = {}
  const skip = (reason: string) => (skipped[reason] = (skipped[reason] ?? 0) + 1)
  const first = (row: string[]) => (row.find((c) => c.trim() !== '') ?? '').trim()

  let section: 'none' | 'current' | 'savings' = 'none'
  let account: string | null = null
  let isMain = false
  let seenMain = false
  let columns: string[] | null = null
  const seen = new Map<string, number>()
  const interest = new Map<string, { cents: number; from: string; to: string; account: string }>()
  // For Worth: each current account's balance after its last row of a month, and the
  // closing balances from the summaries.
  const monthEnd = new Map<string, Map<string, number>>()
  const roles = new Map<string, BankBalance['role']>()
  const closing = new Map<string, number>()
  let summary: 'current' | 'savings' | null = null
  let summaryAccount: string | null = null
  let summaryMain = false
  let lastMonth = ''

  for (const raw of sheet) {
    const row = raw.map((c) => c.trim())
    const head = first(row)
    // The summaries at the top give each account's balance at the end of the statement.
    const summaryHead = /^(current|savings) accounts summaries$/i.exec(head)
    if (summaryHead) {
      summary = summaryHead[1]!.toLowerCase() as 'current' | 'savings'
      continue
    }
    if (summary && section === 'none') {
      const name = /^(.+?)\s*\(EUR\)$/.exec(head)
      if (name && row.filter(Boolean).length === 1) {
        summaryAccount = name[1]!.trim()
        if (summary === 'current' && !summaryMain) {
          roles.set(summaryAccount, 'main')
          summaryMain = true
        } else if (!roles.has(summaryAccount)) roles.set(summaryAccount, summary === 'savings' ? 'savings' : 'pocket')
        continue
      }
      if (summaryAccount && /^closing balance$/i.test(head)) {
        const cents = statementAmount(row.slice(row.indexOf(head) + 1).find((c) => c !== '') ?? '')
        if (cents !== null) closing.set(summaryAccount, cents)
        continue
      }
    }
    if (/^current accounts transaction statements$/i.test(head)) {
      section = 'current'
      continue
    }
    if (/^savings accounts transaction statements$/i.test(head)) {
      section = 'savings'
      continue
    }
    if (section === 'none') continue
    const accountName = /^(.+?)\s*\(([A-Z]{3})\)$/.exec(head)
    if (accountName && row.filter(Boolean).length === 1) {
      account = accountName[1]!.trim()
      isMain = section === 'current' && !seenMain
      if (isMain) seenMain = true
      columns = null
      if (accountName[2] !== 'EUR') account = `${account} (${accountName[2]})`
      continue
    }
    if (row[0]?.toLowerCase() === 'date') {
      columns = row.map((c) => c.toLowerCase())
      continue
    }
    if (!columns || !account || head === '' || /^(total|-+)$/i.test(head)) {
      if (/^-+$/.test(head)) columns = null
      continue
    }
    const get = (name: string) => row[columns!.indexOf(name)] ?? ''

    if (section === 'savings') {
      // Daily interest; the date column is unreliable, the description names the day.
      const date = englishDate(get('description'))
      const cents = statementAmount(get('net interest'))
      if (!date || cents === null) {
        skip('unreadable')
        continue
      }
      if (!roles.has(account)) roles.set(account, 'savings')
      if (date.slice(0, 7) > lastMonth) lastMonth = date.slice(0, 7)
      const key = `${account}|${date.slice(0, 7)}`
      const sum = interest.get(key) ?? { cents: 0, from: date, to: date, account }
      sum.cents += cents
      if (date < sum.from) sum.from = date
      if (date > sum.to) sum.to = date
      interest.set(key, sum)
      continue
    }

    if (account.includes('(')) {
      skip('not in euro')
      continue
    }
    const date = englishDate(get('date'))
    const amount = statementAmount(get('money in/out'))
    const fee = statementAmount(get('fees') || '0') ?? 0
    if (!date || amount === null) {
      skip('unreadable')
      continue
    }
    const description = get('description')
    // Every row, moves between pockets too, changes the account's running balance.
    const month = date.slice(0, 7)
    if (month > lastMonth) lastMonth = month
    if (!roles.has(account)) roles.set(account, isMain ? 'main' : 'pocket')
    const balance = statementAmount(get('balance'))
    if (balance !== null) {
      const ends = monthEnd.get(account) ?? new Map<string, number>()
      ends.set(month, balance)
      monthEnd.set(account, ends)
    }
    if (INTERNAL.test(description)) {
      skip('moved between your pockets')
      continue
    }
    if (FROM_SAVINGS.test(description)) {
      skip('taken out of savings')
      continue
    }
    const cents = amount - Math.abs(fee)
    if (cents === 0) {
      skip('zero amount')
      continue
    }
    const pocket = isMain ? null : account
    const base = ['revolut', account, date, get('money in/out'), description].join('|')
    const nth = (seen.get(base) ?? 0) + 1
    seen.set(base, nth)
    const toSavings = TO_SAVINGS.test(description)
    rows.push({
      date,
      cents,
      description,
      pocket,
      block: toSavings ? 'savings' : undefined,
      note: toSavings ? 'Put into savings' : undefined,
      include: true,
      importKey: `${base}|${nth}`,
    })
  }

  for (const [key, sum] of interest) {
    if (sum.cents === 0) continue
    rows.push({
      date: sum.to,
      cents: sum.cents,
      description: `Interest on ${sum.account}`,
      pocket: null,
      block: 'income',
      note: `Daily interest ${sum.from.slice(8)}–${sum.to.slice(8)}, added up`,
      include: true,
      importKey: `revolut|interest|${key}|${sum.from}|${sum.to}`,
    })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date))
  return { rows, skipped, balances: statementBalances(roles, monthEnd, closing, lastMonth) }
}

/**
 * Month-end balances per account. Current accounts and pockets list a running balance on
 * every row. The savings account lists only interest (money paid in from another bank
 * doesn't show), so only its closing balance, at the end of the statement, is certain.
 */
function statementBalances(
  roles: Map<string, BankBalance['role']>,
  monthEnd: Map<string, Map<string, number>>,
  closing: Map<string, number>,
  lastMonth: string,
): BankBalance[] {
  const out: BankBalance[] = []
  if (!lastMonth) return out
  for (const [account, role] of roles) {
    const ends = new Map(role === 'savings' ? [] : (monthEnd.get(account) ?? []))
    const end = closing.get(account)
    if (end !== undefined) ends.set(lastMonth, end)
    for (const [month, cents] of [...ends].sort(([a], [b]) => a.localeCompare(b))) out.push({ account, role, month, cents })
  }
  return out
}
