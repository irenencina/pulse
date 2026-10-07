import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type DragEvent } from 'react'
import ConfirmButton from '../components/ConfirmButton'
import Info from '../components/Info'
import Menu from '../components/Menu'
import { EditIcon, PlusIcon, RestoreIcon, StarIcon, TrashIcon } from '../components/icons'
import { useErrorMessage } from '../components/useErrorMessage'
import { db } from '../db/db'
import { deleteWish, moveWish, setOwnedStatus, unmarkBought, updateWish } from '../db/wishlist'
import { localToday } from '../domain/lab'
import { formatMoney } from '../domain/money'
import { formatTag } from '../domain/tags'
import {
  brandSummary,
  imageSearchUrl,
  KIND_LABELS,
  matchesFilter,
  ownedFor,
  ownShare,
  PRICE_RANGES,
  shownPrice,
  STATUS_LABELS,
  type OwnedStatus,
  type PriceRange,
  type WishFilter,
  type WishItem,
  type WishKind,
} from '../domain/wishlist'
import type { Category, Tag } from '../domain/types'
import { dayLabel } from './tracking/format'
import { imageFromTransfer } from './wishlist/images'
import { boughtWord, MarkBought, WishEditor } from './wishlist/WishDialogs'

type View = 'wishes' | 'owned'
type Layout = 'cards' | 'list'

const LAYOUT_KEY = 'pulse.wishlist.layout'
const DRAG_TYPE = 'application/x-pulse-wish'

function readLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'cards'
  } catch {
    return 'cards'
  }
}

const money = (cents: number | null | undefined) => (cents === null || cents === undefined ? '–' : formatMoney(cents))

