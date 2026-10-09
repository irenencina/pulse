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

/**
 * A ring split by category, with a legend. Top 5 plus "Other", like the spreadsheet.
 * When more is tracked than planned, a thin outer arc marks the part above the plan, running
 * clockwise from the top: dark green for income and savings, dark red for expenses.
 */
export function Donut({ block, slices, planned }: { block: Block; slices: Slice[]; planned: number }) {
  const total = slices.reduce((sum, s) => sum + s.cents, 0)
  const r = 38
  const length = 2 * Math.PI * r
  const above = planned > 0 && total > planned ? total - planned : 0
  const outer = 47
  const outerLength = 2 * Math.PI * outer
  const aboveLength = (above / Math.max(1, total)) * outerLength
  let offset = 0
  return (
    <figure className={`donut block-${block}${total === 0 ? ' empty' : ''}`}>
      <figcaption>{BLOCK_LABELS[block]}</figcaption>
      {total === 0 ? (
        <div className="donut-body">
          <svg viewBox="0 0 100 100" role="img" aria-label={`${BLOCK_LABELS[block]}: nothing tracked yet`}>
            <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border)" strokeWidth="16" />
            <text x="50" y="54" textAnchor="middle" className="donut-total">
              –
            </text>
          </svg>
          <ul className="legend">
            <li>
              <span className="swatch" style={{ background: 'var(--border)' }} aria-hidden="true" />
              <span className="legend-name">Nothing tracked yet</span>
              <span className="legend-share">– %</span>
            </li>
          </ul>
        </div>
      ) : (
        <div className="donut-body">
          <svg viewBox="0 0 100 100" role="img" aria-label={`${BLOCK_LABELS[block]} by category`}>
            <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border)" strokeWidth="16" />
            {above > 0 && (
              <circle
                className="above-plan"
                cx="50"
                cy="50"
                r={outer}
                fill="none"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${aboveLength} ${outerLength - aboveLength}`}
                transform="rotate(-90 50 50)"
              >
                <title>
                  {plainAmount(above)} above the {plainAmount(planned)} planned
                </title>
              </circle>
            )}
            {slices.map((s, i) => {
              const part = (s.cents / total) * length
              // Each slice runs a hair into the next one (drawn on top of it), so no thin gap shows
              // between them; a slice that is the whole ring gets no dashes, so it has no seam at all.
              const whole = part >= length - 0.01
              const circle = (
                <circle
                  key={s.id}
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  stroke={colour(block, slices, i)}
                  strokeWidth="16"
                  strokeDasharray={whole ? undefined : `${part + 0.6} ${Math.max(0, length - part - 0.6)}`}
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
            {above > 0 && (
              <li className="legend-above">
                <span className="swatch" aria-hidden="true" />
                <span className="legend-name">Above plan</span>
                <span className="legend-share">+{plainAmount(above)}</span>
              </li>
            )}
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

/** Planned (light) against tracked (solid) per month for one block. The picked months stand out; clicking a month opens it. */
export function MonthChart({
  bars,
  pretend = {},
  block,
  picked,
  onPick,
}: {
  bars: MonthBars[]
  /** The pretend part of each month's tracked amounts (playground forecast), drawn striped. */
  pretend?: Record<MonthKey, Record<Block, number>>
  block: Block
  picked: MonthKey[]
  onPick: (month: MonthKey) => void
}) {
  const max = Math.max(1, ...bars.flatMap((b) => [b.planned[block], b.tracked[block]]))
  return (
    <div className={`month-chart block-${block}`} aria-label={`${BLOCK_LABELS[block]}: planned and tracked per month`}>
      {bars.map((b) => (
        <button
          type="button"
          key={b.month}
          className={`month-col${picked.includes(b.month) ? ' picked' : ''}`}
          aria-pressed={picked.includes(b.month)}
          title={`${monthLabel(b.month)}: ${plainAmount(b.tracked[block])} tracked${pretend[b.month]?.[block] ? ` (incl. ${plainAmount(pretend[b.month]![block])} pretend)` : ''} of ${plainAmount(b.planned[block])} planned. Click to open this month.`}
          onClick={() => onPick(b.month)}
        >
          <div className="month-bars">
            <span className="bar-planned" style={{ height: `${(b.planned[block] / max) * 100}%` }} />
            <span className="bar-tracked" style={{ height: `${(b.tracked[block] / max) * 100}%` }}>
              {(pretend[b.month]?.[block] ?? 0) > 0 && (
                <span className="bar-pretend" style={{ height: `${(pretend[b.month]![block] / Math.max(1, b.tracked[block])) * 100}%` }} />
              )}
            </span>
          </div>
          <span className="month-name">{monthLabel(b.month, 'month')}</span>
        </button>
      ))}
    </div>
  )
}
