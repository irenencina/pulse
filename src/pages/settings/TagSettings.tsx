import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import ConfirmButton from '../../components/ConfirmButton'
import { ArchiveIcon, RestoreIcon, TrashIcon } from '../../components/icons'
import InlineEdit from '../../components/InlineEdit'
import { useErrorMessage } from '../../components/useErrorMessage'
import { addTag, deleteTag, mergeTags, renameTag, setTagArchived, setTagBudget, setTagDates } from '../../db/actions'
import { db } from '../../db/db'
import { parseAmount } from '../../domain/money'
import { formatTag } from '../../domain/tags'
import type { Tag } from '../../domain/types'
import { dayLabel, plainAmount } from '../tracking/format'

/** Add, rename, budget, merge, archive and delete tags. What they add up to is in Tracking, under Tags. */
export default function TagSettings() {
  const tags = useLiveQuery(() => db.tags.orderBy('name').toArray(), [])
  const uses = useLiveQuery(async () => {
    const count = new Map<string, number>()
    await db.transactions.each((t) => t.tagIds.forEach((id) => count.set(id, (count.get(id) ?? 0) + 1)))
    return count
  }, [])
  const [name, setName] = useState('')
  const { error, run } = useErrorMessage()
  if (!tags || !uses) return null
  const sorted = [...tags].sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || a.name.localeCompare(b.name))

  return (
    <div className="tag-settings">
      <p className="muted small">
        Tags cut across categories: tag everything about football with #football to see it together, whether it was a
        fee, boots or a ticket. Their totals are in Tracking, under the Tags view. Give a tag a budget to follow a trip
        or an event, and days so every expense on them gets the tag; archive it when it's over so it stops being suggested.
      </p>
      <form
        className="add-row"
        onSubmit={async (e) => {
          e.preventDefault()
          if (await run(() => addTag(name))) setName('')
        }}
      >
        <input placeholder="#football" aria-label="New tag" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit">Add tag</button>
      </form>
      {error && <p className="error">{error}</p>}
      {tags.length === 0 ? (
        <p className="muted small">No tags yet.</p>
      ) : (
        <table className="tool-table tag-table">
          <thead>
            <tr>
              <th>Tag</th>
              <th className="num">Used</th>
              <th className="num">Budget</th>
              <th>Days</th>
              <th>Merge into</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((tag) => (
              <tr key={tag.id} className={tag.archived ? 'archived' : undefined}>
                <td>
                  <InlineEdit value={tag.name} display={formatTag} label="Tag name" onSave={(v) => run(() => renameTag(tag.id, v))} />
                  {tag.archived && <span className="muted small"> archived</span>}
                </td>
                <td className="num muted">{uses.get(tag.id) ?? 0}×</td>
                <td className="num">
                  <InlineEdit
                    value={tag.budgetCents === undefined ? '' : plainAmount(tag.budgetCents)}
                    display={(v) => v || '+ budget'}
                    label={`Budget for ${formatTag(tag.name)}`}
                    title="Set an amount to aim for over everything with this tag. Empty means no budget."
                    onSave={(v) =>
                      run(async () => {
                        if (v.trim() === '') return setTagBudget(tag.id, null)
                        const cents = parseAmount(v)
                        if (cents === null) throw new Error('Type an amount like 1500.')
                        await setTagBudget(tag.id, Math.abs(cents))
                      })
                    }
                  />
                </td>
                <td>
                  <TagDaysCell tag={tag} run={run} />
                </td>
                <td>
                  <select
                    aria-label={`Merge ${formatTag(tag.name)} into`}
                    value=""
                    onChange={(e) => {
                      const into = tags.find((t) => t.id === e.target.value)
                      if (
                        into &&
                        window.confirm(`Move everything tagged ${formatTag(tag.name)} to ${formatTag(into.name)}, and remove ${formatTag(tag.name)}?`)
                      ) {
                        void run(() => mergeTags(tag.id, into.id))
                      }
                    }}
                  >
                    <option value="">–</option>
                    {tags
                      .filter((t) => t.id !== tag.id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {formatTag(t.name)}
                        </option>
                      ))}
                  </select>
                </td>
                <td className="actions">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => run(() => setTagArchived(tag.id, !tag.archived))}
                    title={tag.archived ? 'Restore: suggest it again' : 'Archive: keep it on its transactions, but stop suggesting it'}
                    aria-label={tag.archived ? `Restore ${formatTag(tag.name)}` : `Archive ${formatTag(tag.name)}`}
                  >
                    {tag.archived ? <RestoreIcon /> : <ArchiveIcon />}
                  </button>
                  <ConfirmButton
                    className="icon-button"
                    label={<TrashIcon />}
                    title={`Delete ${formatTag(tag.name)}: removes it from its transactions`}
                    confirmLabel="Sure?"
                    onConfirm={() => void run(() => deleteTag(tag.id))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/** The days a tag covers: every expense on them gets the tag, also later ones. */
function TagDaysCell({ tag, run }: { tag: Tag; run: (action: () => Promise<unknown>) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false)
  const [from, setFrom] = useState(tag.from ?? '')
  const [to, setTo] = useState(tag.to ?? '')
  if (!editing) {
    return (
      <button
        type="button"
        className="inline-edit"
        title="Days this tag covers: every expense on them gets it, also ones added or imported later"
        onClick={() => {
          setFrom(tag.from ?? '')
          setTo(tag.to ?? '')
          setEditing(true)
        }}
      >
        {tag.from && tag.to ? (tag.from === tag.to ? dayLabel(tag.from) : `${dayLabel(tag.from)} – ${dayLabel(tag.to)}`) : <span className="muted">+ days</span>}
      </button>
    )
  }
  return (
    <form
      className="tag-days-edit"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await run(() => setTagDates(tag.id, from || null, to || from || null))) setEditing(false)
      }}
      onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
    >
      <input type="date" aria-label={`First day of ${formatTag(tag.name)}`} value={from} onChange={(e) => setFrom(e.target.value)} />
      <input type="date" aria-label={`Last day of ${formatTag(tag.name)}`} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
      <button type="submit" className="primary">
        Save
      </button>
      {tag.from && (
        <button
          type="button"
          title="Stop tagging these days (tags already given stay)"
          onClick={async () => {
            if (await run(() => setTagDates(tag.id, null, null))) setEditing(false)
          }}
        >
          Clear
        </button>
      )}
    </form>
  )
}
