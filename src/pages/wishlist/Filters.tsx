import { useState } from 'react'
import Menu from '../../components/Menu'
import { formatMoney } from '../../domain/money'

const Caret = () => <span className="filter-caret" aria-hidden="true" />

export interface FilterOption {
  value: string
  label: string
  /** Shown faintly after the label, like a count. */
  detail?: string
}

/** A filter that takes several values: a button saying what's picked, opening a list of tick boxes. */
export function MultiFilter({
  label,
  plural,
  options,
  selected,
  onChange,
}: {
  label: string
  plural: string
  options: FilterOption[]
  selected: string[]
  onChange: (values: string[]) => void
}) {
  const [search, setSearch] = useState('')
  const byValue = new Map(options.map((o) => [o.value, o]))
  // A picked value stays listed even when the other filters leave nothing for it.
  const all = [...options, ...selected.filter((v) => !byValue.has(v)).map((v) => ({ value: v, label: v, detail: '0' }))]
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  const list = all.filter((o) => words.every((w) => o.label.toLowerCase().includes(w)))
  const picked = new Set(selected)
  const first = byValue.get(selected[0] ?? '')?.label ?? selected[0]
  const text = selected.length === 0 ? `All ${plural}` : selected.length === 1 ? first : `${first} +${selected.length - 1}`
  const toggle = (v: string) => onChange(picked.has(v) ? selected.filter((s) => s !== v) : [...selected, v])

  return (
    <Menu
      label={`${label} filter`}
      title={selected.length > 1 ? selected.map((v) => byValue.get(v)?.label ?? v).join(', ') : `Filter by ${label.toLowerCase()}`}
      buttonClass={`filter-button${selected.length > 0 ? ' filter-on' : ''}`}
      panelClass="filter-panel"
      align="left"
      icon={
        <>
          <span className="filter-text">{text}</span>
          <Caret />
        </>
      }
    >
      {() => (
        <>
          {all.length > 8 && (
            <input
              type="search"
              className="filter-search"
              autoFocus
              placeholder={`Search ${plural}`}
              aria-label={`Search ${plural}`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          <ul className="filter-options">
            {list.map((o) => (
              <li key={o.value}>
                <label className={picked.has(o.value) ? 'on' : undefined}>
                  <input type="checkbox" checked={picked.has(o.value)} onChange={() => toggle(o.value)} />
                  <span className="filter-option-label">{o.label}</span>
                  {o.detail && <span className="filter-option-detail">{o.detail}</span>}
                </label>
              </li>
            ))}
            {list.length === 0 && <li className="muted small filter-none">No {plural} match.</li>}
          </ul>
          <div className="filter-foot">
            <button type="button" disabled={selected.length === 0} onClick={() => onChange([])}>
              Clear
            </button>
          </div>
        </>
      )}
    </Menu>
  )
}

const STEP = 500

/** Price as a range with two slider handles, between the lowest and highest price in view. */
export function PriceFilter({
  prices,
  value,
  onChange,
}: {
  /** Prices of the items the other filters leave, in cents. */
  prices: number[]
  value: { min?: number; max?: number } | undefined
  onChange: (value: { min?: number; max?: number } | undefined) => void
}) {
  const top = Math.max(STEP, Math.ceil(Math.max(0, ...prices) / STEP) * STEP)
  const lo = Math.min(value?.min ?? 0, top)
  const hi = Math.min(value?.max ?? top, top)
  const on = value?.min !== undefined || value?.max !== undefined
  const euros = (c: number) => formatMoney(c).replace(/\.00$/, '')
  const text = !on ? 'All prices' : value?.min === undefined ? `Up to ${euros(hi)}` : value?.max === undefined ? `From ${euros(lo)}` : `${euros(lo)} – ${euros(hi)}`
  // A handle at either end means no limit on that side.
  const set = (min: number, max: number) => {
    const next = { ...(min > 0 ? { min } : {}), ...(max < top ? { max } : {}) }
    onChange(next.min === undefined && next.max === undefined ? undefined : next)
  }
  // The button keeps the width of its longest possible label, so dragging never resizes it.
  const widest = Math.max(...['All prices', `Up to ${euros(top)}`, `From ${euros(top)}`, `${euros(top)} – ${euros(top)}`].map((t) => t.length))
  const fill = { left: `${(lo / top) * 100}%`, right: `${100 - (hi / top) * 100}%` }

  return (
    <Menu
      label="Price filter"
      title="Filter by price"
      buttonClass={`filter-button price-button${on ? ' filter-on' : ''}`}
      buttonStyle={{ width: `calc(${widest * 1.12}ch + 2.2rem)` }}
      panelClass="filter-panel price-panel"
      align="left"
      icon={
        <>
          <span className="filter-text">{text}</span>
          <Caret />
        </>
      }
    >
      {() => (
        <>
          <div className="price-values">
            <span>{euros(lo)}</span>
            <span>{hi >= top ? `${euros(top)}+` : euros(hi)}</span>
          </div>
          <div className="price-slider">
            <span className="price-track" />
            <span className="price-fill" style={fill} />
            <input
              type="range"
              aria-label="Lowest price"
              min={0}
              max={top}
              step={STEP}
              value={lo}
              onChange={(e) => set(Math.min(Number(e.target.value), hi), hi)}
            />
            <input
              type="range"
              aria-label="Highest price"
              min={0}
              max={top}
              step={STEP}
              value={hi}
              onChange={(e) => set(lo, Math.max(Number(e.target.value), lo))}
            />
          </div>
          <div className="filter-foot">
            <button type="button" disabled={!on} onClick={() => onChange(undefined)}>
              Clear
            </button>
          </div>
        </>
      )}
    </Menu>
  )
}
