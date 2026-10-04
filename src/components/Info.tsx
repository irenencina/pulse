import { useId, useRef, useState, type ReactNode } from 'react'

/**
 * A small ⓘ that shows an explanation on hover, keyboard focus or tap. The tip is
 * positioned against the window, so scrolling tables don't cut it off.
 */
export default function Info({ children, label = 'More information' }: { children: ReactNode; label?: string }) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  const show = () => {
    const rect = button.current?.getBoundingClientRect()
    if (!rect) return
    const width = Math.min(288, window.innerWidth - 32)
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16))
    setPosition({ top: rect.bottom + 6, left })
  }
  const hide = () => setPosition(null)

  return (
    <span className="info" onMouseEnter={show} onMouseLeave={hide}>
      <button
        ref={button}
        type="button"
        className="info-btn"
        aria-label={label}
        aria-describedby={position ? id : undefined}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (position) hide()
          else show()
        }}
      >
        i
      </button>
      {position && (
        <span id={id} role="tooltip" className="info-tip" style={{ top: position.top, left: position.left }}>
          {children}
        </span>
      )}
    </span>
  )
}
