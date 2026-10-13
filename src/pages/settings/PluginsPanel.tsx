import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ReactNode } from 'react'
import ConfirmButton from '../../components/ConfirmButton'
import Info from '../../components/Info'
import InlineEdit from '../../components/InlineEdit'
import Menu from '../../components/Menu'
import { DownIcon, PlusIcon, TrashIcon, UpIcon } from '../../components/icons'
import { useErrorMessage } from '../../components/useErrorMessage'
import { getSettings, updateSettings } from '../../db/actions'
import { db } from '../../db/db'
import { addWishCategory, deleteWishCategory, ensureWishCategories, renameWishCategory } from '../../db/wishlist'
import { LAB_TITLE } from '../../domain/lab'
import { DEFAULT_SALE_DATES, movePlugin, orderedPlugins, WISH_CARD_FIELDS, type PluginKey, type SaleDates, type SaleDays, type Settings, type WishCardField } from '../../domain/types'
import { SettingsFields } from '../SettingsPage'

/**
 * Extras that live apart from the budget. Switching one on adds its tab to the top bar;
 * switching it off hides the tab but keeps everything in it.
 */
export default function PluginsPanel() {
  const settings = useLiveQuery(() => getSettings(), [])
  if (!settings) return null
  const order = orderedPlugins(settings.pluginOrder)
  const set = (key: PluginKey, on: boolean) =>
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
          tab, and everything in it is kept for when you switch it back on. The arrows set the order of their tabs.
        </Info>
      </h2>
      {order.map((key, i) => {
        const move = {
          first: i === 0,
          last: i === order.length - 1,
          onMove: (by: -1 | 1) => void updateSettings({ pluginOrder: movePlugin(order, key, by) }),
        }
        switch (key) {
          case 'pluginWishlist':
            return (
              <Plugin
                key={key}
                name="Wishlist"
                about="Things, experiences and subscriptions you'd like, in your own order, and everything you already own. Marking a wish as bought adds the expense to Tracking."
                on={settings.pluginWishlist}
                onChange={(v) => set(key, v)}
                {...move}
              >
                <WishlistOptions settings={settings} />
                <SaleSettings settings={settings} />
                <WishlistSettings />
              </Plugin>
            )
          case 'pluginPlayground':
            return (
              <Plugin
                key={key}
                name={LAB_TITLE}
                about="A pretend week-by-week budget to try out short-term plans without touching your real numbers."
                on={settings.pluginPlayground}
                onChange={(v) => set(key, v)}
                {...move}
              >
                <SettingsFields tab="lab" />
              </Plugin>
            )
        }
      })}
    </div>
  )
}

function Plugin({
  name,
  about,
  on,
  onChange,
  disabled,
  first,
  last,
  onMove,
  children,
}: {
  name: string
  about: string
  on: boolean
  onChange: (on: boolean) => void
  disabled?: boolean
  first: boolean
  last: boolean
  onMove: (by: -1 | 1) => void
  children?: ReactNode
}) {
  return (
    <section className={`plugin${on ? ' on' : ''}`} aria-label={name}>
      <div className="plugin-head">
        <h3>
          {name} <Info>{about}</Info>
          {disabled && <span className="plugin-soon">Coming next</span>}
        </h3>
        <span className="plugin-move">
          <button type="button" className="icon-button" title={`Move ${name} up`} aria-label={`Move ${name} up`} disabled={first} onClick={() => onMove(-1)}>
            <UpIcon />
          </button>
          <button type="button" className="icon-button" title={`Move ${name} down`} aria-label={`Move ${name} down`} disabled={last} onClick={() => onMove(1)}>
            <DownIcon />
          </button>
        </span>
        <label className="switch" title={disabled ? 'Not available yet' : on ? `Switch ${name} off` : `Switch ${name} on`}>
          <input type="checkbox" role="switch" aria-label={name} checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
          <span aria-hidden="true" />
        </label>
      </div>
      {on && children && <div className="plugin-body">{children}</div>}
    </section>
  )
}

