import type { CSSProperties } from 'react'

/** One of a few options in a pill, with a highlight that slides to the picked one. */
export default function SlideChoice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div className="slide-choice" role="radiogroup" aria-label={label} style={{ '--count': options.length, '--index': index } as CSSProperties}>
      <span className="slide-thumb" aria-hidden="true" />
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
