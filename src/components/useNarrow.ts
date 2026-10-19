import { useEffect, useState } from 'react'

const QUERY = '(max-width: 640px)'

/** True on a phone-wide screen, the same width where the stylesheet switches to its phone layout. */
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches)
  useEffect(() => {
    const list = window.matchMedia?.(QUERY)
    if (!list) return
    const change = () => setNarrow(list.matches)
    list.addEventListener('change', change)
    return () => list.removeEventListener('change', change)
  }, [])
  return narrow
}
