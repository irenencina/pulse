import { useEffect, useState } from 'react'
import CategorySelect from '../../components/CategorySelect'
import Info from '../../components/Info'
import { useErrorMessage } from '../../components/useErrorMessage'
import { importStatus, importTransactions, togglePocketCategory } from '../../db/actions'
import type { BankFile, BankRow } from '../../domain/revolut'
import { merchantKey, suggestCategory, type Pocket, type Transaction } from '../../domain/transactions'
import type { Block, Category } from '../../domain/types'
import { dayLabel, plainAmount } from './format'
import PocketLinks from './PocketLinks'

interface ReviewRow {
  row: BankRow
  include: boolean
  note: string | null
  /** undefined: follow the suggestion; null: deliberately no category. */
  chosen: string | null | undefined
}

interface Props {
  file: BankFile
  fileName: string
  categories: Category[]
  history: Transaction[]
  pockets: Pocket[]
  onClose: (message: string | null) => void
}

/** The review step of a Revolut import: check each row and its category before anything is saved. */
export default function RevolutImport({ file, fileName, categories, history, pockets, onClose }: Props) {
  const [rows, setRows] = useState<ReviewRow[] | null>(null)
  const [imported, setImported] = useState(0)
  const { error, run } = useErrorMessage()

  useEffect(() => {
    let cancelled = false
    void importStatus(file.rows.map((r) => r.importKey)).then((status) => {
      if (cancelled) return
      const fresh = file.rows.filter((r) => !status.imported.has(r.importKey))
      setImported(file.rows.length - fresh.length)
      setRows(
        fresh.map((row) => {
          const leftOutBefore = status.skipped.has(row.importKey)
          const merchantLeftOut = status.skippedMerchants.has(merchantKey(row.description))
          const include = row.include && !leftOutBefore && !merchantLeftOut
          const note = leftOutBefore
            ? 'Left out last time'
            : merchantLeftOut
              ? 'You left this out before'
              : (row.note ?? null)
          return { row, include, note, chosen: undefined }
        }),
      )
    })
    return () => {
      cancelled = true
    }
    // Worked out once per file, so later changes elsewhere don't reset the review.
  }, [file]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows) return null

  const live = new Map(categories.filter((c) => !c.archived).map((c) => [c.id, c]))
  const savingsIds = categories.filter((c) => c.block === 'savings').map((c) => c.id)
  const categoryOf = (r: ReviewRow): string | null => {
    if (r.chosen !== undefined) return r.chosen
    const guess = suggestCategory(r.row.description, r.row.pocket, history, pockets)
    return guess && live.has(guess.categoryId) ? guess.categoryId : null
  }
  const blockOf = (r: ReviewRow, categoryId: string | null): Block =>
    (categoryId ? live.get(categoryId)?.block : undefined) ?? r.row.block ?? (r.row.cents > 0 ? 'income' : 'expenses')

  const chosen = rows.filter((r) => r.include)
  const uncategorised = chosen.filter((r) => categoryOf(r) === null).length
  const update = (key: string, patch: Partial<ReviewRow>) =>
    setRows((current) => current!.map((r) => (r.row.importKey === key ? { ...r, ...patch } : r)))
  const pocketNames = [...new Set(rows.map((r) => r.row.pocket).filter((p): p is string => p !== null))]
  const leftOutNotes = Object.entries(file.skipped).map(([reason, n]) => `${n} ${reason}`)
  const leftOutBefore = rows.filter((r) => r.note === 'Left out last time').length
  const newCount = rows.length - leftOutBefore
  if (leftOutBefore > 0) leftOutNotes.unshift(`${leftOutBefore} you left out last time (shown unticked)`)
  if (imported > 0) leftOutNotes.unshift(`${imported} already imported`)

  return (
    <section className="import-review" aria-label="Review the import">
      <div className="import-head">
        <div>
          <h2>Review {fileName}</h2>
          <p className="muted small">
            {newCount === 0 ? 'Nothing new in this file.' : `${newCount} new ${newCount === 1 ? 'transaction' : 'transactions'}.`}
            {leftOutNotes.length > 0 && ` Left out: ${leftOutNotes.join(', ')}.`}{' '}
            <Info>
              Money you moved between your own pockets and money taken out of savings isn’t counted, so nothing is
              counted twice. Untick anything else that isn’t real income or spending, like a top-up from your own
              account: Pulse remembers it and leaves it out next time.
            </Info>
          </p>
        </div>
        <div className="toolbar">
          <button type="button" onClick={() => onClose(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={rows.length === 0}
            onClick={() =>
              run(async () => {
                const added = await importTransactions(
                  chosen.map((r) => {
                    const categoryId = categoryOf(r)
                    return {
                      date: r.row.date,
                      block: blockOf(r, categoryId),
                      categoryId,
                      cents: Math.abs(r.row.cents),
                      details: r.row.description,
                      importKey: r.row.importKey,
                      pocket: r.row.pocket ?? undefined,
                    }
                  }),
                  'revolut',
                  undefined,
                  rows.filter((r) => !r.include).map((r) => ({ importKey: r.row.importKey, details: r.row.description })),
                )
                onClose(`Imported ${added} ${added === 1 ? 'transaction' : 'transactions'} from ${fileName}.`)
              })
            }
          >
            Import {chosen.length} {chosen.length === 1 ? 'transaction' : 'transactions'}
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      {pocketNames.length > 0 && (
        <div className="pocket-panel">
          <h3>
            Your pockets{' '}
            <Info>
              Link each pocket to the categories its money is for. A payment from a pocket with one category gets that
              category. With several, they are listed first. When you put a payment somewhere else once (a gym fee
              paid from Bills into Sports), Pulse remembers it for that merchant.
            </Info>
          </h3>
          <PocketLinks
            names={pocketNames}
            pockets={pockets}
            categories={categories}
            onToggle={(name, id, linked) => void togglePocketCategory(name, id, linked)}
          />
        </div>
      )}

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
                <th>Pocket</th>
                <th>Category</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const key = r.row.importKey
                const categoryId = categoryOf(r)
                const linked = r.row.pocket ? (pockets.find((p) => p.name === r.row.pocket)?.categoryIds ?? []) : []
                const preferred =
                  r.row.block === 'savings'
                    ? { label: 'Savings', ids: savingsIds }
                    : r.row.pocket && linked.length > 0
                      ? { label: `For ${r.row.pocket}`, ids: linked }
                      : undefined
                const incoming = r.row.cents > 0 && r.row.block !== 'savings'
                return (
                  <tr key={key} className={r.include ? undefined : 'excluded'}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Import ${r.row.description}`}
                        checked={r.include}
                        onChange={(e) => update(key, { include: e.target.checked })}
                      />
                    </td>
                    <td className="date">{dayLabel(r.row.date)}</td>
                    <td>
                      {r.row.description}
                      {r.note && <span className="muted small"> · {r.note}</span>}
                    </td>
                    <td className="muted">{r.row.pocket ?? 'Main'}</td>
                    <td>
                      <CategorySelect
                        label={`Category for ${r.row.description}`}
                        categories={categories}
                        value={categoryId}
                        preferred={preferred}
                        placeholder={
                          r.row.block === 'savings'
                            ? 'Savings, no category yet'
                            : incoming
                              ? 'Income, no category yet'
                              : 'Expense, no category yet'
                        }
                        onChange={(choice) => update(key, { chosen: choice?.categoryId ?? null })}
                      />
                      {r.chosen === undefined && categoryId !== null && (
                        <span className="suggested" title="Picked from your pockets and earlier imports">
                          suggested
                        </span>
                      )}
                    </td>
                    <td className={incoming ? 'num amount in' : 'num amount'}>
                      {incoming ? '+' : r.row.block === 'savings' ? '' : '−'}
                      {plainAmount(Math.abs(r.row.cents))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
