import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import CategorySelect from '../../components/CategorySelect'
import Info from '../../components/Info'
import { useErrorMessage } from '../../components/useErrorMessage'
import { useRowSelection } from '../../components/useRowSelection'
import { importStatus, importTransactions, togglePocketCategory } from '../../db/actions'
import { findDuplicate } from '../../domain/recurring'
import { localSuggester, type Suggester, type Suggestion } from '../../domain/autoCategory'
import type { BankFile, BankRow } from '../../domain/revolut'
import { merchantKey, suggestCategory, type MerchantRule, type Pocket, type Transaction } from '../../domain/transactions'
import type { Block, Category } from '../../domain/types'
import { dayLabel, plainAmount, signedAmount } from './format'
import PocketLinks from './PocketLinks'

interface ReviewRow {
  row: BankRow
  include: boolean
  note: string | null
  /** undefined: follow the suggestion; null: deliberately no category. */
  chosen: string | null | undefined
  /** The same payment typed in by hand before; importing the row replaces it. */
  replaces?: Transaction
}

/** The engine for rows nothing else could place. Runs on this device; another can replace it later. */
const suggester: Suggester = localSuggester

interface Props {
  file: BankFile
  fileName: string
  categories: Category[]
  history: Transaction[]
  pockets: Pocket[]
  rules: MerchantRule[]
  onClose: (message: string | null) => void
}

