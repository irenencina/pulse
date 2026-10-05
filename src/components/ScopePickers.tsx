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
  // "This month" and "this year" are simply where the pickers start.
  const today = todayIso()
  const yearValue = scope.year === 'current' ? Number(today.slice(0, 4)) : scope.year
  const periodValue = scope.period === 'current' ? Number(today.slice(5, 7)) : scope.period
  const yearOptions = [...new Set([...years, yearValue])].sort((a, b) => b - a)
  return (
    <div className="scope-pickers">
      <label>
        <span>Year</span>
        <select
          aria-label="Year"
          value={String(yearValue)}
          onChange={(e) => onChange({ ...scope, year: Number(e.target.value) })}
        >
          {yearOptions.map((y) => (
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
          value={String(periodValue)}
          onChange={(e) => {
            const v = e.target.value
            onChange({ ...scope, period: v === 'year' ? v : Number(v) })
          }}
        >
          <option value="year">Whole year</option>
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