/** The Wishlist plug-in: wishes in your own order, and everything you own. */
export default function WishlistPage() {
  const items = useLiveQuery(() => db.wishItems.orderBy('order').toArray(), [])
  const wishCategories = useLiveQuery(() => db.wishCategories.orderBy('order').toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const tags = useLiveQuery(() => db.tags.orderBy('name').toArray(), [])
  const [view, setView] = useState<View>('wishes')
  const [layout, setLayoutState] = useState<Layout>(readLayout)
  const [filter, setFilter] = useState<WishFilter>({})
  const [editing, setEditing] = useState<{ wish: WishItem | null } | null>(null)
  const [buying, setBuying] = useState<WishItem | null>(null)
  const { error, run } = useErrorMessage()
  if (!items || !wishCategories || !categories || !tags) return null

  const setLayout = (l: Layout) => {
    setLayoutState(l)
    try {
      localStorage.setItem(LAYOUT_KEY, l)
    } catch {
      // Only a preference.
    }
  }
  // Brands, tags and statuses differ per view, so those filters start over; the rest stay.
  const switchView = (v: View) => {
    setView(v)
    setFilter({ ...filter, brand: undefined, tagId: undefined, status: undefined })
  }
  const wishes = items.filter((w) => !w.owned)
  const owned = items.filter((w) => w.owned).sort((a, b) => (b.purchasedOn ?? '').localeCompare(a.purchasedOn ?? '') || a.order - b.order)
  const list = view === 'wishes' ? wishes : owned
  const shown = list.filter((w) => matchesFilter(w, view === 'owned' ? filter : { ...filter, status: undefined }))
  const filtering = Object.values(filter).some((v) => v !== undefined && v !== '' && v !== false)
  // Brands in this view, each with what was spent on it across everything owned.
  const spent = new Map(brandSummary(owned).map((b) => [b.brand.toLowerCase(), b.spentCents]))
  const brands = brandSummary(list).map((b) => ({ ...b, spentCents: spent.get(b.brand.toLowerCase()) ?? 0 }))
  const today = localToday()

  const total = shown.reduce((sum, w) => sum + (view === 'owned' ? ownShare(shownPrice(w) ?? 0, w.giftShare) : (w.priceCents ?? 0)), 0)
  const ctx: CardContext = {
    wishCategories: new Map(wishCategories.map((c) => [c.id, c.name])),
    categories,
    tags,
    today,
    canDrag: view === 'wishes',
    onEdit: (wish) => setEditing({ wish }),
    onBuy: setBuying,
    onBack: (wish) => void run(() => unmarkBought(wish.id)),
    onDelete: (wish) => void run(() => deleteWish(wish.id)),
    onStar: (wish) => void run(() => updateWish(wish.id, { desired: !wish.desired })),
    onStatus: (wish, status) => void run(() => setOwnedStatus(wish.id, status)),
    onImage: (wish, imageUrl) => void run(() => updateWish(wish.id, { imageUrl })),
    // Dropped on the first or second half of a wish: before it, or before the one after it in the full order.
    onMove: (id, target, after) => {
      const at = wishes.findIndex((w) => w.id === target)
      const before = after ? (wishes[at + 1]?.id ?? null) : target
      if (before !== id) void run(() => moveWish(id, before))
    },
  }

  return (
    <section className="page wide wishlist-page">
      <div className="page-head">
        <h1>
          Wishlist{' '}
          <Info>
            Things, experiences and subscriptions you'd like, in your own order: drag a card to move it up or down. Star the
            ones you want most. Drop a picture from a web page (or a file) on a card, or use Find image. When you buy one, mark
            it as bought: it moves to Owned and your part of the price is added to Tracking. The wishlist's categories are in
            Settings → Plug-ins.
          </Info>
        </h1>
        <div className="toolbox" role="toolbar" aria-label="Tools">
          <button
            type="button"
            className="tool"
            aria-label={view === 'owned' ? 'Add something you own' : 'Add a wish'}
            title={view === 'owned' ? 'Add something you already own' : 'Add a wish'}
            onClick={() => setEditing({ wish: null })}
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            className="tool star-tool"
            aria-label="Most desired only"
            aria-pressed={!!filter.desiredOnly}
            title="Show only the ones starred as most desired"
            onClick={() => setFilter({ ...filter, desiredOnly: !filter.desiredOnly || undefined })}
          >
            <StarIcon />
          </button>
          <button type="button" className="tool" aria-label="Cards" aria-pressed={layout === 'cards'} title="Show as cards with pictures" onClick={() => setLayout('cards')}>
            <CardsIcon />
          </button>
          <button type="button" className="tool" aria-label="List" aria-pressed={layout === 'list'} title="Show as a list" onClick={() => setLayout('list')}>
            <ListIcon />
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="view-tabs" role="tablist" aria-label="Views">
        <button type="button" role="tab" className="view-tab" aria-selected={view === 'wishes'} onClick={() => switchView('wishes')}>
          Wishlist <span className="tab-count">{wishes.length}</span>
        </button>
        <button type="button" role="tab" className="view-tab" aria-selected={view === 'owned'} onClick={() => switchView('owned')}>
          Owned <span className="tab-count">{owned.length}</span>
        </button>
      </div>

      <div className="wish-filters" role="search" aria-label="Filters">
        <input
          type="search"
          aria-label="Search"
          placeholder="Search name or brand"
          value={filter.text ?? ''}
          onChange={(e) => setFilter({ ...filter, text: e.target.value || undefined })}
        />
        <FilterSelect
          label="Category"
          value={filter.categoryId}
          options={wishCategories.map((c) => [c.id, c.name])}
          onChange={(categoryId) => setFilter({ ...filter, categoryId })}
        />
        <FilterSelect
          label="Brand"
          value={filter.brand}
          options={brands.map((b) => [b.brand, `${b.brand} · ${b.count}${b.spentCents > 0 ? ` · ${formatMoney(b.spentCents)} spent` : ''}`])}
          onChange={(brand) => setFilter({ ...filter, brand })}
        />
        <FilterSelect
          label="Tag"
          value={filter.tagId}
          options={tags.filter((t) => list.some((w) => w.tagIds.includes(t.id))).map((t) => [t.id, formatTag(t.name)])}
          onChange={(tagId) => setFilter({ ...filter, tagId })}
        />
        <FilterSelect
          label="Kind"
          value={filter.kind}
          options={(Object.keys(KIND_LABELS) as WishKind[]).map((k) => [k, KIND_LABELS[k]])}
          onChange={(kind) => setFilter({ ...filter, kind: kind as WishKind | undefined })}
        />
        <FilterSelect
          label="Price"
          value={filter.price}
          options={(Object.keys(PRICE_RANGES) as PriceRange[]).map((p) => [p, PRICE_RANGES[p]])}
          onChange={(price) => setFilter({ ...filter, price: price as PriceRange | undefined })}
        />
        {view === 'owned' && (
          <FilterSelect
            label="Status"
            value={filter.status}
            options={(Object.keys(STATUS_LABELS) as OwnedStatus[]).map((s) => [s, STATUS_LABELS[s]])}
            onChange={(status) => setFilter({ ...filter, status: status as OwnedStatus | undefined })}
          />
        )}
        {filtering && (
          <button type="button" onClick={() => setFilter({})}>
            Clear filters
          </button>
        )}
        <span className="wish-total muted small">
          {shown.length} {shown.length === 1 ? 'thing' : 'things'}
          {total > 0 && ` · ${formatMoney(total)}${view === 'owned' ? ' spent' : ''}`}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="wish-empty">
          <p>Your wishlist is empty.</p>
          <p className="toolbar">
            <button type="button" className="primary" onClick={() => setEditing({ wish: null })}>
              Add a wish
            </button>
          </p>
        </div>
      ) : shown.length === 0 ? (
        <p className="muted">{list.length === 0 ? (view === 'owned' ? 'Nothing owned yet. Mark a wish as bought and it shows up here.' : 'No wishes left.') : 'Nothing matches these filters.'}</p>
      ) : layout === 'cards' ? (
        <ul className="wish-cards">
          {shown.map((w) => (
            <WishCard key={w.id} wish={w} ctx={ctx} />
          ))}
        </ul>
      ) : (
        <WishTable items={shown} ctx={ctx} owned={view === 'owned'} />
      )}

      {editing && (
        <WishEditor
          wish={editing.wish}
          owned={view === 'owned'}
          wishCategories={wishCategories}
          categories={categories}
          tags={tags}
          brands={brandSummary(items).map((b) => b.brand)}
          onClose={() => setEditing(null)}
        />
      )}
      {buying && <MarkBought wish={buying} categories={categories} onClose={() => setBuying(null)} />}
    </section>
  )
}

