import { useState } from 'react'

/** Which categories are collapsed on a page, remembered in this browser. */
export function useCollapsed(page: string) {
  const key = `pulse.collapsed.${page}`
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[])
    } catch {
      return new Set()
    }
  })
  const save = (next: ReadonlySet<string>) => {
    setCollapsed(next)
    try {
      localStorage.setItem(key, JSON.stringify([...next]))
    } catch {
      // Private windows may refuse; it then only lasts until the page is closed.
    }
  }
  const toggle = (id: string) => {
    const next = new Set(collapsed)
    if (!next.delete(id)) next.add(id)
    save(next)
  }
  return { collapsed, toggle, setAll: (ids: Iterable<string>) => save(new Set(ids)) }
}
