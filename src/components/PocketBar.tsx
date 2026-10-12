import { useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { plainAmount } from '../pages/tracking/format'

export interface BarPiece {
  /** Which tip row it belongs to. */
  key: string
  cents: number
  /** CSS classes: a pattern (p0–p5), "rest", "carried", "still", plus "above" for the darker shade. */
  kind: string
}

export interface TipRow {
  key: string
  swatch: string
  text: string
  cents: number
  /** Indented under the row above. */
  sub?: boolean
}

/**
 * A pocket's bar in its colour: pieces side by side over a grey track as long as `whole`. A band
 * around the thin bar answers the mouse, and the piece under the pointer is picked by how far along
 * it is; its numbers show in a dark box like the ⓘ tips.
 */
export default function PocketBar({ colour, pieces, whole, rows, footer, label }: { colour: string; pieces: BarPiece[]; whole: number; rows: TipRow[]; footer?: string; label: string }) {
  const [tip, setTip] = useState<{ x: number; top: number; bottom: number; key: string } | null>(null)
  if (whole <= 0) return null
  const shown = pieces.filter((p) => p.cents > 0)
  const share = (cents: number) => `${(cents / whole) * 100}%`
  const hover = (e: MouseEvent<HTMLSpanElement>) => {
    const bar = e.currentTarget.querySelector('.pocket-bar')!.getBoundingClientRect()
    const along = Math.max(0, Math.min(1, (e.clientX - bar.left) / bar.width)) * whole
    let sum = 0
    const piece = shown.find((p) => (sum += p.cents) >= along)
    setTip({ x: Math.max(bar.left, Math.min(e.clientX, bar.right)), top: bar.top, bottom: bar.bottom, key: piece?.key ?? 'rest' })
  }
  return (
    <span className="pocket-hit" onMouseMove={hover} onMouseLeave={() => setTip(null)}>
      <span className="pocket-bar" role="img" aria-label={label} style={{ ['--base' as string]: colour }}>
        {shown.map((p, i) => (
          <span key={`${p.key}-${i}`} className={`${p.kind}${tip?.key === p.key ? ' on' : ''}`} style={{ width: share(p.cents) }} />
        ))}
      </span>
      {tip &&
        createPortal(
          <span
            className="info-tip pocket-tip"
            role="tooltip"
            style={{
              left: Math.max(16, Math.min(tip.x - 112, window.innerWidth - 340)),
              ...(tip.top > 220 ? { bottom: window.innerHeight - tip.top + 12 } : { top: tip.bottom + 12 }),
              ['--base' as string]: colour,
            }}
          >
            {rows.map((r) => (
              <span key={r.key} className={`${tip.key === r.key ? 'on' : ''}${r.sub ? ' sub' : ''}`}>
                <i className={r.swatch} />
                {r.text}
                <b>{plainAmount(r.cents)}</b>
              </span>
            ))}
            {footer && <small>{footer}</small>}
          </span>,
          document.body,
        )}
    </span>
  )
}
