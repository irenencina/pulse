import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const GAP = 6
const MARGIN = 16

/**
 * A small ⓘ that shows an explanation on hover, keyboard focus or tap. The tip is drawn on top
 * of the page (not inside the table it sits in), so sticky columns and scrolling tables can't
 * cover or cut it off. It opens below the ⓘ, or above it when there's no room below.
 */
export default function Info({ children, label = 'More information' }: { children: ReactNode; label?: string }) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const tip = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const rect = button.current?.getBoundingClientRect()
    const box = tip.current?.getBoundingClientRect()
    if (!rect || !box) return
    const left = Math.max(MARGIN, Math.min(rect.left + rect.width / 2 - box.width / 2, window.innerWidth - box.width - MARGIN))
    const below = rect.bottom + GAP
    const fitsBelow = below + box.height <= window.innerHeight - MARGIN
    const top = fitsBelow || rect.top - GAP - box.height < MARGIN ? below : rect.top - GAP - box.height
    setPlace({ top, left })
  }, [open])

  const show = () => setOpen(true)
  const hide = () => {
    setOpen(false)
    setPlace(null)
  }
  // Inside the Settings pop-up the tip must live in the pop-up, or the pop-up would cover it.
  const host = open ? (button.current?.closest('dialog') ?? document.body) : null

  return (
    <span className="info" onMouseEnter={show} onMouseLeave={hide}>
      <button
        ref={button}
        type="button"
        className="info-btn"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (open) hide()
          else show()
        }}
      >
        i
      </button>
      {host &&
        createPortal(
          <span
            id={id}
            ref={tip}
            role="tooltip"
            className="info-tip"
            style={place ? { top: place.top, left: place.left } : { top: 0, left: 0, visibility: 'hidden' }}
          >
            {children}
          </span>,
          host,
        )}
    </span>
  )
}
