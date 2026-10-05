import { useState, type CSSProperties } from 'react'
import CategorySelect from '../../components/CategorySelect'
import ConfirmButton from '../../components/ConfirmButton'
import TagInput from '../../components/TagInput'
import { removeImportedRows, retagTransactions, undoImport, updateTransaction } from '../../db/actions'
import type { ImportRecord } from '../../db/db'
import { categoryPath } from '../../domain/categories'
import { spendingCalendar } from '../../domain/insights'
import type { MonthKey, MonthRule } from '../../domain/periods'
import type { Transaction } from '../../domain/transactions'
import type { Category, Tag } from '../../domain/types'
import { dayLabel, plainAmount, signedAmount } from './format'

type Run = (action: () => Promise<unknown>) => Promise<boolean>

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/**
 * Every import, newest first. Open one to see its rows and which you changed since; remove
 * single rows, or the whole import after a confirmation that says what will be lost.
 */
export function ImportHistory({
  imports,
  transactions,
  categories,
  run,
  onClose,
}: {
  imports: ImportRecord[]
  transactions: Transaction[]
  categories: Category[]
  run: Run
  onClose: () => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const list = [...imports].sort((a, b) => b.at - a.at)
  return (
    <section className="tool-panel" aria-label="Import history">
      <div className="tool-panel-head">
        <h2>Import history</h2>
        <button type="button" className="icon-button" aria-label="Close import history" title="Close" onClick={onClose}>
          ×
        </button>
      </div>
      {list.length === 0 ? (
        <p className="muted small">Nothing imported yet. Imports show here so you can check what they added.</p>
      ) : (
        <ul className="tool-list">
          {list.map((i) => {
            const rows = transactions.filter((t) => t.importId === i.id)
            const edited = rows.filter((t) => t.editedAt !== undefined).length
            return (
              <li key={i.id} className="import-item">
                <button
                  type="button"
                  className="import-summary"
                  aria-expanded={open === i.id}
                  onClick={() => setOpen(open === i.id ? null : i.id)}
                >
                  <span className="caret" aria-hidden="true">
                    {open === i.id ? '▾' : '▸'}
                  </span>
                  <strong>{i.fileName}</strong>
                  <span className="muted small">
                    {when(i.at)} · {rows.length} {rows.length === 1 ? 'transaction' : 'transactions'}
                    {edited > 0 && ` · ${edited} changed since`}
                  </span>
                </button>
                {open === i.id && <ImportRows record={i} rows={rows} categories={categories} run={run} />}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function ImportRows({ record, rows, categories, run }: { record: ImportRecord; rows: Transaction[]; categories: Category[]; run: Run }) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [understood, setUnderstood] = useState(false)
  const edited = rows.filter((t) => t.editedAt !== undefined).length
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  return (
    <div className="import-rows">
      <div className="grid-scroll">
        <table className="tool-table">
          <thead>
            <tr>
              <th aria-label="Pick" />
              <th>Date</th>
              <th>Details</th>
              <th>Category</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.id} className={picked.has(t.id) ? 'selected-row' : undefined}>
                <td>
                  <input type="checkbox" aria-label={`Pick ${t.details}`} checked={picked.has(t.id)} onChange={() => toggle(t.id)} />
                </td>
                <td className="date">{dayLabel(t.date)}</td>
                <td>
                  {t.details}
                  {t.editedAt !== undefined && (
                    <span className="badge" title={`Changed on ${when(t.editedAt)}`}>
                      changed
                    </span>
                  )}
                </td>
                <td className="muted">{t.categoryId ? categoryPath(categories, t.categoryId) : 'No category'}</td>
                <td className="num">{signedAmount(t.cents, t.block)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="import-actions">
        <ConfirmButton
          label={`Remove ${picked.size} picked`}
          confirmLabel={`Sure? Remove ${picked.size}`}
          title="Remove the rows you ticked"
          onConfirm={() =>
            void run(async () => {
              await removeImportedRows(record.id, [...picked])
              setPicked(new Set())
            })
          }
        />
        {!confirming ? (
          <button type="button" className="danger" onClick={() => setConfirming(true)}>
            Remove the whole import…
          </button>
        ) : (
          <div className="confirm-box" role="alertdialog" aria-label="Remove the whole import">
            <p>
              This removes all {rows.length} transactions that <strong>{record.fileName}</strong> added.
              {edited > 0 && ` ${edited} of them you changed since; those changes are lost.`}
              {record.replaced.length > 0 &&
                ` The ${record.replaced.length} you had typed in by hand before come back.`}
            </p>
            <label className="check">
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} /> I understand,
              remove them
            </label>
            <div className="toolbar">
              <button
                type="button"
                onClick={() => {
                  setConfirming(false)
                  setUnderstood(false)
                }}
              >
                Keep them
              </button>
              <button type="button" className="danger armed" disabled={!understood} onClick={() => void run(() => undoImport(record.id))}>
                Remove {rows.length} transactions
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Shown above the list while rows are selected: give them all a category or tags. */
export function SelectionBar({
  ids,
  transactions,
  categories,
  tags,
  run,
  onClear,
}: {
  ids: string[]
  transactions: Transaction[]
  categories: Category[]
  tags: Tag[]
  run: Run
  onClear: () => void
}) {
  const rows = transactions.filter((t) => ids.includes(t.id))
  const nameOf = new Map(tags.map((t) => [t.id, t.name]))
  const onAny = [...new Set(rows.flatMap((t) => t.tagIds))].flatMap((id) => (nameOf.has(id) ? [nameOf.get(id)!] : []))
  const sameCategory = rows.every((t) => t.categoryId === rows[0]?.categoryId) ? (rows[0]?.categoryId ?? null) : null
  return (
    <div className="selection-bar" role="region" aria-label="Selected rows">
      <strong>
        {rows.length} selected
      </strong>
      <CategorySelect
        label="Category of the selected rows"
        categories={categories}
        value={sameCategory}
        placeholder="Set a category for all"
        onChange={(choice) =>
          choice &&
          void run(async () => {
            for (const id of ids) await updateTransaction(id, choice)
          })
        }
      />
      <TagInput
        label="Tags of the selected rows"
        placeholder="Add a tag to all"
        value={onAny}
        tags={tags}
        onChange={(names) => {
          const add = names.filter((n) => !onAny.includes(n))
          const remove = onAny.filter((n) => !names.includes(n))
          void run(() => retagTransactions(ids, add, remove))
        }}
      />
      <button type="button" className="link" onClick={onClear}>
        Clear selection
      </button>
    </div>
  )
}

const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  new Date(2024, 0, 1 + i).toLocaleString(undefined, { weekday: 'short' }),
)

/** The month as a calendar, shaded by spending. Clicking a day shows only that day in the list. */
export function SpendingCalendar({
  transactions,
  month,
  settings,
  day,
  onPickDay,
}: {
  transactions: Transaction[]
  month: MonthKey | null
  settings: MonthRule
  day: string
  onPickDay: (day: string) => void
}) {
  if (month === null) return <p className="muted small">Pick a month in Period to see its calendar.</p>
  const weeks = spendingCalendar(transactions, month, settings)
  const max = Math.max(1, ...weeks.flat().map((d) => d?.spent ?? 0))
  return (
    <div className="calendar-view">
      <p className="muted small">Expenses per day: the darker, the more. Click a day to see only its transactions below.</p>
      <div className="calendar">
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
    </div>
  )
}
