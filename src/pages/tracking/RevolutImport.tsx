import { useEffect, useState } from 'react'
import CategorySelect from '../../components/CategorySelect'
import { useErrorMessage } from '../../components/useErrorMessage'
import { importTransactions, knownImportKeys } from '../../db/actions'
import type { BankFile } from '../../domain/revolut'
import { suggestCategory, type Transaction } from '../../domain/transactions'
import type { Block, Category } from '../../domain/types'
import { dayLabel, plainAmount } from './format'

interface ReviewRow {
  key: string
  date: string
  cents: number
  description: string
  note: string | null
  include: boolean
  block: Block
  categoryId: string | null
  suggested: boolean
}

interface Props {
  file: BankFile
  fileName: string
  categories: Category[]
  history: Transaction[]
  onClose: (message: string | null) => void
}

/** The review step of a Revolut import: check each row and its category before anything is saved. */
export default function RevolutImport({ file, fileName, categories, history, onClose }: Props) {
  const [rows, setRows] = useState<ReviewRow[] | null>(null)
  const [duplicates, setDuplicates] = useState(0)
  const { error, run } = useErrorMessage()

  useEffect(() => {
    let cancelled = false
    void knownImportKeys(file.rows.map((r) => r.importKey)).then((known) => {
      if (cancelled) return
      const live = new Set(categories.filter((c) => !c.archived).map((c) => c.id))
      const fresh = file.rows.filter((r) => !known.has(r.importKey))
      setDuplicates(file.rows.length - fresh.length)
      setRows(
        fresh.map((r) => {
          const guess = suggestCategory(r.description, history)
          const usable = guess && live.has(guess.categoryId) ? guess : null
          const otherAccount = r.product !== '' && r.product.toLowerCase() !== 'current'
          return {
            key: r.importKey,
            date: r.date,
            cents: r.cents,
            description: r.description,
            note: otherAccount ? `From your Revolut ${r.product} account` : null,
            include: !otherAccount,
            block: usable?.block ?? (r.cents > 0 ? 'income' : 'expenses'),
            categoryId: usable?.categoryId ?? null,
            suggested: usable !== null,
          }
        }),
      )
    })
    return () => {
      cancelled = true
    }
    // Suggestions are worked out once per file, so later edits elsewhere don't reset the review.
  }, [file]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows) return null
  const chosen = rows.filter((r) => r.include)
  const uncategorised = chosen.filter((r) => r.categoryId === null).length
  const update = (key: string, patch: Partial<ReviewRow>) =>
    setRows((current) => current!.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const skippedNotes = Object.entries(file.skipped).map(([reason, n]) => `${n} ${reason}`)
  if (duplicates > 0) skippedNotes.unshift(`${duplicates} already imported`)

  return (
    <section className="import-review" aria-label="Review the import">
      <div className="import-head">
        <div>
          <h2>Review {fileName}</h2>
          <p className="muted small">
            {rows.length === 0 ? 'Nothing new in this file.' : `${rows.length} new ${rows.length === 1 ? 'transaction' : 'transactions'}.`}
            {skippedNotes.length > 0 && ` Left out: ${skippedNotes.join(', ')}.`}
          </p>
        </div>
        <div className="toolbar">
          <button type="button" onClick={() => onClose(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={chosen.length === 0}
            onClick={() =>
              run(async () => {
                const added = await importTransactions(
                  chosen.map((r) => ({
                    date: r.date,
                    block: r.block,
                    categoryId: r.categoryId,
                    cents: Math.abs(r.cents),
                    details: r.description,
                    importKey: r.key,
                  })),
                  'revolut',
                )
                onClose(`Imported ${added} transactions from ${fileName}.`)
              })
            }
          >
            Import {chosen.length} {chosen.length === 1 ? 'transaction' : 'transactions'}
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {uncategorised > 0 && (
        <p className="muted small">
          {uncategorised} without a category. You can import them now and pick their category later in the list.
        </p>
      )}
      {rows.length > 0 && (
        <div className="grid-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Import all"
                    checked={chosen.length === rows.length}
                    onChange={(e) => setRows(rows.map((r) => ({ ...r, include: e.target.checked })))}
                  />
                </th>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className={r.include ? undefined : 'excluded'}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Import ${r.description}`}
                      checked={r.include}
                      onChange={(e) => update(r.key, { include: e.target.checked })}
                    />
                  </td>
                  <td className="date">{dayLabel(r.date)}</td>
                  <td>
                    {r.description}
                    {r.note && <span className="muted small"> · {r.note}</span>}
                  </td>
                  <td>
                    <CategorySelect
                      label={`Category for ${r.description}`}
                      categories={categories}
                      value={r.categoryId}
                      placeholder={r.cents > 0 ? 'Income, no category yet' : 'Expense, no category yet'}
                      onChange={(choice) =>
                        update(r.key, {
                          categoryId: choice?.categoryId ?? null,
                          block: choice?.block ?? (r.cents > 0 ? 'income' : 'expenses'),
                          suggested: false,
                        })
                      }
                    />
                    {r.suggested && (
                      <span className="suggested" title="Picked because you used this category for the same merchant before">
                        suggested
                      </span>
                    )}
                  </td>
                  <td className={r.cents > 0 ? 'num amount in' : 'num amount'}>
                    {r.cents > 0 ? '+' : '−'}
                    {plainAmount(Math.abs(r.cents))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
