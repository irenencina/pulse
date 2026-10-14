import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ReactNode } from 'react'
import ConfirmButton from '../../components/ConfirmButton'
import Info from '../../components/Info'
import InlineEdit from '../../components/InlineEdit'
import Menu from '../../components/Menu'
import { DownIcon, EditIcon, PlusIcon, TrashIcon, UndoIcon, UpIcon } from '../../components/icons'
import { useErrorMessage } from '../../components/useErrorMessage'
import { getSettings, updateSettings } from '../../db/actions'
import { db } from '../../db/db'
import { addResaleSite, deleteResaleSite, renameResaleSite } from '../../db/resale'
import { addWishCategory, deleteSale, deleteWishCategory, ensureWishCategories, renameWishCategory, saveSale, switchSale } from '../../db/wishlist'
import { LAB_TITLE, localToday } from '../../domain/lab'
import { DEFAULT_SALES, movePlugin, orderedPlugins, salesOf, WISH_CARD_FIELDS, type PluginKey, type Sale, type SaleDay, type Settings, type WishCardField } from '../../domain/types'
import { nextSale } from '../../domain/wishTiming'
import { Popup } from '../wishlist/WishDialogs'
import { canUseFolder, pickPhotoFolder } from '../resale/savePhotos'
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
          case 'pluginResale':
            return (
              <Plugin
                key={key}
                name="Resale"
                about="Things you mean to sell second hand: where each is posted, what you ask, and reminders in Upcoming so they actually get sold. A sale adds the money to Tracking as income."
                on={settings.pluginResale}
                onChange={(v) => set(key, v)}
                {...move}
              >
                <ResaleSites settings={settings} />
                <PhotoFolder />
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
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const NTH = ['First', 'Second', 'Third', 'Fourth', 'Last']
const WEEKS = ['1st week', '2nd week', '3rd week', '4th week']
const two = (n: number) => String(n).padStart(2, '0')

/** A day a sale starts or ends: a date, a week of the month, or a weekday such as the first Monday. */
function SaleDayPicker({ value, onChange, label, last }: { value: SaleDay; onChange: (value: SaleDay) => void; label: string; last: boolean }) {
  const { month } = value
  const switchTo = (on: SaleDay['on']) =>
    onChange(
      on === 'date'
        ? { on, month, day: last ? 31 : 1 }
        : on === 'week'
          ? { on, month, week: last ? 4 : 1 }
          : { on, month, nth: last ? 5 : 1, weekday: 1 },
    )
  const monthSelect = (
    <select aria-label={`${label} month`} value={month} onChange={(e) => onChange({ ...value, month: Number(e.target.value) })}>
      {SALE_MONTHS.map((m, i) => (
        <option key={m} value={i + 1}>
          {m}
        </option>
      ))}
    </select>
  )
  return (
    <span className="day-of-year">
      <select aria-label={`${label}: a date, a week or a weekday`} value={value.on} onChange={(e) => switchTo(e.target.value as SaleDay['on'])}>
        <option value="date">Date</option>
        <option value="week">Week</option>
        <option value="weekday">Weekday</option>
      </select>
      {value.on === 'date' && (
        <>
          <select aria-label={`${label} day`} value={value.day} onChange={(e) => onChange({ ...value, day: Number(e.target.value) })}>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i} value={i + 1}>
                {two(i + 1)}
              </option>
            ))}
          </select>
          {monthSelect}
        </>
      )}
      {value.on === 'week' && (
        <>
          <select
            aria-label={`${label} week`}
            title="1st week: days 1 to 7, 2nd: 8 to 14, 3rd: 15 to 21, 4th: 22 to the end of the month"
            value={value.week}
            onChange={(e) => onChange({ ...value, week: Number(e.target.value) as 1 | 2 | 3 | 4 })}
          >
            {WEEKS.map((w, i) => (
              <option key={w} value={i + 1}>
                {w}
              </option>
            ))}
          </select>
          {monthSelect}
        </>
      )}
      {value.on === 'weekday' && (
        <>
          <select aria-label={`${label} which one`} value={value.nth} onChange={(e) => onChange({ ...value, nth: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 })}>
            {NTH.map((n, i) => (
              <option key={n} value={i + 1}>
                {n}
              </option>
            ))}
          </select>
          <select aria-label={`${label} weekday`} value={value.weekday} onChange={(e) => onChange({ ...value, weekday: Number(e.target.value) })}>
            {WEEKDAY_NAMES.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
          <span className="muted">of</span>
          {monthSelect}
        </>
      )}
    </span>
  )
}

