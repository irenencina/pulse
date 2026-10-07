import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const GAP = 8
const MARGIN = 16
/** Hovering opens the tip only after a short rest, so moving past an ⓘ doesn't open it. */
const HOVER_DELAY = 450

/**
 * A small ⓘ that shows an explanation on hover, keyboard focus or tap. The tip is drawn on top
 * of the page (not inside the table it sits in), so sticky columns and scrolling tables can't
 * cover or cut it off. It opens beside the ⓘ (right, or left next to a setting's label), so the
 * controls below and beside it stay visible; only when neither side has room does it open below or above.
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
    // Inside the Settings pop-up the tip must stay within the pop-up, which cuts off anything outside it.
    const dialog = button.current?.closest('dialog')?.getBoundingClientRect()
    const area = dialog ?? { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight }
    const clampTop = (t: number) => Math.max(area.top + MARGIN, Math.min(t, area.bottom - box.height - MARGIN))
    const clampLeft = (l: number) => Math.max(area.left + MARGIN, Math.min(l, area.right - box.width - MARGIN))
    const middle = clampTop(rect.top + rect.height / 2 - box.height / 2)
    const centred = clampLeft(rect.left + rect.width / 2 - box.width / 2)
    const right = rect.right + GAP
    const leftSide = rect.left - GAP - box.width
    const above = rect.top - GAP - box.height
    const below = rect.bottom + GAP
    const fitsRight = right + box.width <= area.right - MARGIN
    const fitsLeft = leftSide >= area.left + MARGIN
    const fitsAbove = above >= area.top + MARGIN
    const fitsBelow = below + box.height <= area.bottom - MARGIN
    let top: number
    let left: number
    // Next to a setting's label its control sits on the right, so there the tip goes left, else above.
    if (button.current?.closest('.field-label')) {
      if (fitsLeft) [top, left] = [middle, leftSide]
      else if (fitsAbove) [top, left] = [above, centred]
      else [top, left] = [fitsBelow ? below : middle, centred]
    } else if (fitsRight) [top, left] = [middle, right]
    else if (fitsLeft) [top, left] = [middle, leftSide]
    else [top, left] = [fitsBelow || !fitsAbove ? below : above, centred]
    setPlace({ top, left })
  }, [open])

  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const show = () => {
    window.clearTimeout(timer.current)
    setOpen(true)
  }
  const showSoon = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(true), HOVER_DELAY)
  }
  const hide = () => {
    window.clearTimeout(timer.current)
    setOpen(false)
    setPlace(null)
  }
  // Inside the Settings pop-up the tip must live in the pop-up, or the pop-up would cover it.
  const host = open ? (button.current?.closest('dialog') ?? document.body) : null

  return (
    <span className="info" onMouseEnter={showSoon} onMouseLeave={hide}>
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
