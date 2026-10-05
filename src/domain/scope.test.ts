import { describe, expect, it } from 'vitest'
import { scopeMonths } from './scope'

describe('scopeMonths', () => {
  it('reads the current year and month from today', () => {
    expect(scopeMonths({ year: 'current', period: 'current' }, '2026-10')).toEqual(['2026-10'])
  })

  it('covers a whole year, or one month of a picked year', () => {
    const year = scopeMonths({ year: 2025, period: 'year' }, '2026-10')
    expect(year).toHaveLength(12)
    expect([year[0], year[11]]).toEqual(['2025-01', '2025-12'])
    expect(scopeMonths({ year: 2025, period: 3 }, '2026-10')).toEqual(['2025-03'])
    expect(scopeMonths({ year: 2025, period: 'current' }, '2026-10')).toEqual(['2025-10'])
  })
})
