import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState, type ReactNode } from 'react'
import ConfirmButton from '../../components/ConfirmButton'
import Info from '../../components/Info'
import InlineEdit from '../../components/InlineEdit'
import { PlusIcon, TrashIcon } from '../../components/icons'
import { useErrorMessage } from '../../components/useErrorMessage'
import { getSettings, updateSettings } from '../../db/actions'
import { db } from '../../db/db'
import { addWishCategory, deleteWishCategory, ensureWishCategories, importNotionItems, renameWishCategory } from '../../db/wishlist'
import { LAB_TITLE } from '../../domain/lab'
import type { Settings } from '../../domain/types'
import { notionExportFiles, pickNotionTable, type NotionItem } from '../../domain/wishlist'
import { SettingsFields } from '../SettingsPage'

/**
 * Extras that live apart from the budget. Switching one on adds its tab to the top bar;
 * switching it off hides the tab but keeps everything in it.
 */
export default function PluginsPanel() {
  const settings = useLiveQuery(() => getSettings(), [])
  if (!settings) return null
  const set = (key: keyof Settings, on: boolean) =>
    void (async () => {
      if (on && key === 'pluginWishlist') await ensureWishCategories()
      await updateSettings({ [key]: on })
    })()

  return (
    <div className="plugins">
      <h2 className="settings-title">
        Plug-ins{' '}
        <Info>
          Extras that sit next to your budget. Switching one on adds its tab to the top bar; switching it off hides the
          tab, and everything in it is kept for when you switch it back on.
        </Info>
      </h2>
      <Plugin
        name="Wishlist"
        about="Things, experiences and subscriptions you'd like, in your own order, and everything you already own. Marking a wish as bought adds the expense to Tracking."
        on={settings.pluginWishlist}
        onChange={(v) => set('pluginWishlist', v)}
      >
        <WishlistSettings />
      </Plugin>
      <Plugin
        name="Gifts"
        about="Gift ideas for the people around you, and the occasions coming up. Coming in the next update."
        on={settings.pluginGifts}
        disabled
        onChange={(v) => set('pluginGifts', v)}
      />
      <Plugin
        name={LAB_TITLE}
        about="A pretend week-by-week budget to try out short-term plans without touching your real numbers."
        on={settings.pluginPlayground}
        onChange={(v) => set('pluginPlayground', v)}
      >
        <SettingsFields tab="lab" />
      </Plugin>
    </div>
  )
}

function Plugin({
  name,
  about,
  on,
  onChange,
  disabled,
  children,
}: {
  name: string
  about: string
  on: boolean
  onChange: (on: boolean) => void
  disabled?: boolean
  children?: ReactNode
}) {
  return (
    <section className={`plugin${on ? ' on' : ''}`} aria-label={name}>
      <div className="plugin-head">
        <h3>
          {name} <Info>{about}</Info>
          {disabled && <span className="plugin-soon">Coming next</span>}
        </h3>
        <label className="switch" title={disabled ? 'Not available yet' : on ? `Switch ${name} off` : `Switch ${name} on`}>
          <input type="checkbox" role="switch" aria-label={name} checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
          <span aria-hidden="true" />
        </label>
      </div>
      {on && children && <div className="plugin-body">{children}</div>}
    </section>
  )
}

/** The wishlist's own categories, and bringing in a Notion wishlist. */
function WishlistSettings() {
  const categories = useLiveQuery(() => db.wishCategories.orderBy('order').toArray(), [])
  const [name, setName] = useState('')
  const [found, setFound] = useState<{ items: NotionItem[]; file: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { error, run } = useErrorMessage()
  const fileInput = useRef<HTMLInputElement>(null)
  if (!categories) return null

  const open = (file: File) =>
    run(async () => {
      setNotice(null)
      const files = await notionExportFiles(new Uint8Array(await file.arrayBuffer()), file.name)
      const { items } = pickNotionTable(files)
      setFound({ items, file: file.name })
    })

  return (
    <>
      {error && <p className="error">{error}</p>}
      <div className="field">
        <span className="field-label">
          Categories{' '}
          <Info>
            The wishlist's own categories, apart from your budget ones: what kind of thing it is (Tech, Sport, Home…). A
            wish can be in several. Click a name to rename it; deleting one only takes it off the items in it.
          </Info>
        </span>
        <span className="field-control">
          <ul className="wish-cat-list">
            {categories.map((c) => (
              <li key={c.id}>
                <InlineEdit value={c.name} label="Category name" onSave={(v) => run(() => renameWishCategory(c.id, v))} />
                <ConfirmButton
                  className="icon-button"
                  label={<TrashIcon />}
                  title={`Delete ${c.name}`}
                  confirmLabel="Delete?"
                  onConfirm={() => void run(() => deleteWishCategory(c.id))}
                />
              </li>
            ))}
          </ul>
          <form
            className="field-pair"
            onSubmit={(e) => {
              e.preventDefault()
              void run(async () => {
                await addWishCategory(name)
                setName('')
              })
            }}
          >
            <input aria-label="New category" placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="icon-button" aria-label="Add category" title="Add category" disabled={!name.trim()}>
              <PlusIcon />
            </button>
          </form>
        </span>
      </div>
      <div className="field">
        <span className="field-label">
          Import from Notion{' '}
          <Info>
            In Notion, open your wishlist page, then ⋯ → Export → “Markdown &amp; CSV”, and pick the zip it downloads here.
            Categories and tags are created as needed. Importing the same file again adds nothing twice.
          </Info>
        </span>
        <span className="field-control">
          {found ? (
            <span className="toolbar">
              <span>
                {found.items.length} items in {found.file}
              </span>
              <button
                type="button"
                className="primary"
                onClick={() =>
                  void run(async () => {
                    const added = await importNotionItems(found.items)
                    setFound(null)
                    setNotice(added === 0 ? 'Nothing new: everything in this file is already in your wishlist.' : `Added ${added} ${added === 1 ? 'item' : 'items'}.`)
                  })
                }
              >
                Import
              </button>
              <button type="button" onClick={() => setFound(null)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => fileInput.current?.click()}>
              Choose the export…
            </button>
          )}
          {notice && <span className="notice"> {notice}</span>}
          <input
            ref={fileInput}
            type="file"
            accept=".zip,.csv,application/zip,text/csv"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void open(file)
            }}
          />
        </span>
      </div>
    </>
  )
}