interface CardContext {
  wishCategories: Map<string, string>
  categories: Category[]
  tags: Tag[]
  today: string
  canDrag: boolean
  onEdit: (w: WishItem) => void
  onBuy: (w: WishItem) => void
  onBack: (w: WishItem) => void
  onDelete: (w: WishItem) => void
  onStar: (w: WishItem) => void
  onStatus: (w: WishItem, status: OwnedStatus) => void
  onImage: (w: WishItem, imageUrl: string) => void
  onMove: (id: string, target: string, after: boolean) => void
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | undefined
  options: Array<[string, string]>
  onChange: (value: string | undefined) => void
}) {
  return (
    <select aria-label={label} className={value ? 'filter-on' : undefined} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">{`All ${label === 'Category' ? 'categories' : label === 'Status' ? 'statuses' : label === 'Price' ? 'prices' : label === 'Kind' ? 'kinds' : `${label.toLowerCase()}s`}`}</option>
      {options.map(([v, text]) => (
        <option key={v} value={v}>
          {text}
        </option>
      ))}
    </select>
  )
}

/** Drag and drop to reorder, shared by cards and list rows. */
function useReorder(wish: WishItem, ctx: CardContext, horizontal: boolean) {
  const [over, setOver] = useState<'before' | 'after' | null>(null)
  const side = (e: DragEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return (horizontal ? e.clientX - r.left < r.width / 2 : e.clientY - r.top < r.height / 2) ? 'before' : 'after'
  }
  const props = ctx.canDrag
    ? {
        draggable: true,
        onDragStart: (e: DragEvent<HTMLElement>) => {
          if ((e.target as HTMLElement).closest('input, select, a')) return e.preventDefault()
          e.dataTransfer.setData(DRAG_TYPE, wish.id)
          e.dataTransfer.effectAllowed = 'move'
        },
        onDragOver: (e: DragEvent<HTMLElement>) => {
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
          e.preventDefault()
          setOver(side(e))
        },
        onDragLeave: () => setOver(null),
        onDrop: (e: DragEvent<HTMLElement>) => {
          const id = e.dataTransfer.getData(DRAG_TYPE)
          setOver(null)
          if (!id) return
          e.preventDefault()
          if (id !== wish.id) ctx.onMove(id, wish.id, side(e) === 'after')
        },
      }
    : {}
  return { over, props }
}