/** The review step of a Revolut import: check each row and its category before anything is saved. */
export default function RevolutImport({ file, fileName, categories, history, pockets, rules, onClose }: Props) {
  const [rows, setRows] = useState<ReviewRow[] | null>(null)
  const [imported, setImported] = useState(0)
  const { error, run } = useErrorMessage()
  const selection = useRowSelection(rows?.map((r) => r.row.importKey) ?? [])
  const lastTicked = useRef<string | null>(null)
  const [guesses, setGuesses] = useState<Map<string, Suggestion>>(new Map())
  const loaded = rows !== null

  // Let the model guess every row once the file is read, and again when pocket links change.
  useEffect(() => {
    if (!rows) return
    let cancelled = false
    const input = rows.map((r) => ({ description: r.row.description, pocket: r.row.pocket, cents: r.row.cents }))
    void suggester(input, categories, history, pockets).then((result) => {
      if (cancelled) return
      const next = new Map<string, Suggestion>()
      result.forEach((g, i) => g && next.set(rows[i]!.row.importKey, g))
      setGuesses(next)
    })
    return () => {
      cancelled = true
    }
  }, [loaded, pockets]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false
    void importStatus(file.rows.map((r) => r.importKey)).then((status) => {
      if (cancelled) return
      const fresh = file.rows.filter((r) => !status.imported.has(r.importKey))
      setImported(file.rows.length - fresh.length)
      const typed = history.filter((t) => !t.importKey)
      const matched = new Set<string>()
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
          const block = row.block ?? (row.cents > 0 ? 'income' : 'expenses')
          const twin = include ? findDuplicate({ date: row.date, block, cents: Math.abs(row.cents) }, typed, { exclude: matched }) : null
          if (twin) {
            matched.add(twin.id)
            return {
              row,
              include,
              note: `Matches ${signedAmount(twin.cents, twin.block)} you added by hand on ${dayLabel(twin.date)}: importing replaces it`,
              chosen: twin.categoryId ?? undefined,
              replaces: twin,
            }
          }
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
  /** Where a row's category comes from: you, your pockets and earlier imports, or the model's guess. */
  const sourceOf = (r: ReviewRow): { categoryId: string | null; by: 'you' | 'rule' | 'ai' | null } => {
    if (r.chosen !== undefined) return { categoryId: r.chosen, by: 'you' }
    const rule = suggestCategory(r.row.description, r.row.pocket, history, pockets, rules, categories.filter((c) => !c.archived))
    if (rule && live.has(rule.categoryId)) return { categoryId: rule.categoryId, by: 'rule' }
    const guess = guesses.get(r.row.importKey)
    if (guess && live.has(guess.categoryId)) return { categoryId: guess.categoryId, by: 'ai' }
    return { categoryId: null, by: null }
  }
  const categoryOf = (r: ReviewRow) => sourceOf(r).categoryId
  const blockOf = (r: ReviewRow, categoryId: string | null): Block =>
    (categoryId ? live.get(categoryId)?.block : undefined) ?? r.row.block ?? (r.row.cents > 0 ? 'income' : 'expenses')

  const chosen = rows.filter((r) => r.include)
  const uncategorised = chosen.filter((r) => categoryOf(r) === null).length
  /** Applies a change to these rows. */
  const update = (keys: string[], patch: Partial<ReviewRow>) =>
    setRows((current) => current!.map((r) => (keys.includes(r.row.importKey) ? { ...r, ...patch } : r)))

  // Shift+click a checkbox: tick or untick everything since the last one clicked.
  // With several rows selected, a checkbox of one of them sets them all.
  const tick = (key: string, include: boolean, shift: boolean) => {
    const keys = shift && lastTicked.current ? selection.range(lastTicked.current, key) : selection.targetsOf(key)
    update(keys, { include })
    lastTicked.current = key
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('select, input:not([type=checkbox]), button')) return
    if (e.key === 'Escape') selection.clear()
    if (e.key === ' ' && selection.selected.size > 0 && target.tagName !== 'INPUT') {
      e.preventDefault()
      const keys = [...selection.selected]
      const allIn = rows.filter((r) => keys.includes(r.row.importKey)).every((r) => r.include)
      update(keys, { include: !allIn })
    }
  }
  const pocketNames = [...new Set(rows.map((r) => r.row.pocket).filter((p): p is string => p !== null))]
  const leftOutNotes = Object.entries(file.skipped).map(([reason, n]) => `${n} ${reason}`)
  const leftOutBefore = rows.filter((r) => r.note === 'Left out last time').length
  const newCount = rows.length - leftOutBefore
  if (leftOutBefore > 0) leftOutNotes.unshift(`${leftOutBefore} you left out last time (shown unticked)`)
  if (imported > 0) leftOutNotes.unshift(`${imported} already imported`)
  const replacing = rows.filter((r) => r.replaces).length

  return (
    <section className="import-review" aria-label="Review the import">
      <div className="import-head">
        <div>
          <h2>Review {fileName}</h2>
          <p className="muted small">
            {newCount === 0 ? 'Nothing new in this file.' : `${newCount} new ${newCount === 1 ? 'transaction' : 'transactions'}.`}
            {leftOutNotes.length > 0 && ` Left out: ${leftOutNotes.join(', ')}.`}
            {replacing > 0 &&
              ` ${replacing} ${replacing === 1 ? 'matches one' : 'match ones'} you added by hand, which the bank ${replacing === 1 ? 'row replaces' : 'rows replace'}.`}{' '}
            <Info>
              Money you moved between your own pockets and money taken out of savings isn’t counted, so nothing is
              counted twice. Untick anything else that isn’t real income or spending, like a top-up from your own
              account: Pulse remembers it and leaves it out next time. Shift+click checkboxes to tick or untick a
              range. Click rows (Ctrl+click or Shift+click for more) to select them: picking a category or ticking
              one then changes all of them, and Space ticks or unticks them. "AI guess" rows were placed by a small
              model that runs on this device: it knows common shops and learns from the categories you pick.
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
                      ...(r.replaces ? { replaces: r.replaces.id } : {}),
                    }
                  }),
                  'revolut',
                  undefined,
                  rows.filter((r) => !r.include).map((r) => ({ importKey: r.row.importKey, details: r.row.description })),
                  fileName,
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
        <div className="grid-scroll" tabIndex={-1} onKeyDown={onKeyDown}>
          <table className="ledger selectable">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Import all"
                    checked={chosen.length === rows.length}
                    onChange={(e) => update(rows.map((r) => r.row.importKey), { include: e.target.checked })}
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
                const { categoryId, by } = sourceOf(r)
                const guess = guesses.get(key)
                const linked = r.row.pocket ? (pockets.find((p) => p.name === r.row.pocket)?.categoryIds ?? []) : []
                const preferred =
                  r.row.block === 'savings'
                    ? { label: 'Savings', ids: savingsIds }
                    : r.row.pocket && linked.length > 0
                      ? { label: `For ${r.row.pocket}`, ids: linked }
                      : undefined
                const incoming = r.row.cents > 0 && r.row.block !== 'savings'
                return (
                  <tr
                    key={key}
                    className={[r.include ? '' : 'excluded', selection.selected.has(key) ? 'selected-row' : ''].join(' ').trim() || undefined}
                    onClick={(e) => selection.onRowClick(e, key)}
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Import ${r.row.description}`}
                        checked={r.include}
                        onChange={() => {}}
                        onClick={(e) => tick(key, e.currentTarget.checked, e.shiftKey)}
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
                        onChange={(choice) => update(selection.targetsOf(key), { chosen: choice?.categoryId ?? null })}
                      />
                      {by === 'rule' && (
                        <span className="suggested" title="Picked from your merchant rules, pockets and earlier imports">
                          suggested
                        </span>
                      )}
                      {by === 'ai' && guess && (
                        <span
                          className="suggested ai"
                          title={`Guessed on this device from the shop name and your earlier choices (${Math.round(guess.confidence * 100)}% sure). Check it before importing.`}
                        >
                          AI guess
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
