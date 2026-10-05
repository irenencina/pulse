import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * A ⋯ button that opens a small list of actions next to it. Drawn on top of the page so a
 * rounded box can't clip it; closes on a click outside, Escape, or after picking an item.
 */
export default function Menu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)
  const close = () => setOpen(false)

  useLayoutEffect(() => {
    if (!open || !button.current || !panel.current) return
    const b = button.current.getBoundingClientRect()
    const p = panel.current.getBoundingClientRect()
    const left = Math.max(8, Math.min(b.right - p.width, window.innerWidth - p.width - 8))
    const below = b.bottom + 4
    const top = below + p.height > window.innerHeight - 8 ? Math.max(8, b.top - p.height - 4) : below
    setAt({ top, left })
  }, [open])

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
    const onScroll = () => close()
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
        className="icon-button menu-button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setAt(null)
          setOpen(!open)
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="5" cy="12" r="1.7" fill="currentColor" />
          <circle cx="12" cy="12" r="1.7" fill="currentColor" />
          <circle cx="19" cy="12" r="1.7" fill="currentColor" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            className="menu"
            role="menu"
            style={at ? { top: at.top, left: at.left } : { top: 0, left: 0, visibility: 'hidden' }}
          >
            {children(close)}
          </div>,
          button.current?.closest('dialog') ?? document.body,
        )}
    </>
  )
}
