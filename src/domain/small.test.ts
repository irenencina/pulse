import { describe, expect, it } from 'vitest'
import { formatMoney, parseAmount } from './money'
import { effectiveMonth } from './periods'
import { normaliseTagName } from './tags'

describe('normaliseTagName', () => {
  it.each([
    ['#football', 'football'],
    ['  ##Football Club ', 'football-club'],
    ['Perú trip!', 'perú-trip'],
    ['#', ''],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseTagName(input)).toBe(expected)
  })
})

describe('parseAmount', () => {
  it.each([
    ['3119.22', 311922],
    ['3.119,22', 311922],
    ['3,119.22', 311922],
    ['486,5', 48650],
    ['-40.16', -4016],
    ['(35.16)', -3516],
    ['€ 12', 1200],
    ['abc', null],
    ['', null],
  ])('%s -> %s', (input, expected) => {
    expect(parseAmount(input)).toBe(expected)
  })

  it('formats cents as euro', () => {
    expect(formatMoney(311922, 'EUR', 'en-IE')).toBe('€3,119.22')
  })
})

describe('effectiveMonth', () => {
  const on = { shiftLateIncome: true, lateIncomeDay: 20 }
  it('shifts income on or after the cut-off day to next month', () => {
    expect(effectiveMonth('2026-09-19', true, on)).toBe('2026-09')
    expect(effectiveMonth('2026-09-20', true, on)).toBe('2026-10')
    expect(effectiveMonth('2026-12-28', true, on)).toBe('2027-01')
  })
  it('never shifts expenses, and respects the setting being off', () => {
    expect(effectiveMonth('2026-09-25', false, on)).toBe('2026-09')
    expect(effectiveMonth('2026-09-25', true, { ...on, shiftLateIncome: false })).toBe('2026-09')
  })
})

it('shifts every transaction from the cut-off day when the whole month is shifted', async () => {
  const { effectiveMonth, monthPeriod } = await import('./periods')
  const rule = { shiftLateIncome: true, lateIncomeDay: 24, shiftWholeMonth: true }
  expect(effectiveMonth('2026-09-24', false, rule)).toBe('2026-10')
  expect(effectiveMonth('2026-09-23', false, rule)).toBe('2026-09')
  expect(effectiveMonth('2026-09-24', false, { ...rule, shiftWholeMonth: false })).toBe('2026-09')
  expect(monthPeriod('2026-10', rule)).toEqual({ from: '2026-09-24', to: '2026-10-23' })
  expect(monthPeriod('2026-01', rule)).toEqual({ from: '2025-12-24', to: '2026-01-23' })
  expect(monthPeriod('2026-10', { ...rule, lateIncomeDay: 31 })).toEqual({ from: '2026-10-01', to: '2026-10-30' })
  expect(monthPeriod('2026-10', { ...rule, shiftWholeMonth: false })).toEqual({ from: '2026-10-01', to: '2026-10-31' })
})
