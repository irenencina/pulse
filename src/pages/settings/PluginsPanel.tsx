import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ReactNode } from 'react'
import ConfirmButton from '../../components/ConfirmButton'
import Info from '../../components/Info'
import InlineEdit from '../../components/InlineEdit'
import Menu from '../../components/Menu'
import { PlusIcon, TrashIcon } from '../../components/icons'
import { useErrorMessage } from '../../components/useErrorMessage'
import { getSettings, updateSettings } from '../../db/actions'
import { db } from '../../db/db'
import { addWishCategory, deleteWishCategory, ensureWishCategories, renameWishCategory } from '../../db/wishlist'
import { LAB_TITLE } from '../../domain/lab'
import type { Settings } from '../../domain/types'
import { SettingsFields } from '../SettingsPage'
import NotionImport from './NotionImport'

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
        <NotionImport />
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

/** The wishlist's own categories, laid out like the Tags table. */
function WishlistSettings() {
  const categories = useLiveQuery(() => db.wishCategories.orderBy('order').toArray(), [])
  const uses = useLiveQuery(async () => {
    const count = new Map<string, number>()
    await db.wishItems.each((w) => w.categoryIds.forEach((id) => count.set(id, (count.get(id) ?? 0) + 1)))
    return count
  }, [])
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const { error, run } = useErrorMessage()
  if (!categories || !uses) return null

  return (
    <div className="plugin-section">
      <h4 className="plugin-section-title">
        Categories{' '}
        <Info>
          The wishlist's own categories, apart from your budget ones: what kind of thing it is (Tech, Sport, Home…). A wish
          can be in several. Click a name to rename it; deleting one only takes it off the items in it.
        </Info>
      </h4>
      {error && <p className="error">{error}</p>}
      <table className="tool-table tag-table">
        <thead>
          <tr>
            <th>Category</th>
            <th className="num">Used</th>
            <th aria-label="More" />
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => (
            <tr key={c.id}>
              <td>
                <InlineEdit value={c.name} label="Category name" onSave={(v) => run(() => renameWishCategory(c.id, v))} />
              </td>
              <td className="num muted">{uses.get(c.id) ?? 0}×</td>
              <td className="actions">
                <Menu label={`More for ${c.name}`}>
                  {(close) => (
                    <ConfirmButton
                      label={
                        <>
                          <TrashIcon /> Delete
                        </>
                      }
                      title={`Delete ${c.name}: takes it off its items`}
                      confirmLabel="Sure? Click again to delete"
                      onConfirm={() => (close(), void run(() => deleteWishCategory(c.id)))}
                    />
                  )}
                </Menu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {adding ? (
        <form
          className="add-row"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await run(() => addWishCategory(name))) {
              setName('')
              setAdding(false)
            }
          }}
          onKeyDown={(e) => e.key === 'Escape' && (setName(''), setAdding(false))}
        >
          <input autoFocus placeholder="Gadgets" aria-label="New category" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="primary icon-add" title="Add category" aria-label="Add category">
            <PlusIcon />
          </button>
        </form>
      ) : (
        <button type="button" className="ghost-add" onClick={() => setAdding(true)}>
          <PlusIcon /> New category
        </button>
      )}
    </div>
  )
}
