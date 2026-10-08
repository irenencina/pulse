import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import ConfirmButton from '../../components/ConfirmButton'
import Info from '../../components/Info'
import InlineEdit from '../../components/InlineEdit'
import Menu from '../../components/Menu'
import { ArchiveIcon, EditIcon, MergeIcon, PlusIcon, RestoreIcon, TrashIcon } from '../../components/icons'
import { useErrorMessage } from '../../components/useErrorMessage'
import { addTag, deleteTag, mergeTags, renameTag, setTagArchived, setTagBudget, setTagDates } from '../../db/actions'
import { db } from '../../db/db'
import { parseAmount } from '../../domain/money'
import { formatTag } from '../../domain/tags'
import type { Tag, TagBudgetPeriod } from '../../domain/types'
import { dayLabel, plainAmount } from '../tracking/format'

type Run = (action: () => Promise<unknown>) => Promise<boolean>

const PERIOD_LABELS: Record<TagBudgetPeriod, string> = {
  total: 'in total',
  month: 'per month',
  year: 'per year',
}

const daysLabel = (tag: Tag) =>
  tag.from && tag.to ? (tag.from === tag.to ? dayLabel(tag.from) : `${dayLabel(tag.from)} – ${dayLabel(tag.to)}`) : null

/** Tags with their budget and days; everything you change is behind the ⋯ of a row. Totals are in Tracking, under Tags. */
export default function TagSettings() {
  const tags = useLiveQuery(() => db.tags.orderBy('name').toArray(), [])
  const uses = useLiveQuery(async () => {
    const count = new Map<string, number>()
    await db.transactions.each((t) => t.tagIds.forEach((id) => count.set(id, (count.get(id) ?? 0) + 1)))
    return count
  }, [])
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ id: string; what: 'edit' | 'merge' } | null>(null)
  const { error, run } = useErrorMessage()
  if (!tags || !uses) return null
  const sorted = [...tags].sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || a.name.localeCompare(b.name))

  return (
    <div className="tag-settings">
      <h2 className="settings-title">
        Tags{' '}
        <Info>
          Tags cut across categories: tag everything about football with #football to see it together, whether it was a
          fee, boots or a ticket. Their totals are in Tracking, under the Tags view. Give a tag a budget, in total (a trip)
          or as a cap each month or year (going out), and days so every expense on them gets the tag. Archive it when it's
          over so it stops being suggested.
        </Info>
      </h2>
      {error && <p className="error">{error}</p>}
      {tags.length === 0 ? (
        <p className="muted small">No tags yet.</p>
      ) : (
        <table className="tool-table tag-table">
          <thead>
            <tr>
              <th>Tag</th>
              <th className="num">Used</th>
              <th>Budget</th>
              <th>Days</th>
              <th aria-label="More" />
            </tr>
          </thead>
          {sorted.map((tag) => {
            const open = editing?.id === tag.id ? editing.what : null
            const days = daysLabel(tag)
            return (
              <tbody key={tag.id} className={tag.archived ? 'archived' : undefined}>
                <tr>
                  <td>
                    <InlineEdit value={tag.name} display={formatTag} className="tag-chip" label="Tag name" onSave={(v) => run(() => renameTag(tag.id, v))} />
                    {tag.archived && <span className="muted small"> archived</span>}
                  </td>
                  <td className="num muted">{uses.get(tag.id) ?? 0}×</td>
                  <td>
                    {tag.budgetCents === undefined ? (
                      <span className="muted">–</span>
                    ) : (
                      <>
                        {plainAmount(tag.budgetCents)} <span className="muted">{PERIOD_LABELS[tag.budgetPeriod ?? 'total']}</span>
                      </>
                    )}
                  </td>
                  <td>{days ?? <span className="muted">–</span>}</td>
                  <td className="actions">
                    <Menu label={`More for ${formatTag(tag.name)}`}>
                      {(close) => (
                        <>
                          <button type="button" role="menuitem" onClick={() => (close(), setEditing({ id: tag.id, what: 'edit' }))}>
                            <EditIcon /> Budget and days…
                          </button>
                          <button type="button" role="menuitem" onClick={() => (close(), setEditing({ id: tag.id, what: 'merge' }))}>
                            <MergeIcon /> Merge with tag…
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            title={tag.archived ? 'Suggest it again' : 'Keep it on its transactions, but stop suggesting it'}
                            onClick={() => (close(), void run(() => setTagArchived(tag.id, !tag.archived)))}
                          >
                            {tag.archived ? <RestoreIcon /> : <ArchiveIcon />} {tag.archived ? 'Restore' : 'Archive'}
                          </button>
                          <ConfirmButton
                            label={
                              <>
                                <TrashIcon /> Delete
                              </>
                            }
                            title={`Delete ${formatTag(tag.name)}: removes it from its transactions`}
                            confirmLabel="Sure? Click again to delete"
                            onConfirm={() => (close(), void run(() => deleteTag(tag.id)))}
                          />
                        </>
                      )}
                    </Menu>
                  </td>
                </tr>
                {open === 'edit' && (
                  <tr className="tag-editor-row">
                    <td colSpan={5}>
                      <TagEditor tag={tag} run={run} onDone={() => setEditing(null)} />
                    </td>
                  </tr>
                )}
                {open === 'merge' && (
                  <tr className="tag-editor-row">
                    <td colSpan={5}>
                      <MergeTag tag={tag} tags={tags} run={run} onDone={() => setEditing(null)} />
                    </td>
                  </tr>
                )}
              </tbody>
            )
          })}
        </table>
      )}
      {adding ? (
        <form
          className="add-row"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await run(() => addTag(name))) {
              setName('')
              setAdding(false)
            }
          }}
          onKeyDown={(e) => e.key === 'Escape' && (setName(''), setAdding(false))}
        >
          <input autoFocus placeholder="#football" aria-label="New tag" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="primary icon-add" title="Add tag" aria-label="Add tag">
            <PlusIcon />
          </button>
        </form>
      ) : (
        <button type="button" className="ghost-add" onClick={() => setAdding(true)}>
          <PlusIcon /> New tag
        </button>
      )}
    </div>
  )
}

