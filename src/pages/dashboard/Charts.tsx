import type { MonthBars, Slice } from '../../domain/dashboard'
import type { MonthKey } from '../../domain/periods'
import { BLOCK_LABELS, type Block } from '../../domain/types'
import { monthLabel, plainAmount } from '../tracking/format'

/** Shades of the block's colour, darkest for the biggest slice. */
const SHADES = [100, 78, 60, 45, 32, 20]
const shade = (block: Block, i: number) => `color-mix(in srgb, var(--${block}) ${SHADES[i % SHADES.length]}%, #fff)`
/** Transactions without a category are grey, so they don't read as a category. */
const colour = (block: Block, slices: Slice[], i: number) =>
  slices[i]!.id === 'none' ? 'var(--muted)' : shade(block, slices.slice(0, i).filter((s) => s.id !== 'none').length)

/** A ring split by category, with a legend. Top 5 plus "Other", like the spreadsheet. */
export function Donut({ block, slices }: { block: Block; slices: Slice[] }) {
  const total = slices.reduce((sum, s) => sum + s.cents, 0)
  const r = 38
  const length = 2 * Math.PI * r
  let offset = 0
  return (
    <figure className={`donut block-${block}`}>
      <figcaption>{BLOCK_LABELS[block]}</figcaption>
      {total === 0 ? (
        <p className="muted small">Nothing tracked yet.</p>
      ) : (
        <div className="donut-body">
          <svg viewBox="0 0 100 100" role="img" aria-label={`${BLOCK_LABELS[block]} by category`}>
            <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border)" strokeWidth="16" />
            {slices.map((s, i) => {
              const part = (s.cents / total) * length
              const circle = (
                <circle
                  key={s.id}
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  stroke={colour(block, slices, i)}
                  strokeWidth="16"
                  strokeDasharray={`${part} ${length - part}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 50 50)"
                >
                  <title>
                    {s.name}: {plainAmount(s.cents)} ({Math.round((s.cents / total) * 100)}%)
                  </title>
                </circle>
              )
              offset += part
              return circle
            })}
            <text x="50" y="54" textAnchor="middle" className="donut-total">
              {plainAmount(total)}
            </text>
          </svg>
          <ul className="legend">
            {slices.map((s, i) => (
              <li key={s.id}>
                <span className="swatch" style={{ background: colour(block, slices, i) }} aria-hidden="true" />
                <span className="legend-name">{s.name}</span>
                <span className="legend-share">{Math.round((s.cents / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  )
}

/** Planned (light) against tracked (solid) per month for one block. The picked months stand out. */
export function MonthChart({ bars, block, picked }: { bars: MonthBars[]; block: Block; picked: MonthKey[] }) {
  const max = Math.max(1, ...bars.flatMap((b) => [b.planned[block], b.tracked[block]]))
  return (
    <div className={`month-chart block-${block}`} role="img" aria-label={`${BLOCK_LABELS[block]}: planned and tracked per month`}>
      {bars.map((b) => (
        <div
          key={b.month}
          className={`month-col${picked.includes(b.month) ? ' picked' : ''}`}
          title={`${monthLabel(b.month)}: ${plainAmount(b.tracked[block])} tracked of ${plainAmount(b.planned[block])} planned`}
        >
          <div className="month-bars">
            <span className="bar-planned" style={{ height: `${(b.planned[block] / max) * 100}%` }} />
            <span className="bar-tracked" style={{ height: `${(b.tracked[block] / max) * 100}%` }} />
          </div>
          <span className="month-name">{monthLabel(b.month, 'month')}</span>
        </div>
      ))}
    </div>
  )
}
