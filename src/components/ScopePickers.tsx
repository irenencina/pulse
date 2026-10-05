import { monthPeriod } from '../domain/periods'
import type { Scope } from '../domain/scope'
import type { Settings } from '../domain/types'
import { dayLabel, todayIso } from '../pages/tracking/format'

/** Year and Period, like the pickers at the top of the spreadsheet. */
export default function ScopePickers({
  scope,
  onChange,
  years,
  settings,
  year,
}: {
  scope: Scope
  onChange: (scope: Scope) => void
  years: number[]
  settings: Settings
  year: number
}) {
  const shifted = settings.shiftWholeMonth && settings.shiftLateIncome
  const dates = (month: number) => {
    if (!shifted) return ''
    const { from, to } = monthPeriod(`${year}-${String(month).padStart(2, '0')}`, settings)
    return ` (${dayLabel(from)} – ${dayLabel(to)})`
  }
  const current = Number(todayIso().slice(5, 7))
  return (
    <div className="scope-pickers">
      <label>
        <span>Year</span>
        <select
          aria-label="Year"
          value={String(scope.year)}
          onChange={(e) => onChange({ ...scope, year: e.target.value === 'current' ? 'current' : Number(e.target.value) })}
        >
          <option value="current">Current year</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Period</span>
        <select
          aria-label="Period"
          value={String(scope.period)}
          onChange={(e) => {
            const v = e.target.value
            onChange({ ...scope, period: v === 'year' || v === 'current' ? v : Number(v) })
          }}
        >
          <option value="year">Total year</option>
          <option value="current">Current month{dates(current)}</option>
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
              {dates(i + 1)}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString(undefined, { month: 'long' }))
