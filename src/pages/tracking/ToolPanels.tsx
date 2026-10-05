import { useState, type CSSProperties, type ReactNode } from 'react'
import CategorySelect from '../../components/CategorySelect'
import ConfirmButton from '../../components/ConfirmButton'
import TagInput from '../../components/TagInput'
import { retagTransactions, setMerchantRule, undoImport, updateTransaction } from '../../db/actions'
import type { ImportRecord } from '../../db/db'
import { learnedMerchants, spendingCalendar } from '../../domain/insights'
import type { MonthKey, MonthRule } from '../../domain/periods'
import { merchantKey, type MerchantRule, type Transaction } from '../../domain/transactions'
import type { Category, Tag } from '../../domain/types'
import { dayLabel, plainAmount } from './format'

type Run = (action: () => Promise<unknown>) => Promise<boolean>

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <section className="tool-panel" aria-label={title}>
      <div className="tool-panel-head">
        <h2>{title}</h2>
        <button type="button" className="icon-button" aria-label={`Close ${title}`} title="Close" onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </section>
  )
}

/** Past imports, newest first, each with a button that removes everything it added. */
export function ImportsPanel({ imports, run, onClose }: { imports: ImportRecord[]; run: Run; onClose: () => void }) {
  const [notice, setNotice] = useState<string | null>(null)
  const list = [...imports].sort((a, b) => b.at - a.at)
  return (
    <Panel title="Undo an import" onClose={onClose}>
      {list.length === 0 ? (
        <p className="muted small">No imports to undo yet.</p>
      ) : (
        <ul className="tool-list">
          {list.map((i) => (
            <li key={i.id}>
              <span>
                <strong>{i.fileName}</strong>
                <span className="muted small">
                  {' '}
                  · {new Date(i.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} ·{' '}
                  {i.count} {i.count === 1 ? 'transaction' : 'transactions'}
                  {i.replaced.length > 0 && `, ${i.replaced.length} typed in by hand put back on undo`}
                </span>
              </span>
              <ConfirmButton
                label="Undo"
                confirmLabel="Sure? Remove them"
                title={`Remove the ${i.count} transactions this import added`}
                onConfirm={() =>
                  void run(async () => {
                    const removed = await undoImport(i.id)
                    setNotice(`Removed ${removed} ${removed === 1 ? 'transaction' : 'transactions'} from ${i.fileName}.`)
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}
      {notice && <p className="notice">{notice}</p>}
    </Panel>
  )
}

/** What Pulse learned per merchant, and rules that always put a merchant in one category. */
export function MerchantRulesPanel({
  transactions,
  rules,
  categories,
  run,
  onClose,
}: {
  transactions: Transaction[]
  rules: MerchantRule[]
  categories: Category[]
  run: Run
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  const all = learnedMerchants(transactions, rules)
  const list = all.filter((m) => words.every((w) => m.name.toLowerCase().includes(w))).slice(0, 60)
  return (
    <Panel title="Merchant rules" onClose={onClose}>
      <p className="muted small">
        What Pulse uses for each shop when importing. Pick a category to make it a rule: that shop then always gets
        it, whatever the pocket. {all.length > 60 && 'Search to find the others.'}
      </p>
      <input
        type="search"
        className="tool-search"
        aria-label="Search merchants"
        placeholder="Search merchants"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {list.length === 0 ? (
        <p className="muted small">{all.length === 0 ? 'Nothing learned yet. Import a statement first.' : 'No merchant matches.'}</p>
      ) : (
        <table className="tool-table">
          <thead>
            <tr>
              <th>Merchant</th>
              <th className="num">Seen</th>
              <th>Category</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.merchant}>
                <td>{m.name}</td>
                <td className="num muted">{m.count}×</td>
                <td>
                  <CategorySelect
                    label={`Category for ${m.name}`}
                    categories={categories}
                    value={m.categoryId}
                    placeholder="Not learned yet"
                    onChange={(choice) => void run(() => setMerchantRule(m.merchant, choice?.categoryId ?? null))}
                  />
                  {m.rule ? (
                    <span className="suggested" title="You set this: imports always use it">
                      rule
                    </span>
                  ) : (
                    m.categoryId && (
                      <span className="muted small" title="Learned from the category you picked last time">
                        {' '}
                        learned
                      </span>
                    )
                  )}
                </td>
                <td className="actions">
                  {m.categoryId && m.differing > 0 && (
                    <button
                      type="button"
                      title={`Give all ${m.count} transactions of ${m.name} this category`}
                      onClick={() =>
                        void run(async () => {
                          const category = categories.find((c) => c.id === m.categoryId)
                          if (!category) return
                          for (const t of transactions) {
                            if (merchantKey(t.details) === m.merchant && t.categoryId !== category.id) {
                              await updateTransaction(t.id, { block: category.block, categoryId: category.id })
                            }
                          }
                        })
                      }
                    >
                      Apply to {m.differing} more
                    </button>
                  )}
                  {m.rule && (
                    <button type="button" className="link" title="Go back to learning from your choices" onClick={() => void run(() => setMerchantRule(m.merchant, null))}>
                      Remove rule
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  )
}

/** Adds or removes tags on every selected row of the list. */
export function BulkTagsPanel({
  selected,
  transactions,
  tags,
  run,
  onClose,
}: {
  selected: string[]
  transactions: Transaction[]
  tags: Tag[]
  run: Run
  onClose: () => void
}) {
  const rows = transactions.filter((t) => selected.includes(t.id))
  const nameOf = new Map(tags.map((t) => [t.id, t.name]))
  const onAny = [...new Set(rows.flatMap((t) => t.tagIds))].flatMap((id) => (nameOf.has(id) ? [nameOf.get(id)!] : []))
  return (
    <Panel title="Tag selected rows" onClose={onClose}>
      {rows.length === 0 ? (
        <p className="muted small">
          Select rows in the list first: click a row, Ctrl+click (Cmd+click on a Mac) to add one, or Shift+click for a
          range.
        </p>
      ) : (
        <div className="bulk-tags">
          <span className="small">
            {rows.length} {rows.length === 1 ? 'row' : 'rows'} selected. Tags on any of them (× removes it from all):
          </span>
          <TagInput
            label="Tags of the selected rows"
            placeholder="Add a tag to all"
            value={onAny}
            tags={tags}
            onChange={(names) => {
              const add = names.filter((n) => !onAny.includes(n))
              const remove = onAny.filter((n) => !names.includes(n))
              void run(() => retagTransactions(selected, add, remove))
            }}
          />
        </div>
      )}
    </Panel>
  )
}

const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  new Date(2024, 0, 1 + i).toLocaleString(undefined, { weekday: 'short' }),
)

/** The month as a calendar, shaded by spending. Clicking a day shows only that day in the list. */
export function SpendingCalendarPanel({
  transactions,
  month,
  settings,
  day,
  onPickDay,
  onClose,
}: {
  transactions: Transaction[]
  month: MonthKey | null
  settings: MonthRule
  day: string
  onPickDay: (day: string) => void
  onClose: () => void
}) {
  if (month === null) {
    return (
      <Panel title="Spending calendar" onClose={onClose}>
        <p className="muted small">Pick a month to see its calendar.</p>
      </Panel>
    )
  }
  const weeks = spendingCalendar(transactions, month, settings)
  const max = Math.max(1, ...weeks.flat().map((d) => d?.spent ?? 0))
  return (
    <Panel title="Spending calendar" onClose={onClose}>
      <p className="muted small">Expenses per day: the darker, the more. Click a day to see only its transactions.</p>
      <div className="calendar" role="grid">
        {WEEKDAYS.map((w) => (
          <span key={w} className="calendar-weekday">
            {w}
          </span>
        ))}
        {weeks.flat().map((d, i) =>
          d === null ? (
            <span key={`blank-${i}`} className="calendar-blank" />
          ) : (
            <button
              key={d.date}
              type="button"
              className={`calendar-day${d.date === day ? ' picked' : ''}`}
              style={{ '--level': d.spent / max } as CSSProperties}
              title={`${dayLabel(d.date)}: ${d.spent ? `${plainAmount(d.spent)} spent in ${d.count} ${d.count === 1 ? 'payment' : 'payments'}` : 'nothing spent'}`}
              aria-pressed={d.date === day}
              onClick={() => onPickDay(d.date === day ? '' : d.date)}
            >
              <span className="calendar-date">{Number(d.date.slice(8))}</span>
              {d.spent > 0 && <span className="calendar-amount">{plainAmount(d.spent)}</span>}
            </button>
          ),
        )}
      </div>
    </Panel>
  )
}