const saleDate = (iso: string, year: boolean) => `${SALE_MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(8)}${year ? ` ${iso.slice(0, 4)}` : ''}`

/** A sale's next days, "Nov 27 – Nov 30", with the year when it isn't this one. */
function nextDays(sale: Sale, today: string): string {
  const { from, to } = nextSale(sale, today)
  const otherYear = to.slice(0, 4) !== today.slice(0, 4)
  return from === to ? saleDate(from, otherYear) : `${saleDate(from, otherYear && from.slice(0, 4) !== to.slice(0, 4))} – ${saleDate(to, otherYear)}`
}

/** How a sale day reads: "Jan 02", "1st week of Jul", "First Monday of Jul". */
function sayDay(d: SaleDay): string {
  const month = SALE_MONTHS[d.month - 1]
  if (d.on === 'date') return `${month} ${two(d.day)}`
  if (d.on === 'week') return `${WEEKS[d.week - 1]} of ${month}`
  return `${NTH[d.nth - 1]} ${WEEKDAY_NAMES[d.weekday]} of ${month}`
}

const BLACK_FRIDAY_RULE = 'The Friday after the fourth Thursday of November, to the Monday after'

/** The sales periods a wish can wait for: the common ones to start with, each switched on or off, and your own. */
function SaleSettings({ settings }: { settings: Settings }) {
  const sales = salesOf(settings)
  const [editing, setEditing] = useState<Sale | 'new' | null>(null)
  const { error, run } = useErrorMessage()
  const today = localToday()
  return (
    <div className="plugin-section">
      <h4 className="plugin-section-title">
        Sales periods{' '}
        <Info>
          The sales a wish can wait for in its "Not before". A wish is ready on the first day, and Upcoming tells you. Switch off
          the ones you don't use, or add your own. Sales move a little each year, so each end can be a date, a week of the month
          or a weekday such as the first Monday of July.
        </Info>
      </h4>
      {error && <p className="error">{error}</p>}
      <table className="tool-table tag-table sale-table">
        <thead>
          <tr>
            <th aria-label="On" />
            <th>Sales period</th>
            <th>Next</th>
            <th aria-label="More" />
          </tr>
        </thead>
        <tbody>
          {sales.map((sale) => {
            const usual = DEFAULT_SALES.find((d) => d.id === sale.id)
            const changed = usual && !usual.rule && JSON.stringify([usual.from, usual.to]) !== JSON.stringify([sale.from, sale.to])
            return (
              <tr key={sale.id} className={sale.on ? undefined : 'off'}>
                <td className="sale-switch">
                  <label className="switch">
                    <input type="checkbox" role="switch" aria-label={`Use ${sale.name}`} checked={sale.on} onChange={(e) => void run(() => switchSale(sale.id, e.target.checked))} />
                    <span aria-hidden="true" />
                  </label>
                </td>
                <td>{sale.name}</td>
                <td className="muted" title={sale.rule ? BLACK_FRIDAY_RULE : `${sayDay(sale.from)} to ${sayDay(sale.to)}`}>
                  {nextDays(sale, today)}
                </td>
                <td className="actions">
                  <Menu label={`More for ${sale.name}`}>
                    {(close) => (
                      <>
                        <button type="button" role="menuitem" onClick={() => (close(), setEditing(sale))}>
                          <EditIcon /> Edit
                        </button>
                        {changed && (
                          <button type="button" role="menuitem" onClick={() => (close(), void run(() => saveSale({ ...sale, from: usual.from, to: usual.to })))}>
                            <UndoIcon /> Usual days
                          </button>
                        )}
                        {!usual && (
                          <ConfirmButton
                            label={
                              <>
                                <TrashIcon /> Delete
                              </>
                            }
                            title="Wishes waiting for it can be bought any time"
                            confirmLabel="Sure? Click again to delete"
                            onConfirm={() => (close(), void run(() => deleteSale(sale.id)))}
                          />
                        )}
                      </>
                    )}
                  </Menu>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <button type="button" className="ghost-add" onClick={() => setEditing('new')}>
        <PlusIcon /> New sales period
      </button>
      {editing && <SaleEditor sale={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

/** Name a sales period and the days it runs. */
function SaleEditor({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const [name, setName] = useState(sale?.name ?? '')
  const [from, setFrom] = useState<SaleDay>(sale?.from ?? { on: 'date', month: 1, day: 1 })
  const [to, setTo] = useState<SaleDay>(sale?.to ?? { on: 'date', month: 1, day: 7 })
  const { error, run } = useErrorMessage()
  const draft: Sale = { id: sale?.id ?? '', name, on: sale?.on ?? true, from, to, ...(sale?.rule ? { rule: sale.rule } : {}) }
  return (
    <Popup title={sale ? `Edit ${sale.name}` : 'New sales period'} onClose={onClose} className="small-dialog">
      <form
        className="wish-form"
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            const { id: _id, ...rest } = draft
            await saveSale(sale ? draft : rest)
            onClose()
          })
        }}
      >
        {error && <p className="error">{error}</p>}
        <label className="wish-field wide">
          <span>Name</span>
          <input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="Spring sales" />
        </label>
        {draft.rule ? (
          <p className="muted small wide">{BLACK_FRIDAY_RULE}.</p>
        ) : (
          <>
            <div className="wish-field wide">
              <span>First day</span>
              <SaleDayPicker label="First day" last={false} value={from} onChange={setFrom} />
            </div>
            <div className="wish-field wide">
              <span>
                Last day <Info>A last day before the first runs into the next year, like Dec 26 to Jan 06.</Info>
              </span>
              <SaleDayPicker label="Last day" last value={to} onChange={setTo} />
            </div>
          </>
        )}
        <p className="muted small wide">Next: {nextDays(draft, localToday())}</p>
        <div className="wish-actions wide">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!name.trim()}>
            {sale ? 'Save' : 'Add it'}
          </button>
        </div>
      </form>
    </Popup>
  )
}

/** The sites things get posted on, laid out like the wishlist's categories. */
function ResaleSites({ settings }: { settings: Settings }) {
  const uses = useLiveQuery(async () => {
    const count = new Map<string, number>()
    await db.resaleItems.each((i) => i.sites.forEach((s) => count.set(s, (count.get(s) ?? 0) + 1)))
    return count
  }, [])
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const { error, run } = useErrorMessage()
  if (!uses) return null
  return (
    <div className="plugin-section">
      <h4 className="plugin-section-title">
        Sites{' '}
        <Info>
          Where you post things to sell, offered when you add or edit one. Click a name to rename it everywhere; deleting one
          only takes it off this list.
        </Info>
      </h4>
      {error && <p className="error">{error}</p>}
      <table className="tool-table tag-table">
        <thead>
          <tr>
            <th>Site</th>
            <th className="num">Used</th>
            <th aria-label="More" />
          </tr>
        </thead>
        <tbody>
          {settings.resaleSites.map((site) => (
            <tr key={site}>
              <td>
                <InlineEdit value={site} label="Site name" onSave={(v) => run(() => renameResaleSite(site, v))} />
              </td>
              <td className="num muted">{uses.get(site) ?? 0}×</td>
              <td className="actions">
                <Menu label={`More for ${site}`}>
                  {(close) => (
                    <ConfirmButton
                      label={
                        <>
                          <TrashIcon /> Delete
                        </>
                      }
                      title={`Take ${site} off the list`}
                      confirmLabel="Sure? Click again to delete"
                      onConfirm={() => (close(), void run(() => deleteResaleSite(site)))}
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
            if (await run(() => addResaleSite(name))) {
              setName('')
              setAdding(false)
            }
          }}
          onKeyDown={(e) => e.key === 'Escape' && (setName(''), setAdding(false))}
        >
          <input autoFocus placeholder="Milanuncios" aria-label="New site" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="primary icon-add" title="Add site" aria-label="Add site">
            <PlusIcon />
          </button>
        </form>
      ) : (
        <button type="button" className="ghost-add" onClick={() => setAdding(true)}>
          <PlusIcon /> New site
        </button>
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

/** Where Save photos puts each thing's photos, when the browser can save into a folder. */
function PhotoFolder() {
  const folder = useLiveQuery(async () => (await db.folders.get('resalePhotos'))?.handle.name ?? '', [])
  const { error, run } = useErrorMessage()
  if (!canUseFolder() || folder === undefined) return null
  return (
    <div className="plugin-row">
      <span>
        Photos folder{' '}
        <Info>
          Save photos in a thing's ⋯ menu puts its photos in a folder of its own inside this one, named in order, ready to
          upload. Your browser asks once per visit before Pulse may save there.
        </Info>
        {error && <span className="error small"> {error}</span>}
      </span>
      <span className="field-pair">
        <span className="muted">{folder || 'Not picked yet'}</span>
        <button
          type="button"
          onClick={() =>
            void run(async () => {
              try {
                await pickPhotoFolder()
              } catch (e) {
                // Closing the picker changes nothing.
                if (!(e instanceof DOMException && e.name === 'AbortError')) throw e
              }
            })
          }
        >
          {folder ? 'Change' : 'Pick folder'}
        </button>
      </span>
    </div>
  )
}
