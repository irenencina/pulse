import Info from '../../components/Info'
import Twisty from '../../components/Twisty'
import { useCollapsed } from '../../components/useCollapsed'
import { otherLabel, visibleRows } from '../../domain/categories'
import type { CategoryProgress } from '../../domain/progress'
import { BLOCKS, BLOCK_LABELS, type Block } from '../../domain/types'
import { plainAmount } from './format'

const LEFT_LABEL: Record<Block, [string, string]> = {
  income: ['still to come', 'more than planned'],
  expenses: ['left', 'over budget'],
  savings: ['still to put away', 'more than planned'],
}

/** Planned against tracked for each category in the picked period, with what's left. */
export default function CategoryProgressTable({ rows, scopeName }: { rows: Record<Block, CategoryProgress[]>; scopeName: string }) {
  const fold = useCollapsed('tracking')
  return (
    <div className="progress" aria-label="Planned vs Tracked">
      <h2>
        Planned vs Tracked{' '}
        <Info>
          What you planned for each category in {scopeName} in the planner, against what is tracked so far. Only
          categories with something tracked are shown, and a parent category includes its subcategories. Carry-over from earlier months isn't counted here yet.
        </Info>
      </h2>
      {BLOCKS.every((b) => rows[b].length === 0) ? (
        <p className="muted small">Nothing tracked in {scopeName} yet.</p>
      ) : (
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
            <tr className="block-row block-head">
              <th colSpan={5}>{BLOCK_LABELS[block]}</th>
            </tr>
            {visibleRows(rows[block], fold.collapsed).map((r) => {
              const over = r.left < 0
              const share = r.planned > 0 ? Math.min(1, r.tracked / r.planned) : 1
              const [under, beyond] = LEFT_LABEL[block]
              return (
                <tr key={r.other ? `${r.category.id}:other` : r.category.id} className={[over && block === 'expenses' ? 'over' : '', r.other ? 'other-row' : '', r.hasChildren ? 'parent' : ''].join(' ').trim() || undefined}>
                  <td style={{ paddingLeft: `${0.25 + r.depth * 1.2}rem` }}>
                    <Twisty
                      name={r.category.name}
                      show={r.hasChildren}
                      open={!fold.collapsed.has(r.category.id)}
                      onToggle={() => fold.toggle(r.category.id)}
                    />
                    {r.other ? otherLabel(r.category.name) : r.category.name}
                  </td>
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
      )}
    </div>
  )
}
