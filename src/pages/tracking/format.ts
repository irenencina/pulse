import type { MonthKey } from '../../domain/periods'
import type { Block } from '../../domain/types'

const number = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 1234.5 as "1,234.50"; income gets a +, expenses a −. */
export function signedAmount(cents: number, block: Block): string {
  const sign = block === 'income' ? '+' : block === 'expenses' ? '−' : ''
  return sign + number.format(cents / 100)
}

export const plainAmount = (cents: number) => number.format(cents / 100)

/** "October 2026", or just "Oct" with style 'month'. */
export function monthLabel(key: MonthKey, style: 'long' | 'month' = 'long'): string {
  const date = new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1)
  return style === 'month'
    ? date.toLocaleString(undefined, { month: 'short' })
    : date.toLocaleString(undefined, { month: 'long', year: 'numeric' })
}

export function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d).toLocaleString(undefined, { day: 'numeric', month: 'short' })
}

export function todayIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
