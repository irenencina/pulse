import { describe, expect, it } from 'vitest'
import { parseCsv, parseRevolut } from './revolut'

const statement = [
  'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
  'CARD_PAYMENT,Current,2026-09-03 12:01:44,2026-09-04 09:12:01,Decathlon,-49.99,0.00,EUR,COMPLETED,950.01',
  'TOPUP,Current,2026-09-25 08:00:00,2026-09-25 08:00:05,"Salary, ACME S.L.",3119.22,0.00,EUR,COMPLETED,4069.23',
  'ATM,Current,2026-09-26 18:30:00,2026-09-26 18:30:00,Cash at Sabadell,-60.00,1.50,EUR,COMPLETED,4007.73',
  'CARD_PAYMENT,Current,2026-09-28 10:00:00,,Mercadona,-23.10,0.00,EUR,PENDING,',
  'CARD_PAYMENT,Current,2026-09-29 10:00:00,2026-09-29 10:00:00,Amazon UK,-15.00,0.00,GBP,COMPLETED,30.00',
].join('\r\n')

describe('Revolut statements', () => {
  const file = parseRevolut(statement)

  it('keeps completed euro rows, using the completed date', () => {
    expect(file.rows.map((r) => [r.date, r.cents, r.description])).toEqual([
      ['2026-09-04', -4999, 'Decathlon'],
      ['2026-09-25', 311922, 'Salary, ACME S.L.'],
      ['2026-09-26', -6150, 'Cash at Sabadell'],
    ])
  })

  it('adds fees to the payment and says what was left out', () => {
    expect(file.rows[2]!.cents).toBe(-6150)
    expect(file.skipped).toEqual({ 'still pending': 1, 'not in euro': 1 })
  })

  it('gives each row a stable key, so a second import finds the duplicates', () => {
    expect(parseRevolut(statement).rows.map((r) => r.importKey)).toEqual(file.rows.map((r) => r.importKey))
    expect(new Set(file.rows.map((r) => r.importKey)).size).toBe(3)
  })

  it('refuses files that are not Revolut statements', () => {
    expect(() => parseRevolut('Date;Concept;Amount\n2026-01-01;x;1')).toThrow(/Revolut/)
  })
})

it('reads quoted CSV fields and semicolon files', () => {
  expect(parseCsv('a,"b, ""c""",d\n1,2,3\n')).toEqual([
    ['a', 'b, "c"', 'd'],
    ['1', '2', '3'],
  ])
  expect(parseCsv('a;b\n1,5;2')).toEqual([
    ['a', 'b'],
    ['1,5', '2'],
  ])
})