/** What the cards show, and where ended things go. */
function WishlistOptions({ settings }: { settings: Settings }) {
  const shown = new Set(settings.wishCardFields)
  const toggle = (field: WishCardField) => {
    const next = WISH_CARD_FIELDS.map(([f]) => f).filter((f) => (f === field ? !shown.has(f) : shown.has(f)))
    void updateSettings({ wishCardFields: next })
  }
  return (
    <div className="plugin-section">
      <h4 className="plugin-section-title">
        Cards{' '}
        <Info>
          The rows each card shows, always in this order and in the same place on every card, so they line up. The name and
          picture always show; everything else is in the card's details when you click it.
        </Info>
      </h4>
      <div className="card-fields" role="group" aria-label="Shown on cards">
        {WISH_CARD_FIELDS.map(([field, label]) => (
          <label key={field} className={`card-field${shown.has(field) ? ' on' : ''}`}>
            <input type="checkbox" checked={shown.has(field)} onChange={() => toggle(field)} />
            {label}
          </label>
        ))}
      </div>
      <div className="plugin-row">
        <span>
          Archive broken, lost, sold or cancelled things{' '}
          <Info>
            When something breaks, gets lost or is sold, it moves from Owned to the Archived tab. Buying the same model again
            brings it back to Owned, with its earlier copies kept in its timeline.
          </Info>
        </span>
        <label className="switch">
          <input
            type="checkbox"
            role="switch"
            aria-label="Archive broken, lost, sold or cancelled things"
            checked={settings.wishArchiveEnded}
            onChange={(e) => void updateSettings({ wishArchiveEnded: e.target.checked })}
          />
          <span aria-hidden="true" />
        </label>
      </div>
    </div>
  )
}

const SALE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const two = (n: number) => String(n).padStart(2, '0')

/** A day of the year ("MM-DD") as a day and a month to pick. */
function DayOfYear({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const month = Number(value.slice(0, 2))
  const day = Number(value.slice(3))
  const set = (m: number, d: number) => onChange(`${two(m)}-${two(Math.min(d, MONTH_DAYS[m - 1]!))}`)
  return (
    <span className="day-of-year">
      <select aria-label={`${label} day`} value={day} onChange={(e) => set(month, Number(e.target.value))}>
        {Array.from({ length: MONTH_DAYS[month - 1]! }, (_, i) => (
          <option key={i} value={i + 1}>
            {two(i + 1)}
          </option>
        ))}
      </select>
      <select aria-label={`${label} month`} value={month} onChange={(e) => set(Number(e.target.value), day)}>
        {SALE_MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
    </span>
  )
}

/** When the January and summer sales run where you shop, for wishes waiting for them. */
function SaleSettings({ settings }: { settings: Settings }) {
  const dates: SaleDates = { ...DEFAULT_SALE_DATES, ...settings.saleDates }
  const set = (sale: keyof SaleDates, patch: Partial<SaleDays>) => void updateSettings({ saleDates: { ...dates, [sale]: { ...dates[sale], ...patch } } })
  const rows: [keyof SaleDates, string][] = [
    ['januarySales', 'January sales'],
    ['summerSales', 'Summer sales'],
  ]
  const changed = JSON.stringify(dates) !== JSON.stringify(DEFAULT_SALE_DATES)
  return (
    <div className="plugin-section">
      <h4 className="plugin-section-title">
        Sales periods{' '}
        <Info>
          The days the sales run where you shop, every year. A wish waiting for a sales period is ready on its first day, and
          Upcoming tells you. A last day before the first runs into the next year. Black Friday always runs from the Friday
          after the fourth Thursday of November to the Monday after.
        </Info>
      </h4>
      {rows.map(([sale, label]) => (
        <div key={sale} className="plugin-row">
          <span>{label}</span>
          <span className="sale-days">
            <DayOfYear label={`${label} first`} value={dates[sale].from} onChange={(from) => set(sale, { from })} />
            <span className="muted">to</span>
            <DayOfYear label={`${label} last`} value={dates[sale].to} onChange={(to) => set(sale, { to })} />
          </span>
        </div>
      ))}
      {changed && (
        <div className="plugin-row">
          <span />
          <button type="button" onClick={() => void updateSettings({ saleDates: DEFAULT_SALE_DATES })}>
            Back to the usual days
          </button>
        </div>
      )}
    </div>
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
