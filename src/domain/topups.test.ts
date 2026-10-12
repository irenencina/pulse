import { describe, expect, it } from 'vitest'
import { nextPayday } from './topups'

describe('payday', () => {
  it('is the day income shifts on, this month or next', () => {
    expect(nextPayday({ shiftLateIncome: true, lateIncomeDay: 20 }, '2026-10-12')).toBe('2026-10-20')
    expect(nextPayday({ shiftLateIncome: true, lateIncomeDay: 20 }, '2026-10-21')).toBe('2026-11-20')
    expect(nextPayday({ shiftLateIncome: true, lateIncomeDay: 31 }, '2026-11-02')).toBe('2026-11-30')
    expect(nextPayday({ shiftLateIncome: false, lateIncomeDay: 20 }, '2026-10-12')).toBe('2026-11-01')
  })
})
