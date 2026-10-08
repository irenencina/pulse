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

/**
 * While a pop-up is open the page behind it stays put, but keeps its scroll bar (hiding it
 * would shift the page). The wheel only scrolls lists inside the pop-up; anywhere else,
 * including the dimmed backdrop, it does nothing.
 */
export function usePopupScrollLock() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const open = document.querySelector('dialog[open]')
      if (!open) return
      let el = e.target instanceof Element ? e.target : null
      while (el && el !== open) {
        if (canScroll(el, e.deltaX, e.deltaY)) return
        el = el.parentElement
      }
      if (el === open && canScroll(open, e.deltaX, e.deltaY)) return
      e.preventDefault()
    }
    document.addEventListener('wheel', onWheel, { passive: false })
    return () => document.removeEventListener('wheel', onWheel)
  }, [])
}
