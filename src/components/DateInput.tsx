import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const pad = (n: number) => String(n).padStart(2, '0')
const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "Oct 12, 2026" for a day, "July 2026" for a month. */
export function dateText(value: string, mode: 'day' | 'month'): string {
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m) return ''
  return mode === 'month' ? `${LONG_MONTHS[m - 1]} ${y}` : `${MONTHS[m - 1]} ${pad(d ?? 1)}, ${y}`
}

/**
 * A date (YYYY-MM-DD) or month (YYYY-MM) field with the app's own calendar instead of the browser's:
 * the field shows the date, and a click opens a calendar below it, like every dropdown here.
 */
export default function DateInput({
  value,
  onChange,
  mode = 'day',
  min,
  max,
  required = false,
  label,
  autoFocus,
  placeholder,
  className,
  title,
}: {
  value: string
  onChange: (value: string) => void
  mode?: 'day' | 'month'
  min?: string
  max?: string
  required?: boolean
  label?: string
  autoFocus?: boolean
  placeholder?: string
  /** Extra classes for the field, for a date shown inline. */
  className?: string
  title?: string
}) {
  const today = todayIso()
  const [open, setOpen] = useState(false)
  // The month (day mode) or year (month mode) the calendar shows.
  const [view, setView] = useState(() => (value || today).slice(0, 7))
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !button.current || !panel.current) return
    const b = button.current.getBoundingClientRect()
    const p = panel.current.getBoundingClientRect()
    setAt({ top: b.bottom + 4, left: Math.max(8, Math.min(b.left, window.innerWidth - p.width - 8)) })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Close only the calendar, not a dialog it sits in.
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
        button.current?.focus()
      }
    }
    const onScroll = (e: Event) => {
      if (!panel.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const pick = (next: string) => {
    onChange(next)
    setOpen(false)
    button.current?.focus()
  }
  const outside = (v: string) => (min !== undefined && v < min.slice(0, v.length)) || (max !== undefined && v > max.slice(0, v.length))
  const [vy, vm] = view.split('-').map(Number) as [number, number]
  const step = (by: number) => {
    if (mode === 'month') return setView(`${vy + by}-${pad(vm)}`)
    const d = new Date(vy, vm - 1 + by, 1)
    setView(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
  }

  let grid
  if (mode === 'month') {
    grid = (
      <div className="date-grid months">
        {MONTHS.map((name, i) => {
          const v = `${vy}-${pad(i + 1)}`
          return (
            <button
              key={v}
              type="button"
              className={[v === value ? 'picked' : '', v === today.slice(0, 7) ? 'today' : ''].join(' ').trim() || undefined}
              disabled={outside(v)}
              aria-pressed={v === value}
              onClick={() => pick(v)}
            >
              {name}
            </button>
          )
        })}
      </div>
    )
  } else {
    // Monday-first weeks, starting on the Monday on or before the 1st.
    const first = new Date(vy, vm - 1, 1)
    const lead = (first.getDay() + 6) % 7
    const days = Array.from({ length: 42 }, (_, i) => new Date(vy, vm - 1, 1 - lead + i))
    grid = (
      <div className="date-grid days">
        {WEEKDAYS.map((w) => (
          <span key={w} className="weekday" aria-hidden="true">
            {w}
          </span>
        ))}
        {days.map((d) => {
          const v = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
          const other = d.getMonth() !== vm - 1
          return (
            <button
              key={v}
              type="button"
              className={[v === value ? 'picked' : '', v === today ? 'today' : '', other ? 'other' : ''].join(' ').trim() || undefined}
              disabled={outside(v)}
              aria-pressed={v === value}
              aria-label={dateText(v, 'day')}
              onClick={() => pick(v)}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <span className="date-input">
      <button
        ref={button}
        type="button"
        className={`date-field${value ? '' : ' empty'}${className ? ` ${className}` : ''}`}
        title={title}
        aria-label={label ? `${label}: ${value ? dateText(value, mode) : 'not set'}` : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        autoFocus={autoFocus}
        onClick={() => {
          setView((value || today).slice(0, 7))
          setAt(null)
          setOpen(!open)
        }}
      >
        <span>{value ? dateText(value, mode) : (placeholder ?? (mode === 'month' ? 'Pick a month' : 'Pick a day'))}</span>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3.5 10h17M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {/* Keeps the form's "fill this in" check for a required date. */}
      {required && <input className="date-required" tabIndex={-1} aria-hidden="true" required value={value} onChange={() => {}} />}
      {open &&
        createPortal(
          <div
            ref={panel}
            className="date-panel"
            role="dialog"
            aria-label={label ?? (mode === 'month' ? 'Pick a month' : 'Pick a day')}
            style={at ? { top: at.top, left: at.left } : { top: 0, left: 0, visibility: 'hidden' }}
          >
            <div className="date-head">
              <button type="button" className="icon-button" aria-label={mode === 'month' ? 'Year before' : 'Month before'} onClick={() => step(-1)}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <strong>{mode === 'month' ? vy : `${LONG_MONTHS[vm - 1]} ${vy}`}</strong>
              <button type="button" className="icon-button" aria-label={mode === 'month' ? 'Year after' : 'Month after'} onClick={() => step(1)}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            {grid}
            <div className="date-foot">
              {!required && value ? (
                <button type="button" onClick={() => pick('')}>
                  Clear
                </button>
              ) : (
                <span />
              )}
              <button type="button" disabled={outside(mode === 'month' ? today.slice(0, 7) : today)} onClick={() => pick(mode === 'month' ? today.slice(0, 7) : today)}>
                {mode === 'month' ? 'This month' : 'Today'}
              </button>
            </div>
          </div>,
          button.current?.closest('dialog') ?? document.body,
        )}
    </span>
  )
}