function WishCard({ wish, ctx }: { wish: WishItem; ctx: CardContext }) {
  const { over, props } = useReorder(wish, ctx, true)
  const [broken, setBroken] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)
  const image = wish.imageUrl && broken !== wish.imageUrl ? wish.imageUrl : null
  const takeImage = async (data: DataTransfer) => {
    const url = await imageFromTransfer(data)
    if (url) ctx.onImage(wish, url)
  }
  const price = shownPrice(wish)

  return (
    <li className={`wish-card${over ? ` drop-${over}` : ''}${wish.owned ? ' owned' : ''}`} {...props}>
      <div
        className={`wish-image${dropping ? ' dropping' : ''}`}
        tabIndex={0}
        aria-label={`Picture of ${wish.name}: drop or paste a picture here`}
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
          void takeImage(e.dataTransfer)
        }}
        onPaste={(e) => {
          e.preventDefault()
          void takeImage(e.clipboardData)
        }}
      >
        {image ? (
          <img src={image} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setBroken(image)} />
        ) : (
          <div className="wish-image-empty">
            <a className="button" href={imageSearchUrl(wish)} target="_blank" rel="noreferrer" title="Search the web for a picture, then drag it here">
              Find image
            </a>
            <span className="muted small">{broken ? 'The picture didn’t load' : 'or drop one here'}</span>
          </div>
        )}
        <StarButton wish={wish} onStar={ctx.onStar} />
      </div>
      <div className="wish-body">
        <div className="wish-title">
          <span className="wish-name">
            {wish.url ? (
              <a href={wish.url} target="_blank" rel="noreferrer" title="Open the link">
                {wish.name}
              </a>
            ) : (
              wish.name
            )}
          </span>
          <WishMenu wish={wish} ctx={ctx} />
        </div>
        <div className="wish-meta small">
          {wish.brand && <span>{wish.brand}</span>}
          {wish.kind !== 'item' && <span className="kind-badge">{KIND_LABELS[wish.kind]}</span>}
        </div>
        <div className="wish-price">
          {price === null ? <span className="muted small">No price yet</span> : money(price)}
          {wish.kind === 'subscription' && price !== null && <span className="muted small"> / month</span>}
          {wish.owned && wish.giftShare ? <span className="muted small"> · {wish.giftShare}% gift</span> : null}
        </div>
        <Chips wish={wish} ctx={ctx} />
        {wish.owned && <OwnedLine wish={wish} ctx={ctx} />}
      </div>
    </li>
  )
}

function StarButton({ wish, onStar }: { wish: WishItem; onStar: (w: WishItem) => void }) {
  return (
    <button
      type="button"
      className={`star${wish.desired ? ' on' : ''}`}
      aria-pressed={wish.desired}
      aria-label="Most desired"
      title={wish.desired ? 'Most desired: click to unstar' : 'Star as most desired'}
      onClick={() => onStar(wish)}
    >
      <StarIcon />
    </button>
  )
}

function Chips({ wish, ctx }: { wish: WishItem; ctx: CardContext }) {
  const tagNames = wish.tagIds.map((id) => ctx.tags.find((t) => t.id === id)?.name).filter((n) => n !== undefined)
  if (wish.categoryIds.length === 0 && tagNames.length === 0) return null
  return (
    <div className="wish-chips">
      {wish.categoryIds.map((id) => (
        <span key={id} className="wish-chip">
          {ctx.wishCategories.get(id)}
        </span>
      ))}
      {tagNames.map((n) => (
        <span key={n} className="tag-chip">
          {formatTag(n)}
        </span>
      ))}
    </div>
  )
}

