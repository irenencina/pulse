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

/**
 * Reads an amount that may be a sum, like a spreadsheet cell: "350+300", "=-350-300-370",
 * "45*4" or "1.200,50 - 20". Only + − × ÷ (* x /), no brackets. Returns cents, or null.
 */
export function evalAmount(input: string): number | null {
  const s = input.trim().replace(/^=/, '').replace(/−/g, '-').replace(/[×x]/gi, '*').replace(/÷/g, '/')
  if (!/[+\-*/]/.test(s.replace(/^\s*-/, ''))) return parseAmount(s)
  // Numbers and operators, where a sign right after an operator (or at the start) belongs to the number.
  const parts = s.split(/([+\-*/])/).map((p) => p.trim())
  const tokens: string[] = []
  let sign = ''
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!
    if (i % 2 === 0) {
      if (p === '') {
        // An empty number: only fine before a leading or unary sign.
        const next = parts[i + 1]
        const unary = tokens.length === 0 || /^[+\-*/]$/.test(tokens[tokens.length - 1]!)
        if (!unary || (next !== '-' && next !== '+')) return null
        if (next === '-') sign = sign === '-' ? '' : '-'
        i++
        continue
      }
      tokens.push(sign + p)
      sign = ''
    } else tokens.push(p)
  }
  if (tokens.length === 0 || tokens.length % 2 === 0) return null
  // Products first, then sums, all in cents.
  let total = 0
  let term = parseAmount(tokens[0]!)
  if (term === null) return null
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i]!
    const n = parseAmount(tokens[i + 1]!)
    if (n === null) return null
    if (op === '*') term = (term * n) / 100
    else if (op === '/') {
      if (n === 0) return null
      term = (term * 100) / n
    } else {
      total += term
      term = op === '-' ? -n : n
    }
  }
  return Math.round(total + term)
}

/** True when the text is a sum rather than one amount, so it's worth keeping as typed. */
export const isSum = (input: string) => /[+*/×÷x]|.\s*[-−]/i.test(input.trim().replace(/^=/, '').replace(/^\s*[-−]/, ''))
