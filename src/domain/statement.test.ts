import { describe, expect, it } from 'vitest'
import { parseRevolutStatement, readBankFile } from './revolut'
import { readFirstSheet } from './xlsx'

// A made-up statement with the same layout as Revolut's Excel "consolidated statement".
const sheet = [
  ['Current Accounts Transaction Statements'],
  ['Personal Account (EUR)'],
  ['Transaction statement'],
  ['Date', 'Description', 'Category', 'Money in/out', 'Balance', 'Tax withheld', 'Other taxes', 'Fees'],
  ['Sep 4, 2026', 'Decathlon', 'Merchant', '-â‚¬58.98', 'â‚¬1,002.30', 'â‚¬0.00', 'â‚¬0.00', 'â‚¬0.00'],
  ['Sep 7, 2026', 'To pocket EUR Bills from EUR', 'Others', '-â‚¬235.00', 'â‚¬767.30', 'â‚¬0.00', 'â‚¬0.00', 'â‚¬0.00'],
  ['Sep 7, 2026', 'To Instant Access Savings', 'Others', '-â‚¬100.00', 'â‚¬667.30', 'â‚¬0.00', 'â‚¬0.00', 'â‚¬0.00'],
  ['Sep 8, 2026', 'From Instant Access Savings', 'Others', 'â‚¬50.00', 'â‚¬717.30', 'â‚¬0.00', 'â‚¬0.00', 'â‚¬0.00'],
  ['Sep 13, 2026', 'Bakery', 'Merchant', '-â‚¬2.99', 'â‚¬714.31', 'â‚¬0.00', 'â‚¬0.00', 'â‚¬0.00'],
  ['Sep 13, 2026', 'Bakery', 'Merchant', '-â‚¬2.99', 'â‚¬711.32', 'â‚¬0.00', 'â‚¬0.00', 'â‚¬0.00'],
  ['Sep 24, 2026', 'Payment from ACME BV', 'Top up', 'â‚¬3,301.55', 'â‚¬4,012.87', 'â‚¬0.00', 'â‚¬0.00', 'â‚¬0.00'],
  ['Total', 'â‚¬4,012.87', 'â‚¬0.00', 'â‚¬0.00', 'â‚¬0.00'],
  ['---------'],
  ['Bills (EUR)'],
  ['Transaction statement'],
  ['Date', 'Description', 'Category', 'Money in/out', 'Balance', 'Tax withheld', 'Other taxes', 'Fees'],
  ['Sep 7, 2026', 'To pocket EUR Bills from EUR', 'Others', 'â‚¬235.00', 'â‚¬235.00', 'â‚¬0.00', 'â‚¬0.00', 'â‚¬0.00'],
  ['Sep 14, 2026', 'Basic Fit Nederland B.V.', 'Others', '-â‚¬34.99', 'â‚¬200.01', 'â‚¬0.00', 'â‚¬0.00', 'â‚¬0.00'],
  ['Sep 30, 2026', 'Pocket Withdrawal', 'Others', '-â‚¬200.01', 'â‚¬0.00', 'â‚¬0.00', 'â‚¬0.00', 'â‚¬0.00'],
  ['Total', 'â‚¬0.00', 'â‚¬0.00', 'â‚¬0.00', 'â‚¬0.00'],
  ['---------'],
  ['Savings Accounts Transaction Statements'],
  ['Savings  (EUR)'],
  ['Transaction statement (only interest receipt)'],
  ['Date', 'Description', 'Gross rate', 'Gross interest', 'Taxes withheld', 'Other taxes', 'Fees', 'Net interest'],
  ['46023', "Net Interest Paid to 'Instant Access Savings' for Sep 1, 2026", '0.02', 'â‚¬0.05', 'â‚¬0.00', 'â‚¬0.00', 'â‚¬0.00', 'â‚¬0.05'],
  ['9/30/26', "Net Interest Paid to 'Instant Access Savings' for Sep 30, 2026", '0.02', 'â‚¬0.04', 'â‚¬0.00', 'â‚¬0.00', 'â‚¬0.00', 'â‚¬0.04'],
]

