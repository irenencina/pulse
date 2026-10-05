import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { formatTag, normaliseTagName } from '../domain/tags'
import type { Tag } from '../domain/types'

interface Props {
  /** Tag names applied now, without '#'. */
  value: string[]
  onChange: (names: string[]) => void
  /** Every tag that exists, offered while typing. */
  tags: Tag[]
  label: string
  placeholder?: string
}

/**
 * Applied tags as boxes, each with a × to remove it, and a box to type more.
 * Typing lists the existing tags that match; Enter (or a click on one) applies it, a comma applies what's typed,
 * Backspace in the empty box removes the last tag.
 */
export default function TagInput({ value, onChange, tags, label, placeholder = '#tag' }: Props) {
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  /** True once the arrow keys moved through the list, so Enter picks from it even with nothing typed. */
  const [browsing, setBrowsing] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLDivElement>(null)
  // The list is placed on the page itself, so a scrolling table around the box can't cut it off.
  const [place, setPlace] = useState<CSSProperties>({})

  const typed = normaliseTagName(draft)
  const options = tags
    .filter((t) => !t.archived)
    .map((t) => t.name)
    .filter((name) => !value.includes(name) && (typed === '' || name.includes(typed)))
    .sort((a, b) => Number(!b.startsWith(typed)) - Number(!a.startsWith(typed)) || a.localeCompare(b))
    .slice(0, 8)
  const isNew = typed !== '' && !value.includes(typed) && !tags.some((t) => t.name === typed)
  // The list: matching tags, then "create #typed" when it doesn't exist yet.
  const choices = isNew ? [...options, typed] : options

  const apply = (name: string) => {
    if (name && !value.includes(name)) onChange([...value, name])
    setDraft('')
    setActive(0)
    setBrowsing(false)
    input.current?.focus()
  }
  const showList = open && choices.length > 0
  useLayoutEffect(() => {
    if (!showList) return
    const update = () => {
      const r = box.current!.getBoundingClientRect()
      const below = window.innerHeight - r.bottom
      setPlace(
        below < 220 && r.top > below
          ? { position: 'fixed', left: r.left, bottom: window.innerHeight - r.top + 2, top: 'auto' }
          : { position: 'fixed', left: r.left, top: r.bottom + 2 },
      )
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [showList])

  const remove = (name: string) => onChange(value.filter((n) => n !== name))

  return (
    <div
      ref={box}
      className="tag-input"
      onClick={() => input.current?.focus()}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false)
          // Whatever was typed but not confirmed still counts.
          if (typed) apply(typed)
        }
      }}
    >
      {value.map((name) => (
        <span key={name} className="tag-chip">
          {formatTag(name)}
          <button
            type="button"
            className="tag-remove"
            aria-label={`Remove ${formatTag(name)}`}
            title={`Remove ${formatTag(name)}`}
            onClick={(e) => {
              e.stopPropagation()
              remove(name)
            }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={input}
        aria-label={label}
        placeholder={value.length === 0 ? placeholder : ''}
        value={draft}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setDraft(e.target.value)
          setActive(0)
          setBrowsing(false)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (typed || (browsing && open))) {
            // The highlighted suggestion, or the typed tag. With nothing typed, Enter submits the form.
            e.preventDefault()
            apply(open && choices[active] ? choices[active]! : typed)
          } else if (e.key === ',' && typed) {
            e.preventDefault()
            apply(typed)
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setBrowsing(true)
            setActive((i) => Math.min(i + 1, choices.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Escape') {
            setOpen(false)
            setDraft('')
          } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
            remove(value[value.length - 1]!)
          }
        }}
      />
      {showList && (
        <ul className="tag-options" role="listbox" aria-label="Suggested tags" style={place}>
          {choices.map((name, i) => (
            <li key={name}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={i === active ? 'active' : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation()
                  apply(name)
                }}
              >
                {isNew && name === typed && i === choices.length - 1 ? `Create ${formatTag(name)}` : formatTag(name)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
