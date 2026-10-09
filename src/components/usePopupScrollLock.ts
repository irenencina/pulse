import { useEffect } from 'react'

/** True when `el` can still scroll further in the direction of `delta`. */
function canScroll(el: Element, deltaX: number, deltaY: number): boolean {
  const style = getComputedStyle(el)
  const y = /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight
  const x = /(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth
  if (y && deltaY !== 0) return deltaY < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1
  if (x && deltaX !== 0) return deltaX < 0 ? el.scrollLeft > 0 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1
  return false
}

/** Wheel distances in pixels, whether the browser reports them in pixels, lines or pages. */
function inPixels(e: WheelEvent, el: Element): [number, number] {
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1
  return [e.deltaX * unit, e.deltaY * unit]
}

/**
 * While a pop-up is open the page behind it stays put, but keeps its scroll bar (hiding it
 * would shift the page). The wheel only scrolls lists inside the pop-up; anywhere else,
 * including the dimmed backdrop, it does nothing. Pulse scrolls the right list itself, so a
 * small box under the pointer (a dropdown, a row) can never catch the wheel and stop it.
 */
export function usePopupScrollLock() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const open = document.querySelector('dialog[open]')
      if (!open) return
      // An open list inside a text box or a dropdown scrolls by itself.
      if (e.target instanceof HTMLTextAreaElement) return
      let el = e.target instanceof Element ? e.target : null
      e.preventDefault()
      while (el && el !== open) {
        if (canScroll(el, e.deltaX, e.deltaY)) break
        el = el.parentElement
      }
      if (!el || (el === open && !canScroll(open, e.deltaX, e.deltaY))) return
      const [dx, dy] = inPixels(e, el)
      el.scrollBy({ left: dx, top: dy })
    }
    document.addEventListener('wheel', onWheel, { passive: false })
    return () => document.removeEventListener('wheel', onWheel)
  }, [])
}