describe('Revolut consolidated statement', () => {
  const file = parseRevolutStatement(sheet)

  it('keeps real payments, with the pocket they were paid from', () => {
    expect(file.rows.map((r) => [r.date, r.cents, r.description, r.pocket])).toEqual([
      ['2026-09-04', -5898, 'Decathlon', null],
      ['2026-09-07', -10000, 'To Instant Access Savings', null],
      ['2026-09-13', -299, 'Bakery', null],
      ['2026-09-13', -299, 'Bakery', null],
      ['2026-09-14', -3499, 'Basic Fit Nederland B.V.', 'Bills'],
      ['2026-09-24', 330155, 'Payment from ACME BV', null],
      ['2026-09-30', 9, 'Interest on Savings', null],
    ])
  })

  it('leaves out moves between your own pockets and money taken out of savings', () => {
    expect(file.skipped).toEqual({ 'moved between your pockets': 3, 'taken out of savings': 1 })
  })

  it('marks money put into savings, and adds interest up per month', () => {
    expect(file.rows[1]).toMatchObject({ block: 'savings', note: 'Put into savings' })
    expect(file.rows[6]).toMatchObject({ block: 'income', note: 'Daily interest 01–30, added up' })
  })

  it('reads each account’s balance at the end of the month, for Worth', () => {
    expect(file.balances).toEqual([
      { account: 'Personal Account', role: 'main', month: '2026-09', cents: 401287 },
      { account: 'Bills', role: 'pocket', month: '2026-09', cents: 0 },
    ])
  })

  it('takes closing balances from the summaries, also for savings', () => {
    const summaries = [
      ['Current Accounts Summaries'],
      ['Personal Account (EUR)'],
      ['', '', 'Opening balance', 'â‚¬0.00'],
      ['', '', 'Closing balance', 'â‚¬4,012.87'],
      ['Bills (EUR)'],
      ['', '', 'Closing balance', 'â‚¬0.00'],
      ['Savings Accounts Summaries'],
      ['Savings  (EUR)'],
      ['Interest and Tax Summary'],
      ['', '', 'Closing balance', 'â‚¬1,250.09'],
    ]
    const withSummaries = parseRevolutStatement([...summaries, ...sheet])
    expect(withSummaries.rows).toEqual(file.rows)
    expect(withSummaries.balances).toContainEqual({ account: 'Savings', role: 'savings', month: '2026-09', cents: 125009 })
    expect(withSummaries.balances?.filter((b) => b.role !== 'savings')).toEqual(file.balances)
  })

  it('tells two identical payments on one day apart', () => {
    expect(new Set(file.rows.map((r) => r.importKey)).size).toBe(file.rows.length)
    expect(parseRevolutStatement(sheet).rows.map((r) => r.importKey)).toEqual(file.rows.map((r) => r.importKey))
  })
})

it('reads the statement from an Excel file', async () => {
  const bytes = await xlsx(sheet)
  expect(await readFirstSheet(bytes)).toEqual(sheet)
  expect((await readBankFile(bytes)).rows).toHaveLength(7)
})

it('still reads the CSV account statement', async () => {
  const csv = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\n' +
    'CARD_PAYMENT,Current,2026-09-03 12:01:44,2026-09-04 09:12:01,Decathlon,-49.99,0.00,EUR,COMPLETED,950.01\n'
  expect((await readBankFile(new TextEncoder().encode(csv))).rows[0]).toMatchObject({ cents: -4999, pocket: null })
})

/** Builds a minimal .xlsx: shared strings plus one sheet, the sheet deflated like Excel does. */
async function xlsx(rows: string[][]): Promise<Uint8Array> {
  const strings: string[] = []
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&apos;')
  const col = (i: number) => String.fromCharCode(65 + i)
  const sheetXml =
    '<worksheet><sheetData>' +
    rows
      .map(
        (r, i) =>
          `<row r="${i + 1}">` +
          r
            .map((v, j) => {
              if (/^\d+(\.\d+)?$/.test(v)) return `<c r="${col(j)}${i + 1}"><v>${v}</v></c>`
              strings.push(v)
              return `<c r="${col(j)}${i + 1}" t="s"><v>${strings.length - 1}</v></c>`
            })
            .join('') +
          '</row>',
      )
      .join('') +
    '</sheetData></worksheet>'
  const shared = '<sst>' + strings.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('') + '</sst>'
  return zip([
    { name: 'xl/sharedStrings.xml', data: new TextEncoder().encode(shared), deflate: false },
    { name: 'xl/worksheets/sheet1.xml', data: new TextEncoder().encode(sheetXml), deflate: true },
  ])
}

async function zip(entries: Array<{ name: string; data: Uint8Array; deflate: boolean }>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const e of entries) {
    const body = e.deflate
      ? new Uint8Array(await new Response(new Blob([e.data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
      : e.data
    const name = new TextEncoder().encode(e.name)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(8, e.deflate ? 8 : 0, true)
    local.setUint32(18, body.length, true)
    local.setUint32(22, e.data.length, true)
    local.setUint16(26, name.length, true)
    const dir = new DataView(new ArrayBuffer(46))
    dir.setUint32(0, 0x02014b50, true)
    dir.setUint16(10, e.deflate ? 8 : 0, true)
    dir.setUint32(20, body.length, true)
    dir.setUint32(24, e.data.length, true)
    dir.setUint16(28, name.length, true)
    dir.setUint32(42, offset, true)
    chunks.push(new Uint8Array(local.buffer), name, body)
    central.push(new Uint8Array(dir.buffer), name)
    offset += 30 + name.length + body.length
  }
  const dirSize = central.reduce((n, c) => n + c.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, dirSize, true)
  end.setUint32(16, offset, true)
  const all = [...chunks, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0))
  let at = 0
  for (const c of all) {
    out.set(c, at)
    at += c.length
  }
  return out
}
