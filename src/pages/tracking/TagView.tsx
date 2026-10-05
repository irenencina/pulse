import { useState } from 'react'
import Info from '../../components/Info'
import type { MonthKey, MonthRule } from '../../domain/periods'
import { tagStats } from '../../domain/tagStats'
import { formatTag } from '../../domain/tags'
import type { Transaction } from '../../domain/transactions'
import type { Category, Tag } from '../../domain/types'
import { plainAmount } from './format'

/** What each tag adds up to in the picked period, and budgets per tag. */
export default function TagView({
  transactions,
  tags,
  categories,
  months,
  settings,
  scopeName,
  picked,
  onPick,
}: {
  transactions: Transaction[]
  tags: Tag[]
  categories: Category[]
  months: MonthKey[]
  settings: MonthRule
  scopeName: string
  /** The tag the ledger is filtered on, if any. */
  picked: string | null
  onPick: (tagId: string | null) => void
}) {
  const rows = tagStats(transactions, tags, categories, months, settings)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  return (
    <div className="tag-view">
      <h2>
        Tags in {scopeName}{' '}
        <Info>
          What each tag adds up to in the period picked above. The arrow shows its split by category; click a tag to see
          its transactions below. A budget counts everything with that tag, whenever it was. To tag the days of a trip, use the
          tag button in the Calendar. Add, rename, merge or archive tags in Settings, under Tags.
        </Info>
      </h2>
      {rows.length === 0 ? (
        <p className="muted small">No tagged transactions in {scopeName}.</p>
      ) : (
        <table className="progress-table tag-totals">
          <thead>
            <tr>
              <th>Tag</th>
              <th className="num">Transactions</th>
              <th className="num">Spent</th>
              <th>Budget</th>
              <th aria-label="By category" />
            </tr>
          </thead>
          {rows.map((r) => {
            const budget = r.tag.budgetCents
            const share = budget ? Math.min(1, r.spentAllTime / budget) : 0
            const over = budget !== undefined && r.spentAllTime > budget
            const isOpen = open.has(r.tag.id)
            return (
              <tbody key={r.tag.id}>
                <tr
                  className={`tag-row${picked === r.tag.id ? ' picked' : ''}${over ? ' over' : ''}`}
                  onClick={() => onPick(picked === r.tag.id ? null : r.tag.id)}
                  title={picked === r.tag.id ? 'Click again to show all transactions' : `Show only ${formatTag(r.tag.name)} below`}
                >
                  <td>{formatTag(r.tag.name)}</td>
                  <td className="num">{r.count}</td>
                  <td className="num">{plainAmount(r.spent)}</td>
                  <td className="budget-cell">
                    {budget === undefined ? (
                      <span className="muted small">–</span>
                    ) : (
                      <>
                        <span className="bar" aria-hidden="true">
                          <span style={{ width: `${Math.round(share * 100)}%` }} />
                        </span>
                        <span className="small">
                          {plainAmount(r.spentAllTime)} of {plainAmount(budget)}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="expand-cell">
                    {r.byCategory.length > 0 && (
                      <button
                        type="button"
                        className="icon-button expand"
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? 'Hide' : 'Show'} ${formatTag(r.tag.name)} by category`}
                        title={isOpen ? 'Hide the split by category' : 'Show the split by category'}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggle(r.tag.id)
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
                {isOpen &&
                  r.byCategory.map((c) => (
                    <tr key={c.categoryId ?? 'none'} className="tag-split">
                      <td>{c.name}</td>
                      <td />
                      <td className="num">{plainAmount(c.cents)}</td>
                      <td colSpan={2} />
                    </tr>
                  ))}
              </tbody>
            )
          })}
        </table>
      )}
    </div>
  )
}
