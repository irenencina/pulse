import { useState } from 'react'

interface Props {
  value: string
  onSave: (value: string) => Promise<unknown> | void
  label: string
  display?: (value: string) => string
  /** Hover text; defaults to "Rename …". */
  title?: string
  /** Extra look for the text, e.g. 'tag-chip'. */
  className?: string
}

/** Text that turns into an input when clicked. Enter saves, Escape cancels. */
export default function InlineEdit({ value, onSave, label, display = (v) => v, title, className }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (!editing) {
    return (
      <button
        type="button"
        className={className ? `inline-edit ${className}` : 'inline-edit'}
        title={title ?? `Rename ${value}`}
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
      >
        {display(value)}
      </button>
    )
  }

  const save = async () => {
    setEditing(false)
    if (draft.trim() && draft !== value) await onSave(draft)
  }

  return (
    <input
      autoFocus
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void save()
        if (e.key === 'Escape') setEditing(false)
      }}
    />
  )
}
