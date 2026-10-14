import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type DragEvent, type MouseEvent, type ReactNode } from 'react'
import ConfirmButton from '../components/ConfirmButton'
import Info from '../components/Info'
import Menu from '../components/Menu'
import { EditIcon, PlusIcon, RestoreIcon, TrashIcon } from '../components/icons'
import { useErrorMessage } from '../components/useErrorMessage'
import { getSettings } from '../db/actions'
import { db } from '../db/db'
import { backToSelling, deleteResale, setResaleStatus, updateResale } from '../db/resale'
import { localToday } from '../domain/lab'
import { formatMoney } from '../domain/money'
import {
  daysText,
  isGone,
  isResaleFiltering,
  matchesResale,
  RESALE_STATUS_LABELS,
  resaleNudge,
  resaleTotals,
  SELLING,
  type ResaleFilter,
  type ResaleItem,
  type ResaleStatus,
} from '../domain/resale'
import { formatTag } from '../domain/tags'
import type { Tag } from '../domain/types'
import { MarkGiven, MarkSold, ResaleEditor } from './resale/ResaleDialogs'
import { dayLabel } from './tracking/format'
import { MultiFilter } from './wishlist/Filters'
import { imageFromTransfer } from './wishlist/images'
import { PlaceholderArt } from './wishlist/PlaceholderArt'
import { CardsIcon, LinkIcon, ListIcon } from './WishlistPage'

type View = 'selling' | 'gone'
type Layout = 'board' | 'cards' | 'list'

const LAYOUT_KEY = 'pulse.resale.layout'
const DRAG_TYPE = 'application/x-pulse-resale'

function readLayout(): Layout {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY)
    return saved === 'cards' || saved === 'list' ? saved : 'board'
  } catch {
    return 'board'
  }
}

const money = (cents: number | null | undefined) => (cents === null || cents === undefined ? '–' : formatMoney(cents))
/** "Oct 05", with the year when it isn't this year. */
const shortDay = (iso: string, today: string) => `${dayLabel(iso)}${iso.slice(0, 4) !== today.slice(0, 4) ? ` ${iso.slice(0, 4)}` : ''}`