/** Budget (amount and how long it lasts) and days of one tag. */
function TagEditor({ tag, run, onDone }: { tag: Tag; run: Run; onDone: () => void }) {
  const [amount, setAmount] = useState(tag.budgetCents === undefined ? '' : plainAmount(tag.budgetCents))
  const [period, setPeriod] = useState<TagBudgetPeriod>(tag.budgetPeriod ?? 'total')
  const [from, setFrom] = useState(tag.from ?? '')
  const [to, setTo] = useState(tag.to ?? '')
  return (
    <form
      className="tag-editor"
      onSubmit={async (e) => {
        e.preventDefault()
        const ok = await run(async () => {
          if (amount.trim() === '') await setTagBudget(tag.id, null)
          else {
            const cents = parseAmount(amount)
            if (cents === null || cents === 0) throw new Error('Type an amount like 150, or leave it empty for no budget.')
            await setTagBudget(tag.id, Math.abs(cents), undefined, period)
          }
          if ((from || null) !== (tag.from ?? null) || (to || from || null) !== (tag.to ?? null)) {
            await setTagDates(tag.id, from || null, to || from || null)
          }
        })
        if (ok) onDone()
      }}
      onKeyDown={(e) => e.key === 'Escape' && onDone()}
    >
      <fieldset>
        <legend>Budget</legend>
        <input
          autoFocus
          className="amount-input"
          inputMode="decimal"
          placeholder="No budget"
          aria-label={`Budget for ${formatTag(tag.name)}`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <select aria-label="How long the budget lasts" value={period} onChange={(e) => setPeriod(e.target.value as TagBudgetPeriod)}>
          <option value="total">in total</option>
          <option value="month">per month</option>
          <option value="year">per year</option>
        </select>
        <span className="muted small">
          {period === 'total'
            ? 'For everything ever tagged, like a trip.'
            : `A cap that starts fresh each ${period}, like going out.`}
        </span>
      </fieldset>
      <fieldset>
        <legend>Days (optional)</legend>
        <input type="date" aria-label={`First day of ${formatTag(tag.name)}`} value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="muted small">to</span>
        <input type="date" aria-label={`Last day of ${formatTag(tag.name)}`} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        {(from || to) && (
          <button type="button" title="Stop tagging these days (tags already given stay)" onClick={() => (setFrom(''), setTo(''))}>
            Clear
          </button>
        )}
        <span className="muted small">Every expense on these days gets the tag, also later ones.</span>
      </fieldset>
      <div className="tag-editor-buttons">
        <button type="submit" className="primary">
          Save
        </button>
        <button type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  )
}

/** Moves everything of one tag to another, after picking which. */
function MergeTag({ tag, tags, run, onDone }: { tag: Tag; tags: Tag[]; run: Run; onDone: () => void }) {
  const [into, setInto] = useState('')
  const target = tags.find((t) => t.id === into)
  return (
    <form
      className="tag-editor merge"
      onSubmit={async (e) => {
        e.preventDefault()
        if (target && (await run(() => mergeTags(tag.id, target.id)))) onDone()
      }}
      onKeyDown={(e) => e.key === 'Escape' && onDone()}
    >
      <span className="small">Move everything tagged {formatTag(tag.name)} to</span>
      <select autoFocus aria-label={`Merge ${formatTag(tag.name)} into`} value={into} onChange={(e) => setInto(e.target.value)}>
        <option value="">pick a tag</option>
        {tags
          .filter((t) => t.id !== tag.id)
          .map((t) => (
            <option key={t.id} value={t.id}>
              {formatTag(t.name)}
            </option>
          ))}
      </select>
      <span className="small">and remove {formatTag(tag.name)}.</span>
      <button type="submit" className="primary" disabled={!target}>
        Merge
      </button>
      <button type="button" onClick={onDone}>
        Cancel
      </button>
    </form>
  )
}
