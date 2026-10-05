import { useState, type MouseEvent } from 'react'

const INTERACTIVE = 'input, select, button, a, textarea, label, summary, .tag-input'

/**
 * Spreadsheet-style row selection for lists: click selects a row, Ctrl/Cmd+click adds or
 * removes one, Shift+click selects everything from the last clicked row. Clicks on
 * buttons, inputs and selects are left alone, so the row's own controls keep working.
 */
export function useRowSelection(keys: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)

  const range = (from: string, to: string) => {
    const a = keys.indexOf(from)
    const b = keys.indexOf(to)
    if (a < 0 || b < 0) return [to]
    return keys.slice(Math.min(a, b), Math.max(a, b) + 1)
  }

  const onRowClick = (e: MouseEvent, key: string) => {
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return
    if (e.shiftKey && anchor) {
      e.preventDefault()
      window.getSelection()?.removeAllRanges()
      setSelected(new Set(range(anchor, key)))
      return
    }
    if (e.ctrlKey || e.metaKey) {
      setSelected((s) => {
        const next = new Set(s)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
    } else {
      setSelected(new Set([key]))
    }
    setAnchor(key)
  }

  return {
    // Only keys still in the list count; rows can disappear after an edit.
    selected: new Set([...selected].filter((k) => keys.includes(k))),
    onRowClick,
    range,
    clear: () => setSelected(new Set()),
    /** The rows a change to `key` applies to: the whole selection if `key` is part of it. */
    targetsOf: (key: string) => (selected.has(key) && selected.size > 1 ? [...selected].filter((k) => keys.includes(k)) : [key]),
  }
}
