import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * A ⋯ button that opens a small list of actions next to it. Drawn on top of the page so a
 * rounded box can't clip it; closes on a click outside, Escape, or after picking an item.
 */
export default function Menu({
  label,
  children,
  icon,
  title,
  buttonClass = 'icon-button menu-button',
  panelClass = 'menu',
  align = 'right',
  buttonStyle,
}: {
  label: string
  children: (close: () => void) => ReactNode
  /** Instead of ⋯. */
  icon?: ReactNode
  /** Hover text, when it should say more than the label. */
  title?: string
  buttonClass?: string
  panelClass?: string
  /** Which edge of the button the panel lines up with, when it fits. */
  align?: 'left' | 'right'
  buttonStyle?: CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  const close = () => setOpen(false)

  useLayoutEffect(() => {
    if (!open || !button.current || !panel.current) return
    const b = button.current.getBoundingClientRect()
    const p = panel.current.getBoundingClientRect()
    // Right-aligned with the button, or left-aligned when that would run off the left side.
    const fromLeft = Math.max(8, Math.min(b.left, window.innerWidth - p.width - 8))
    const left =
      align === 'left' ? fromLeft : b.right - p.width >= 8 ? Math.min(b.right - p.width, window.innerWidth - p.width - 8) : fromLeft
    // Always below the button, like every dropdown; a long one scrolls inside rather than flipping up.
    const top = b.bottom + 4
    setAt({ top, left, maxHeight: Math.max(120, window.innerHeight - top - 8) })
  }, [open, align])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!panel.current?.contains(target) && !button.current?.contains(target)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
        button.current?.focus()
      }
    }
    // Scrolling the page moves the button away, so close; scrolling inside the panel is fine.
    const onScroll = (e: Event) => {
      if (!panel.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={button}
        type="button"
        className={buttonClass}
        style={buttonStyle}
        aria-label={label}
        title={title ?? label}
        aria-haspopup={panelClass === 'menu' ? 'menu' : 'dialog'}
        aria-expanded={open}
        onClick={() => {
          setAt(null)
          setOpen(!open)
        }}
      >
        {icon ?? (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <circle cx="5" cy="12" r="1.7" fill="currentColor" />
            <circle cx="12" cy="12" r="1.7" fill="currentColor" />
            <circle cx="19" cy="12" r="1.7" fill="currentColor" />
          </svg>
        )}
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            className={panelClass}
            role={panelClass === 'menu' ? 'menu' : 'dialog'}
            aria-label={label}
            style={at ? { top: at.top, left: at.left, maxHeight: at.maxHeight } : { top: 0, left: 0, visibility: 'hidden' }}
          >
            {children(close)}
          </div>,
          button.current?.closest('dialog') ?? document.body,
        )}
    </>
  )
}
