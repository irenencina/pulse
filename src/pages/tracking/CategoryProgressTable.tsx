import { useState } from 'react'
import Info from '../../components/Info'
import type { CategoryProgress } from '../../domain/progress'
import { BLOCKS, BLOCK_LABELS, type Block } from '../../domain/types'
import { plainAmount } from './format'

const OPEN_KEY = 'pulse.progressOpen'

const LEFT_LABEL: Record<Block, [string, string]> = {
  income: ['still to come', 'more than planned'],
  expenses: ['left', 'over budget'],
  savings: ['still to put away', 'more than planned'],
}

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== 'no'
  } catch {
    return true
  }
}

/** Planned against tracked for each category of the month, with what's left. */
export default function CategoryProgressTable({ rows, monthName }: { rows: Record<Block, CategoryProgress[]>; monthName: string }) {
  const [open, setOpen] = useState(readOpen)
  if (BLOCKS.every((b) => rows[b].length === 0)) return null
  return (
    <details
      className="progress"
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open
        setOpen(next)
        try {
          localStorage.setItem(OPEN_KEY, next ? 'yes' : 'no')
        } catch {
          // Only remembers whether the table is open.
        }
      }}
    >
      <summary>
        Planned vs tracked by category{' '}
        <Info>
          What you planned for each category in {monthName} in the planner, against what is tracked so far. A parent
          category includes its subcategories. Carry-over from earlier months isn't counted here yet.
        </Info>
      </summary>
      <table className="progress-table">
        <thead>
          <tr>
            <th>Category</th>
            <th className="num">Planned</th>
            <th className="num">Tracked</th>
            <th className="num">Left</th>
            <th aria-label="Progress" />
          </tr>
        </thead>
        {BLOCKS.filter((b) => rows[b].length > 0).map((block) => (
          <tbody key={block} className={`block-${block}`}>
            <tr className="block-row">
              <th colSpan={5}>{BLOCK_LABELS[block]}</th>
            </tr>
            {rows[block].map((r) => {
              const over = r.left < 0
              const share = r.planned > 0 ? Math.min(1, r.tracked / r.planned) : 1
              const [under, beyond] = LEFT_LABEL[block]
              return (
                <tr key={r.category.id} className={over && block === 'expenses' ? 'over' : undefined}>
                  <td style={{ paddingLeft: `${0.5 + r.depth * 1.2}rem` }}>{r.category.name}</td>
                  <td className="num">{plainAmount(r.planned)}</td>
                  <td className="num">{plainAmount(r.tracked)}</td>
                  <td className="num" title={over ? beyond : under}>
                    {over ? `−${plainAmount(-r.left)}` : plainAmount(r.left)}
                  </td>
                  <td className="bar-cell">
                    <span className="bar" aria-hidden="true">
                      <span style={{ width: `${Math.round(share * 100)}%` }} />
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        ))}
      </table>
    </details>
  )
}
