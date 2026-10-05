import { useState, type CSSProperties } from 'react'
import CategorySelect from '../../components/CategorySelect'
import ConfirmButton from '../../components/ConfirmButton'
import Info from '../../components/Info'
import TagInput from '../../components/TagInput'
import { removeImportedRows, retagTransactions, undoImport, updateTransaction } from '../../db/actions'
import type { ImportRecord } from '../../db/db'
import { categoryPath } from '../../domain/categories'
import { spendingCalendar } from '../../domain/insights'
import type { MonthKey, MonthRule } from '../../domain/periods'
import type { Transaction } from '../../domain/transactions'
import { BLOCKS, BLOCK_LABELS, type Block, type Category, type Tag } from '../../domain/types'
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

const CALENDAR_WORD: Record<Block, [string, string]> = {
  income: ['received', 'nothing received'],
  expenses: ['spent', 'nothing spent'],
  savings: ['put away', 'nothing put away'],
}

/** The month as a calendar, shaded by one block's total per day. Clicking a day lists its transactions next to it. */
export function SpendingCalendar({
  transactions,
  categories,
  month,
  settings,
  day,
  onPickDay,
}: {
  transactions: Transaction[]
  categories: Category[]
  month: MonthKey | null
  settings: MonthRule
  day: string
  onPickDay: (day: string) => void
}) {
  const [block, setBlock] = useState<Block>('expenses')
  if (month === null) return <p className="muted small">Pick a month in Period to see its calendar.</p>
  const weeks = spendingCalendar(transactions, month, settings, block)
  const max = Math.max(1, ...weeks.flat().map((d) => d?.total ?? 0))
  const ofDay = transactions.filter((t) => t.date === day && t.block === block).sort((a, b) => a.createdAt - b.createdAt)
  const [word, none] = CALENDAR_WORD[block]
  return (
    <div className={`calendar-view block-${block}`}>
      <div className="calendar-side">
        <div className="calendar-head">
          <div className="segmented" role="radiogroup" aria-label="Show on the calendar">
            {BLOCKS.map((b) => (
              <button key={b} type="button" role="radio" aria-checked={b === block} className={`block-${b}`} onClick={() => setBlock(b)}>
                {BLOCK_LABELS[b]}
              </button>
            ))}
          </div>
          <Info>
            {BLOCK_LABELS[block]} per day: the darker the day, the more. Click a day to see its transactions on the right.
          </Info>
        </div>
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
                style={{ '--level': d.total / max } as CSSProperties}
                title={`${dayLabel(d.date)}: ${d.total ? `${plainAmount(d.total)} ${word} in ${d.count} ${d.count === 1 ? 'transaction' : 'transactions'}` : none}`}
                aria-pressed={d.date === day}
                onClick={() => onPickDay(d.date === day ? '' : d.date)}
              >
                <span className="calendar-date">{Number(d.date.slice(8))}</span>
                {d.total > 0 && <span className="calendar-amount">{plainAmount(d.total)}</span>}
              </button>
            ),
          )}
        </div>
      </div>
      <section className="calendar-day-list" aria-label="Transactions of the picked day">
        {day === '' ? (
          <p className="muted small">Click a day to see its transactions here.</p>
        ) : (
          <>
            <h3>{dayLabel(day)}</h3>
            {ofDay.length === 0 ? (
              <p className="muted small">No {BLOCK_LABELS[block].toLowerCase()} on this day.</p>
            ) : (
              <table className="tool-table">
                <tbody>
                  {ofDay.map((t) => (
                    <tr key={t.id} className={`block-${t.block}`}>
                      <td>
                        {t.details || '…'}
                        <span className="muted small day-category">
                          {t.categoryId ? categoryPath(categories, t.categoryId) : 'No category'}
                        </span>
                      </td>
                      <td className={`num amount${t.block === 'income' ? ' in' : ''}`}>{signedAmount(t.cents, t.block)}</td>
                    </tr>
                  ))}
                </tbody>
                {ofDay.length > 1 && (
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td className="num">{plainAmount(ofDay.reduce((sum, t) => sum + t.cents, 0))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </>
        )}
      </section>
    </div>
  )
}
