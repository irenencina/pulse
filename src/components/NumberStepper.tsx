import { useEffect, useState } from 'react'
import { MinusIcon, PlusIcon } from './icons'

/** A whole number between min and max: − and + buttons, or type it. The unit sits outside the box. */
export default function NumberStepper({
  value,
  min,
  max,
  unit,
  label,
  disabled,
  onChange,
}: {
  value: number
  min: number
  max: number
  /** Shown after the box, e.g. "uses"; pass the singular and plural. */
  unit?: [string, string]
  label: string
  disabled?: boolean
  onChange: (value: number) => void
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const commit = (n: number) => {
    const clamped = Math.min(max, Math.max(min, Math.round(n)))
    setText(String(clamped))
    if (clamped !== value) onChange(clamped)
  }
  return (
    <span className="stepper">
      <span className="stepper-box">
        <button type="button" aria-label={`Fewer: ${label}`} disabled={disabled || value <= min} onClick={() => commit(value - 1)}>
          <MinusIcon />
        </button>
        <input
          aria-label={label}
          inputMode="numeric"
          disabled={disabled}
          value={text}
          onChange={(e) => setText(e.target.value.replace(/\D/g, ''))}
          onBlur={() => commit(Number(text) || value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(Number(text) || value)
            else if (e.key === 'ArrowUp') (e.preventDefault(), commit(value + 1))
            else if (e.key === 'ArrowDown') (e.preventDefault(), commit(value - 1))
          }}
        />
        <button type="button" aria-label={`More: ${label}`} disabled={disabled || value >= max} onClick={() => commit(value + 1)}>
          <PlusIcon />
        </button>
      </span>
      {unit && <span className="stepper-unit">{value === 1 ? unit[0] : unit[1]}</span>}
    </span>
  )
}