/** The Resale plug-in: things to sell second hand, from "to post" to sold. */
export default function ResalePage() {
  const items = useLiveQuery(() => db.resaleItems.toArray(), [])
  const wishes = useLiveQuery(() => db.wishItems.toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const tags = useLiveQuery(() => db.tags.orderBy('name').toArray(), [])
  const settings = useLiveQuery(() => getSettings(), [])
  const [view, setView] = useState<View>('selling')
  const [layout, setLayoutState] = useState<Layout>(readLayout)
  const [filter, setFilter] = useState<ResaleFilter>({})
  const [editing, setEditing] = useState<{ item: ResaleItem | null } | null>(null)
  const [selling, setSelling] = useState<ResaleItem | null>(null)
  const [giving, setGiving] = useState<ResaleItem | null>(null)
  const { error, run } = useErrorMessage()
  if (!items || !wishes || !categories || !tags || !settings) return null

  const setLayout = (l: Layout) => {
    setLayoutState(l)
    try {
      localStorage.setItem(LAYOUT_KEY, l)
    } catch {
      // Only a preference.
    }
  }
  const switchView = (v: View) => {
    setView(v)
    setFilter({ ...filter, statuses: undefined })
  }
  const today = localToday()
  // Newest first; what's gone by the day it went.
  const sorted = [...items].sort((a, b) => (b.soldOn ?? b.addedOn).localeCompare(a.soldOn ?? a.addedOn))
  const forSale = sorted.filter((i) => !isGone(i.status))
  const gone = sorted.filter((i) => isGone(i.status))
  const list = view === 'selling' ? forSale : gone
  const shown = list.filter((i) => matchesResale(i, filter))
  const filtering = isResaleFiltering(filter)
  const totals = resaleTotals(shown, today)
  const sites = [...new Set([...settings.resaleSites, ...items.flatMap((i) => i.sites)])]
  const wishName = (i: ResaleItem) => (i.wishId ? wishes.find((w) => w.id === i.wishId)?.name : undefined)
  const ctx: ResaleContext = {
    tags,
    today,
    onEdit: (item) => setEditing({ item }),
    onStatus: (item, status) => void run(() => setResaleStatus(item.id, status)),
    onSold: setSelling,
    onGiven: setGiving,
    onBack: (item) => void run(() => backToSelling(item.id)),
    onDelete: (item) => void run(() => deleteResale(item.id)),
    onImage: (item, imageUrl) => void run(() => updateResale(item.id, { imageUrl })),
  }
  const board = layout === 'board' && view === 'selling'

  return (
    <section className="page wishlist-page resale-page">
      <div className="page-head">
        <h1>
          Resale{' '}
          <Info>
            Things you mean to sell second hand, so they actually get sold. Note where each one is posted, what you ask and the
            least you'd take, and drag it along the board as it goes from To post to Posted and Reserved. Upcoming reminds you
            when something has waited a week to be posted, or a month without a buyer. When it sells, the money goes into
            Tracking as income. Anything you own on the Wishlist can be put here with Sell it in its ⋯ menu.
          </Info>
        </h1>
        <div className="toolbox" role="toolbar" aria-label="Tools">
          <button type="button" className="tool" aria-label="Add something to sell" title="Add something to sell" onClick={() => setEditing({ item: null })}>
            <PlusIcon />
          </button>
          {view === 'selling' && (
            <button type="button" className="tool" aria-label="Board" aria-pressed={layout === 'board'} title="A column for each step: to post, posted, reserved" onClick={() => setLayout('board')}>
              <BoardIcon />
            </button>
          )}
          <button type="button" className="tool" aria-label="Cards" aria-pressed={layout === 'cards' || (layout === 'board' && view !== 'selling')} title="Show as cards with pictures" onClick={() => setLayout('cards')}>
            <CardsIcon />
          </button>
          <button type="button" className="tool" aria-label="List" aria-pressed={layout === 'list'} title="Show as a list" onClick={() => setLayout('list')}>
            <ListIcon />
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="view-tabs" role="tablist" aria-label="Views">
        <button type="button" role="tab" className="view-tab" aria-selected={view === 'selling'} onClick={() => switchView('selling')}>
          For sale <span className="tab-count">{forSale.length}</span>
        </button>
        <button type="button" role="tab" className="view-tab" aria-selected={view === 'gone'} title="Sold or given away" onClick={() => switchView('gone')}>
          Sold <span className="tab-count">{gone.length}</span>
        </button>
      </div>

      <div className="wish-filters" role="search" aria-label="Filters">
        <input type="search" aria-label="Search" placeholder="Search name or brand" value={filter.text ?? ''} onChange={(e) => setFilter({ ...filter, text: e.target.value || undefined })} />
        <MultiFilter
          label="Site"
          plural="sites"
          selected={filter.sites ?? []}
          options={sites.flatMap((s) => {
            const n = list.filter((i) => i.sites.includes(s)).length
            return n > 0 ? [{ value: s, label: s, detail: String(n) }] : []
          })}
          onChange={(sites) => setFilter({ ...filter, sites })}
        />
        {!board && (
          <MultiFilter
            label="Status"
            plural="statuses"
            selected={filter.statuses ?? []}
            options={(view === 'selling' ? SELLING : (['sold', 'given'] as ResaleStatus[])).flatMap((s) => {
              const n = list.filter((i) => i.status === s).length
              return n > 0 ? [{ value: s, label: RESALE_STATUS_LABELS[s], detail: String(n) }] : []
            })}
            onChange={(statuses) => setFilter({ ...filter, statuses: statuses as ResaleStatus[] })}
          />
        )}
        {filtering && (
          <button type="button" onClick={() => setFilter({})}>
            Clear filters
          </button>
        )}
        <span className="wish-total muted small">
          {shown.length} {shown.length === 1 ? 'thing' : 'things'}
          {view === 'selling'
            ? totals.askingCents > 0 && ` · ${formatMoney(totals.askingCents)} asked`
            : ` · ${formatMoney(totals.earnedThisYearCents)} earned this year${totals.earnedCents !== totals.earnedThisYearCents ? `, ${formatMoney(totals.earnedCents)} in all` : ''}`}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="wish-empty">
          <p>Nothing to sell yet.</p>
          <p className="toolbar">
            <button type="button" className="primary" onClick={() => setEditing({ item: null })}>
              Add something to sell
            </button>
          </p>
        </div>
      ) : board ? (
        <Board items={shown} ctx={ctx} />
      ) : shown.length === 0 ? (
        <p className="muted">{list.length === 0 ? (view === 'selling' ? 'Nothing for sale right now.' : 'Nothing sold yet. Things you sell or give away show up here.') : 'Nothing matches these filters.'}</p>
      ) : layout === 'list' ? (
        <ResaleTable items={shown} ctx={ctx} gone={view === 'gone'} />
      ) : (
        <ul className="wish-cards">
          {shown.map((i) => (
            <ResaleCard key={i.id} item={i} ctx={ctx} />
          ))}
        </ul>
      )}

      {editing && (
        <ResaleEditor
          item={editing.item}
          sites={settings.resaleSites}
          tags={tags}
          brands={[...new Set([...items, ...wishes].map((i) => i.brand).filter((b) => b !== undefined))].sort()}
          onClose={() => setEditing(null)}
        />
      )}
      {selling && <MarkSold item={selling} categories={categories} lastCategory={settings.resaleIncomeCategory} fromWishlist={wishName(selling)} onClose={() => setSelling(null)} />}
      {giving && <MarkGiven item={giving} fromWishlist={wishName(giving)} onClose={() => setGiving(null)} />}
    </section>
  )
}

