import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import ConfirmButton from '../components/ConfirmButton'
import Info from '../components/Info'
import InlineEdit from '../components/InlineEdit'
import { useErrorMessage } from '../components/useErrorMessage'
import { addTag, deleteTag, renameTag } from '../db/actions'
import { db } from '../db/db'
import { formatTag } from '../domain/tags'

export default function TagsPage() {
  const tags = useLiveQuery(() => db.tags.orderBy('name').toArray(), [])
  const [name, setName] = useState('')
  const { error, run } = useErrorMessage()

  if (!tags) return null

  return (
    <section className="page">
      <div className="page-head">
        <h1>
          Tags{' '}
          <Info>
            Tags cut across categories. Tag everything about football with #football and you can see it all together,
            whether it was a membership fee, boots or a match ticket.
          </Info>
        </h1>
      </div>
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
        <p className="muted">No tags yet.</p>
      ) : (
        <ul className="tag-list">
          {tags.map((tag) => (
            <li key={tag.id}>
              <InlineEdit
                value={tag.name}
                display={formatTag}
                label="Tag name"
                onSave={(v) => run(() => renameTag(tag.id, v))}
              />
              <ConfirmButton label="Delete" confirmLabel="Sure?" onConfirm={() => void run(() => deleteTag(tag.id))} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
