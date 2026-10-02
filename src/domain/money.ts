/**
 * Amounts are integer cents everywhere, so 0.1 + 0.2 never shows up as 0.30000000000000004.
 */

/** Parses "1.234,56", "1,234.56", "1234.5" or "-12" into cents. Returns null if it isn't a number. */
export function parseAmount(input: string): number | null {
  let s = input.trim().replace(/[\s€$£]/g, '')
  if (s === '') return null
  const negative = s.startsWith('-') || (s.startsWith('(') && s.endsWith(')'))
  s = s.replace(/^[-(]|\)$/g, '')
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  // Whichever separator comes last is the decimal one; the other is a thousands separator.
  const decimal = lastComma > lastDot ? ',' : '.'
  const thousands = decimal === ',' ? '.' : ','
  s = s.split(thousands).join('')
  if (decimal === ',') s = s.replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const cents = Math.round(Number(s) * 100)
  return negative ? -cents : cents
}

export function formatMoney(cents: number, currency = 'EUR', locale?: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100)
}