interface ResaleContext {
  tags: Tag[]
  today: string
  onEdit: (i: ResaleItem) => void
  onStatus: (i: ResaleItem, status: ResaleStatus) => void
  onSold: (i: ResaleItem) => void
  onGiven: (i: ResaleItem) => void
  onBack: (i: ResaleItem) => void
  onDelete: (i: ResaleItem) => void
  onImage: (i: ResaleItem, imageUrl: string) => void
}

/** A column per step; a card dropped on a column moves to that step. */
function Board({ items, ctx }: { items: ResaleItem[]; ctx: ResaleContext }) {
  const [over, setOver] = useState<ResaleStatus | null>(null)
  return (
    <div className="resale-board">
      {SELLING.map((status) => {
        const cards = items.filter((i) => i.status === status)
        const asked = cards.reduce((sum, i) => sum + (i.askingCents ?? 0), 0)
        return (
          <section
            key={status}
            className={`resale-column${over === status ? ' drop-here' : ''}`}
            aria-label={RESALE_STATUS_LABELS[status]}
            onDragOver={(e: DragEvent) => {
              if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
              e.preventDefault()
              setOver(status)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null)
            }}
            onDrop={(e) => {
              const id = e.dataTransfer.getData(DRAG_TYPE)
              setOver(null)
              const item = items.find((i) => i.id === id)
              if (item && item.status !== status) ctx.onStatus(item, status)
            }}
          >
            <h2 className="resale-column-head">
              {RESALE_STATUS_LABELS[status]} <span className="tab-count">{cards.length}</span>
              {asked > 0 && <span className="muted small resale-column-sum">{formatMoney(asked)}</span>}
            </h2>
            {cards.length === 0 ? (
              <p className="muted small resale-column-empty">{status === 'toPost' ? 'Add something with +' : 'Drag a card here'}</p>
            ) : (
              <ul className="resale-column-cards">
                {cards.map((i) => (
                  <BoardCard key={i.id} item={i} ctx={ctx} />
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

function Picture({ item, ctx, small }: { item: ResaleItem; ctx: ResaleContext; small?: boolean }) {
  const [broken, setBroken] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)
  const image = item.imageUrl && broken !== item.imageUrl ? item.imageUrl : null
  const take = async (data: DataTransfer) => {
    const url = await imageFromTransfer(data)
    if (url) ctx.onImage(item, url)
  }
  return (
    <div
      className={`wish-image${small ? ' resale-thumb' : ''}${dropping ? ' dropping' : ''}`}
      title="Drop or paste a picture here"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_TYPE)) return
        e.preventDefault()
        e.stopPropagation()
        setDropping(true)
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes(DRAG_TYPE)) return
        e.preventDefault()
        e.stopPropagation()
        setDropping(false)
        void take(e.dataTransfer)
      }}
      onPaste={(e) => {
        e.preventDefault()
        void take(e.clipboardData)
      }}
    >
      {image ? <img src={image} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setBroken(image)} /> : <PlaceholderArt name={item.name} />}
    </div>
  )
}

/** What it asks and the least you'd take. */
function Price({ item }: { item: ResaleItem }) {
  if (isGone(item.status))
    return item.status === 'sold' ? (
      <>
        {money(item.soldCents)}
        {item.askingCents !== null && item.soldCents !== undefined && item.soldCents !== item.askingCents && <span className="muted small"> · asked {formatMoney(item.askingCents)}</span>}
      </>
    ) : (
      <span className="muted small">Given away</span>
    )
  return item.askingCents === null ? (
    <span className="muted small">No price yet</span>
  ) : (
    <>
      {formatMoney(item.askingCents)}
      {item.lowestCents !== undefined && (
        <span className="muted small resale-lowest" title="The least you'd take">
          {' '}
          · lowest {formatMoney(item.lowestCents)}
        </span>
      )}
    </>
  )
}

/** Where it stands: how long it's been posted, a nudge, or when it went. */
function StatusBadges({ item, ctx, board }: { item: ResaleItem; ctx: ResaleContext; board?: boolean }) {
  const nudge = resaleNudge(item, ctx.today)
  const due = nudge && nudge.from <= ctx.today
  if (item.status === 'sold' || item.status === 'given')
    return (
      <span className="wish-when">
        <span className={`when-badge ${item.status === 'sold' ? 'ready' : 'wait'}`}>
          {RESALE_STATUS_LABELS[item.status]}
          {item.soldOn ? ` ${shortDay(item.soldOn, ctx.today)}` : ''}
        </span>
      </span>
    )
  return (
    <span className="wish-when">
      {/* On the board the column already says To post or Reserved. */}
      {item.status === 'toPost' && (!board || due) && (
        <span className={`when-badge ${due ? 'later' : 'wait'}`} title={due ? 'It has waited a week: post it, so it actually gets sold' : `Added ${shortDay(item.addedOn, ctx.today)}`}>
          {due ? `Not posted for ${daysText(nudge.days)}` : 'To post'}
        </span>
      )}
      {item.status === 'posted' && (
        <>
          <span className="when-badge wait" title={item.postedOn ? `First posted ${shortDay(item.postedOn, ctx.today)}` : undefined}>
            Posted {nudge ? `${daysText(nudge.days)}${nudge.days > 0 ? ' ago' : ''}` : ''}
          </span>
          {due && (
            <span className="when-badge later" title="A month without a buyer: a lower price usually helps. Lowering it starts the count again.">
              Lower the price?
            </span>
          )}
        </>
      )}
      {item.status === 'reserved' && !board && (
        <span className="when-badge fits" title={item.notes}>
          Reserved
        </span>
      )}
    </span>
  )
}

function Sites({ item, ctx, max }: { item: ResaleItem; ctx: ResaleContext; max?: number }) {
  const tagNames = item.tagIds.map((id) => ctx.tags.find((t) => t.id === id)?.name).filter((n) => n !== undefined)
  const chips = [...item.sites.map((s) => ({ key: s, text: s, className: 'wish-chip' })), ...tagNames.map((n) => ({ key: `#${n}`, text: formatTag(n), className: 'tag-chip' }))]
  // Empty keeps its space on a card; its status badge already says it isn't posted.
  if (chips.length === 0) return max ? <div className="wish-chips">{'\u00a0'}</div> : <span className="muted">–</span>
  const shown = max ? chips.slice(0, max) : chips
  const rest = chips.length - shown.length
  return (
    <div className={`wish-chips${max ? ' one-line' : ''}`}>
      {shown.map((c) => (
        <span key={c.key} className={c.className} title={c.text}>
          {c.text}
        </span>
      ))}
      {rest > 0 && (
        <span className="chip-more" title={chips.slice(max).map((c) => c.text).join(', ')}>
          +{rest}
        </span>
      )}
    </div>
  )
}

const opensEditor = (e: MouseEvent) => !(e.target as HTMLElement).closest('button, a, select, input, [role="menu"]')

function ResaleCard({ item, ctx }: { item: ResaleItem; ctx: ResaleContext }) {
  return (
    <li className="wish-card resale-card" onClick={(e) => opensEditor(e) && ctx.onEdit(item)}>
      <Picture item={item} ctx={ctx} />
      <div className="wish-body">
        <div className="wish-title">
          <span className="wish-name" title={item.name}>
            {item.name}
          </span>
          <ResaleMenu item={item} ctx={ctx} />
        </div>
        <div className="wish-row wish-meta small">{item.brand ?? ' '}</div>
        <div className="wish-row wish-price">
          <Price item={item} />
        </div>
        <div className="wish-row">
          <Sites item={item} ctx={ctx} max={2} />
        </div>
        <div className="wish-row">
          <StatusBadges item={item} ctx={ctx} />
        </div>
      </div>
    </li>
  )
}

/** A small card on the board: a thumbnail beside the details, dragged between columns. */
function BoardCard({ item, ctx }: { item: ResaleItem; ctx: ResaleContext }) {
  return (
    <li
      className="resale-board-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, item.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={(e) => opensEditor(e) && ctx.onEdit(item)}
    >
      <Picture item={item} ctx={ctx} small />
      <div className="resale-board-body">
        <div className="wish-title">
          <span className="wish-name" title={item.name}>
            {item.name}
          </span>
          <ResaleMenu item={item} ctx={ctx} />
        </div>
        <div className="wish-price small">
          <Price item={item} />
        </div>
        <Sites item={item} ctx={ctx} max={2} />
        <StatusBadges item={item} ctx={ctx} board />
      </div>
    </li>
  )
}

function ResaleMenu({ item, ctx }: { item: ResaleItem; ctx: ResaleContext }) {
  const gone = isGone(item.status)
  return (
    <Menu label={`More for ${item.name}`}>
      {(close) => (
        <>
          {!gone && (
            <>
              <button type="button" role="menuitem" onClick={() => (close(), ctx.onSold(item))}>
                <SoldIcon /> Sold…
              </button>
              {item.status !== 'posted' && (
                <button type="button" role="menuitem" title="Note it's up for sale: Upcoming reminds you after a month without a buyer" onClick={() => (close(), ctx.onStatus(item, 'posted'))}>
                  <PostIcon /> {item.status === 'reserved' ? 'Not reserved any more' : 'Posted'}
                </button>
              )}
              {item.status !== 'reserved' && (
                <button type="button" role="menuitem" onClick={() => (close(), ctx.onStatus(item, 'reserved'))}>
                  <ReservedIcon /> Reserved
                </button>
              )}
              <button type="button" role="menuitem" onClick={() => (close(), ctx.onGiven(item))}>
                <GiveIcon /> Given away…
              </button>
            </>
          )}
          {gone && (
            <button
              type="button"
              role="menuitem"
              title={item.transactionId ? 'Back to For sale; the income added to Tracking is removed' : 'Back to For sale'}
              onClick={() => (close(), ctx.onBack(item))}
            >
              <RestoreIcon /> Back to For sale
            </button>
          )}
          {item.url && (
            <a role="menuitem" className="menu-link" href={item.url} target="_blank" rel="noreferrer" onClick={close}>
              <LinkIcon /> Open the listing
            </a>
          )}
          <button type="button" role="menuitem" onClick={() => (close(), ctx.onEdit(item))}>
            <EditIcon /> Edit…
          </button>
          <ConfirmButton
            label={
              <>
                <TrashIcon /> Delete
              </>
            }
            title={item.transactionId ? `Delete ${item.name}; its income stays in Tracking` : `Delete ${item.name}`}
            confirmLabel="Sure? Click again to delete"
            onConfirm={() => (close(), ctx.onDelete(item))}
          />
        </>
      )}
    </Menu>
  )
}

function ResaleTable({ items, ctx, gone }: { items: ResaleItem[]; ctx: ResaleContext; gone: boolean }) {
  return (
    <div className="grid-scroll">
      <table className="tool-table wish-table resale-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Sites</th>
            <th>{gone ? 'When' : 'Status'}</th>
            <th className="num">{gone ? 'Got' : 'Asking'}</th>
            {!gone && <th className="num">Lowest</th>}
            <th aria-label="More" />
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="clickable" onClick={(e) => opensEditor(e) && ctx.onEdit(i)}>
              <td className="wish-name">
                {i.name}
                {i.brand && <span className="muted small"> · {i.brand}</span>}
              </td>
              <td>
                <Sites item={i} ctx={ctx} />
              </td>
              <td>
                <StatusBadges item={i} ctx={ctx} />
              </td>
              <td className="num">{gone ? (i.status === 'sold' ? money(i.soldCents) : '–') : money(i.askingCents)}</td>
              {!gone && <td className="num muted">{money(i.lowestCents)}</td>}
              <td className="actions">
                <ResaleMenu item={i} ctx={ctx} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const svg = (paths: ReactNode) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths}
  </svg>
)

/** Three columns: the board. */
const BoardIcon = () =>
  svg(
    <>
      <rect x="3.5" y="4" width="5" height="16" rx="1.2" />
      <rect x="9.5" y="4" width="5" height="11" rx="1.2" />
      <rect x="15.5" y="4" width="5" height="7" rx="1.2" />
    </>,
  )

/** A price tag with a tick: sold. */
const SoldIcon = () =>
  svg(
    <>
      <path d="M3.5 12.5V5a1.5 1.5 0 0 1 1.5-1.5h7.5l8 8-9 9z" />
      <path d="m8.5 12 2 2 4-4.5" />
    </>,
  )

/** An arrow going up: posted. */
const PostIcon = () =>
  svg(
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M5 20h14" />
    </>,
  )

/** A clock: reserved for someone. */
const ReservedIcon = () =>
  svg(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>,
  )

/** A hand with a heart: given away. */
const GiveIcon = () =>
  svg(
    <>
      <path d="M12 9.5c-1.2-2.4-4.5-1.8-4.5.6 0 2 2.5 3.4 4.5 4.9 2-1.5 4.5-2.9 4.5-4.9 0-2.4-3.3-3-4.5-.6z" />
      <path d="M3 17h4l3 2h6l4-3" />
    </>,
  )