function OwnedLine({ wish, ctx }: { wish: WishItem; ctx: CardContext }) {
  return (
    <div className="wish-owned small">
      <span className="muted">
        {!wish.purchasedOn
          ? 'Owned'
          : wish.kind === 'experience'
            ? `Done ${dayLabel(wish.purchasedOn)}`
            : wish.purchasedOn >= ctx.today
              ? 'Bought today'
              : `Owned for ${ownedFor(wish.purchasedOn, ctx.today)}`}
      </span>
      {wish.kind !== 'experience' && (
        <select aria-label={`Status of ${wish.name}`} value={wish.status ?? 'inUse'} onChange={(e) => ctx.onStatus(wish, e.target.value as OwnedStatus)}>
          {(Object.keys(STATUS_LABELS) as OwnedStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

function WishMenu({ wish, ctx }: { wish: WishItem; ctx: CardContext }) {
  return (
    <Menu label={`More for ${wish.name}`}>
      {(close) => (
        <>
          {!wish.owned && (
            <button type="button" role="menuitem" onClick={() => (close(), ctx.onBuy(wish))}>
              <DoneMark /> Mark as {boughtWord(wish.kind)}…
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => (close(), ctx.onEdit(wish))}>
            <EditIcon /> Edit…
          </button>
          {wish.owned && (
            <button
              type="button"
              role="menuitem"
              title={wish.transactionId ? 'Back to the wishlist; the expense added to Tracking when it was bought is removed' : 'Back to the wishlist'}
              onClick={() => (close(), ctx.onBack(wish))}
            >
              <RestoreIcon /> Back to the wishlist
            </button>
          )}
          <ConfirmButton
            label={
              <>
                <TrashIcon /> Delete
              </>
            }
            title={wish.transactionId ? `Delete ${wish.name}; its expense stays in Tracking` : `Delete ${wish.name}`}
            confirmLabel="Sure? Click again to delete"
            onConfirm={() => (close(), ctx.onDelete(wish))}
          />
        </>
      )}
    </Menu>
  )
}

function WishTable({ items, ctx, owned }: { items: WishItem[]; ctx: CardContext; owned: boolean }) {
  return (
    <div className="grid-scroll">
      <table className="tool-table wish-table">
        <thead>
          <tr>
            <th aria-label="Most desired" />
            <th>Name</th>
            <th>Brand</th>
            <th>Categories and tags</th>
            {owned ? (
              <>
                <th>Bought</th>
                <th>Status</th>
                <th className="num">Paid</th>
              </>
            ) : (
              <>
                <th>Kind</th>
                <th className="num">Price</th>
              </>
            )}
            <th aria-label="More" />
          </tr>
        </thead>
        <tbody>
          {items.map((w) => (
            <WishRow key={w.id} wish={w} ctx={ctx} owned={owned} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function WishRow({ wish, ctx, owned }: { wish: WishItem; ctx: CardContext; owned: boolean }) {
  const { over, props } = useReorder(wish, ctx, false)
  return (
    <tr className={over ? `drop-${over}` : undefined} {...props}>
      <td className="star-cell">
        <StarButton wish={wish} onStar={ctx.onStar} />
      </td>
      <td className="wish-name">
        {wish.url ? (
          <a href={wish.url} target="_blank" rel="noreferrer" title="Open the link">
            {wish.name}
          </a>
        ) : (
          wish.name
        )}
      </td>
      <td>{wish.brand ?? <span className="muted">–</span>}</td>
      <td>
        <Chips wish={wish} ctx={ctx} />
      </td>
      {owned ? (
        <>
          <td className="muted">{wish.purchasedOn ? `${dayLabel(wish.purchasedOn)} ${wish.purchasedOn.slice(0, 4)}` : '–'}</td>
          <td>
            {wish.kind === 'experience' ? (
              <span className="muted">Done</span>
            ) : (
              <select aria-label={`Status of ${wish.name}`} value={wish.status ?? 'inUse'} onChange={(e) => ctx.onStatus(wish, e.target.value as OwnedStatus)}>
                {(Object.keys(STATUS_LABELS) as OwnedStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            )}
          </td>
          <td className="num">
            {money(shownPrice(wish))}
            {wish.giftShare ? <span className="muted small"> ({wish.giftShare}% gift)</span> : null}
          </td>
        </>
      ) : (
        <>
          <td className="muted">{KIND_LABELS[wish.kind]}</td>
          <td className="num">{money(wish.priceCents)}</td>
        </>
      )}
      <td className="actions">
        <WishMenu wish={wish} ctx={ctx} />
      </td>
    </tr>
  )
}

const DoneMark = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 7h12l-1 13H7z" />
    <path d="M9 7a3 3 0 0 1 6 0" />
    <path d="m9.5 13.5 2 2 3.5-4" />
  </svg>
)

const CardsIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </svg>
)

const ListIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="5" cy="6" r="0.6" fill="currentColor" />
    <circle cx="5" cy="12" r="0.6" fill="currentColor" />
    <circle cx="5" cy="18" r="0.6" fill="currentColor" />
  </svg>
)
