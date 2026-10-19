import { describe, expect, it } from 'vitest'
import { backupDue, backupDueOn } from './backupPlan'

describe('backup plan', () => {
  it('is due today when there has never been a backup', () => {
    expect(backupDueOn('week', null, '2026-10-19')).toBe('2026-10-19')
    expect(backupDue('week', null, '2026-10-19')).toBe(true)
  })

  it('counts days from the last backup', () => {
    expect(backupDueOn('3days', '2026-10-19', '2026-10-19')).toBe('2026-10-22')
    expect(backupDueOn('week', '2026-10-28', '2026-10-28')).toBe('2026-11-04')
    expect(backupDueOn('2weeks', '2026-12-25', '2026-12-25')).toBe('2027-01-08')
    expect(backupDue('2weeks', '2026-10-01', '2026-10-14')).toBe(false)
    expect(backupDue('2weeks', '2026-10-01', '2026-10-15')).toBe(true)
  })

  it('goes to the same day next month, or its last day', () => {
    expect(backupDueOn('month', '2026-01-31', '2026-01-31')).toBe('2026-02-28')
  })

  it('treats an unset plan as every 2 weeks, and never as never due', () => {
    expect(backupDueOn(undefined, '2026-10-01', '2026-10-01')).toBe('2026-10-15')
    expect(backupDueOn('off', null, '2026-10-19')).toBeNull()
    expect(backupDue('off', null, '2026-10-19')).toBe(false)
  })
})
