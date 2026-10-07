import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type DragEvent } from 'react'
import ConfirmButton from '../components/ConfirmButton'
import Info from '../components/Info'
import Menu from '../components/Menu'
import { EditIcon, PlusIcon, RestoreIcon, StarIcon, TrashIcon } from '../components/icons'
import { useErrorMessage } from '../components/useErrorMessage'
import { db } from '../db/db'
import { getSettings, updateSettings } from '../db/actions'
import { deleteWish, moveWish, replaceLater, setOwnedStatus, unmarkBought, updateWish } from '../db/wishlist'
import { localToday } from '../domain/lab'
import { formatMoney } from '../domain/money'
import { formatTag } from '../domain/tags'
import {
  brandSummary,
  imageSearchUrl,
  facetItems,
  hasEnded,
  isFiltering,
  spentOnAllCopies,
  statusOf,
  type EndReason,
  KIND_LABELS,
  matchesFilter,
  ownedFor,
  shownPrice,
  STATUS_LABELS,
  type OwnedStatus,
  type FilterKey,
  type WishFilter,
  type WishItem,
  type WishKind,
} from '../domain/wishlist'
import type { Category, Tag, WishCardField } from '../domain/types'
import { dayLabel } from './tracking/format'
import { MultiFilter, PriceFilter, type FilterOption } from './wishlist/Filters'
import { imageFromTransfer } from './wishlist/images'
import { KindIcon } from './wishlist/KindIcon'
import { boughtWord, EndDate, MarkBought, WishEditor } from './wishlist/WishDialogs'
import WishPeek from './wishlist/WishPeek'

type View = 'wishes' | 'owned' | 'archived'
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

/** Options with how many of the items have each, leaving out the ones none has. */
function withCounts(options: FilterOption[], items: WishItem[], has: (w: WishItem, value: string) => boolean): FilterOption[] {
  return options.flatMap((o) => {
    const n = items.filter((w) => has(w, o.value)).length
    return n > 0 ? [{ ...o, detail: String(n) }] : []
  })
}

const money = (cents: number | null | undefined) => (cents === null || cents === undefined ? '–' : formatMoney(cents))

/** The Wishlist plug-in: wishes in your own order, and everything you own. */
export default function WishlistPage() {
  const items = useLiveQuery(() => db.wishItems.orderBy('order').toArray(), [])
  const wishCategories = useLiveQuery(() => db.wishCategories.orderBy('order').toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const tags = useLiveQuery(() => db.tags.orderBy('name').toArray(), [])
  const settings = useLiveQuery(() => getSettings(), [])
  const [view, setView] = useState<View>('wishes')
  const [peekId, setPeekId] = useState<string | null>(null)
  const [ending, setEnding] = useState<{ wish: WishItem; status: EndReason } | null>(null)
  const [layout, setLayoutState] = useState<Layout>(readLayout)
  const [filter, setFilter] = useState<WishFilter>({})
  const [editing, setEditing] = useState<{ wish: WishItem | null } | null>(null)
  const [buying, setBuying] = useState<WishItem | null>(null)
  const { error, run } = useErrorMessage()
  if (!items || !wishCategories || !categories || !tags || !settings) return null

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
    setFilter({ ...filter, brands: undefined, tagIds: undefined, statuses: undefined })
  }
  const wishes = items.filter((w) => !w.owned)
  const allOwned = items.filter((w) => w.owned).sort((a, b) => (b.purchasedOn ?? '').localeCompare(a.purchasedOn ?? '') || a.order - b.order)
  const archiving = settings.wishArchiveEnded
  const owned = archiving ? allOwned.filter((w) => !hasEnded(w)) : allOwned
  const archived = archiving ? allOwned.filter(hasEnded) : []
  const shownView: View = view === 'archived' && !archiving ? 'owned' : view
  const list = shownView === 'wishes' ? wishes : shownView === 'owned' ? owned : archived
  const viewFilter: WishFilter = shownView !== 'wishes' ? filter : { ...filter, statuses: undefined }
  const shown = list.filter((w) => matchesFilter(w, viewFilter))
  const filtering = isFiltering(viewFilter)
  // Each filter offers only what the other filters leave, so with Tech picked the brands are Tech brands.
  const facet = (key: FilterKey) => facetItems(list, viewFilter, key)
  // Brands in this view, each with what was spent on it across everything owned.
  const spent = new Map(brandSummary(allOwned).map((b) => [b.brand.toLowerCase(), b.spentCents]))
  const today = localToday()

  const total = shown.reduce((sum, w) => sum + (shownView !== 'wishes' ? spentOnAllCopies(w) : (w.priceCents ?? 0)), 0)
  const peek = peekId ? items.find((w) => w.id === peekId) : undefined
  const askStatus = (wish: WishItem, status: OwnedStatus) =>
    status === 'inUse' ? void run(() => setOwnedStatus(wish.id, status)) : setEnding({ wish, status })
  const ctx: CardContext = {
    wishCategories: new Map(wishCategories.map((c) => [c.id, c.name])),
    categories,
    tags,
    today,
    canDrag: shownView === 'wishes',
    fields: new Set(settings.wishCardFields),
    owned: shownView !== 'wishes',
    onOpen: (wish) => setPeekId(wish.id),
    onEdit: (wish) => setEditing({ wish }),
    onBuy: setBuying,
    onBack: (wish) => void run(() => unmarkBought(wish.id)),
    onReplace: (wish) => void run(() => replaceLater(wish.id)),
    onDelete: (wish) => void run(() => deleteWish(wish.id)),
    onStar: (wish) => void run(() => updateWish(wish.id, { desired: !wish.desired })),
    onStatus: askStatus,
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
            aria-label={shownView !== 'wishes' ? 'Add something you own' : 'Add a wish'}
            title={shownView !== 'wishes' ? 'Add something you already own' : 'Add a wish'}
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
        <button type="button" role="tab" className="view-tab" aria-selected={shownView === 'wishes'} onClick={() => switchView('wishes')}>
          Wishlist <span className="tab-count">{wishes.length}</span>
        </button>
        <button type="button" role="tab" className="view-tab" aria-selected={shownView === 'owned'} onClick={() => switchView('owned')}>
          Owned <span className="tab-count">{owned.length}</span>
        </button>
        {archiving && (
          <button
            type="button"
            role="tab"
            className="view-tab"
            aria-selected={shownView === 'archived'}
            title="Things that broke, got lost or were sold"
            onClick={() => switchView('archived')}
          >
            Archived <span className="tab-count">{archived.length}</span>
          </button>
        )}
      </div>

      <div className="wish-filters" role="search" aria-label="Filters">
        <input
          type="search"
          aria-label="Search"
          placeholder="Search name or brand"
          value={filter.text ?? ''}
          onChange={(e) => setFilter({ ...filter, text: e.target.value || undefined })}
        />
        <MultiFilter
          label="Category"
          plural="categories"
          selected={filter.categoryIds ?? []}
          options={withCounts(wishCategories.map((c) => ({ value: c.id, label: c.name })), facet('categoryIds'), (w, v) => w.categoryIds.includes(v))}
          onChange={(categoryIds) => setFilter({ ...filter, categoryIds })}
        />
        <MultiFilter
          label="Brand"
          plural="brands"
          selected={filter.brands ?? []}
          options={brandSummary(facet('brands')).map((b) => {
            const paid = spent.get(b.brand.toLowerCase()) ?? 0
            return { value: b.brand, label: b.brand, detail: `${b.count}${paid > 0 ? ` · ${formatMoney(paid)} spent` : ''}` }
          })}
          onChange={(brands) => setFilter({ ...filter, brands })}
        />
        <MultiFilter
          label="Tag"
          plural="tags"
          selected={filter.tagIds ?? []}
          options={withCounts(tags.map((t) => ({ value: t.id, label: formatTag(t.name) })), facet('tagIds'), (w, v) => w.tagIds.includes(v))}
          onChange={(tagIds) => setFilter({ ...filter, tagIds })}
        />
        <MultiFilter
          label="Kind"
          plural="kinds"
          selected={filter.kinds ?? []}
          options={withCounts((Object.keys(KIND_LABELS) as WishKind[]).map((k) => ({ value: k, label: KIND_LABELS[k] })), facet('kinds'), (w, v) => w.kind === v)}
          onChange={(kinds) => setFilter({ ...filter, kinds: kinds as WishKind[] })}
        />
        {shownView !== 'wishes' && (
          <MultiFilter
            label="Status"
            plural="statuses"
            selected={filter.statuses ?? []}
            options={withCounts((Object.keys(STATUS_LABELS) as OwnedStatus[]).map((st) => ({ value: st, label: STATUS_LABELS[st] })), facet('statuses'), (w, v) => (w.status ?? 'inUse') === v)}
            onChange={(statuses) => setFilter({ ...filter, statuses: statuses as OwnedStatus[] })}
          />
        )}
        <PriceFilter
          prices={facet('price').flatMap((w) => {
            const p = shownPrice(w)
            return p === null ? [] : [p]
          })}
          value={filter.price}
          onChange={(price) => setFilter({ ...filter, price })}
        />
        {filtering && (
          <button type="button" onClick={() => setFilter({})}>
            Clear filters
          </button>
        )}
        <span className="wish-total muted small">
          {shown.length} {shown.length === 1 ? 'thing' : 'things'}
          {total > 0 && ` · ${formatMoney(total)}${shownView !== 'wishes' ? ' spent' : ''}`}
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
        <p className="muted">{list.length === 0 ? (shownView === 'owned' ? 'Nothing owned yet. Mark a wish as bought and it shows up here.' : shownView === 'archived' ? 'Nothing archived. Things that break, get lost or are sold show up here.' : 'No wishes left.') : 'Nothing matches these filters.'}</p>
      ) : layout === 'cards' ? (
        <ul className="wish-cards">
          {shown.map((w) => (
            <WishCard key={w.id} wish={w} ctx={ctx} />
          ))}
        </ul>
      ) : (
        <WishTable items={shown} ctx={ctx} owned={shownView !== 'wishes'} />
      )}

      {editing && (
        <WishEditor
          wish={editing.wish}
          owned={shownView === 'owned'}
          wishCategories={wishCategories}
          categories={categories}
          tags={tags}
          brands={brandSummary(items).map((b) => b.brand)}
          onClose={() => setEditing(null)}
        />
      )}
      {buying && <MarkBought wish={buying} categories={categories} onClose={() => setBuying(null)} />}
      {ending && <EndDate wish={ending.wish} status={ending.status} archives={archiving} onClose={() => setEnding(null)} />}
      {peek && (
        <WishPeek
          wish={peek}
          mode={settings.wishPeek}
          wishCategories={ctx.wishCategories}
          categories={categories}
          tags={tags}
          today={today}
          onMode={(wishPeek) => void updateSettings({ wishPeek })}
          onClose={() => setPeekId(null)}
          onEdit={() => setEditing({ wish: peek })}
          onStatus={(status) => askStatus(peek, status)}
          onBuyAgain={() => setBuying(peek)}
          onReplace={() => void run(() => replaceLater(peek.id))}
        />
      )}
    </section>
  )
}

interface CardContext {
  wishCategories: Map<string, string>
  categories: Category[]
  tags: Tag[]
  today: string
  canDrag: boolean
  /** The rows the cards show (Settings → Plug-ins). */
  fields: Set<WishCardField>
  /** Owned or archived: the cards show how long and their status. */
  owned: boolean
  onOpen: (w: WishItem) => void
  onEdit: (w: WishItem) => void
  onBuy: (w: WishItem) => void
  onBack: (w: WishItem) => void
  onReplace: (w: WishItem) => void
  onDelete: (w: WishItem) => void
  onStar: (w: WishItem) => void
  onStatus: (w: WishItem, status: OwnedStatus) => void
  onImage: (w: WishItem, imageUrl: string) => void
  onMove: (id: string, target: string, after: boolean) => void
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
    <li
      className={`wish-card${over ? ` drop-${over}` : ''}${wish.owned ? ' owned' : ''}`}
      {...props}
      onClick={(e) => {
        // The card opens its details, unless a button, link or box on it was used.
        if ((e.target as HTMLElement).closest('button, a, select, input, [role="menu"]')) return
        ctx.onOpen(wish)
      }}
    >
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
        <span className="kind-icon" title={KIND_LABELS[wish.kind]} aria-label={KIND_LABELS[wish.kind]}>
          <KindIcon kind={wish.kind} />
        </span>
        <StarButton wish={wish} onStar={ctx.onStar} />
      </div>
      <div className="wish-body">
        <div className="wish-title">
          <span className="wish-name" title={wish.name}>
            {wish.name}
          </span>
          <WishMenu wish={wish} ctx={ctx} />
        </div>
        {/* Every card has the same rows in the same places; an empty one keeps its space. */}
        {ctx.fields.has('brand') && <div className="wish-row wish-meta small">{wish.brand ?? '\u00a0'}</div>}
        {(ctx.fields.has('price') || ctx.fields.has('giftShare')) && (
          <div className="wish-row wish-price">
            {ctx.fields.has('price') &&
              (price === null ? (
                <span className="muted small">No price yet</span>
              ) : (
                <>
                  {money(price)}
                  {wish.kind === 'subscription' && <span className="muted small"> / month</span>}
                </>
              ))}
            {ctx.fields.has('giftShare') && wish.owned && wish.giftShare ? (
              <span className="muted small">
                {ctx.fields.has('price') ? ' · ' : ''}
                {wish.giftShare}% gift
              </span>
            ) : null}
            {!ctx.fields.has('price') && !(wish.owned && wish.giftShare) ? '\u00a0' : null}
          </div>
        )}
        {ctx.fields.has('chips') && (
          <div className="wish-row">
            <Chips wish={wish} ctx={ctx} max={2} />
          </div>
        )}
        {ctx.owned && <OwnedLine wish={wish} ctx={ctx} />}
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

/** Categories, then tags. On a card only the first `max` show, with a "+N" for the rest. */
function Chips({ wish, ctx, max }: { wish: WishItem; ctx: CardContext; max?: number }) {
  const tagNames = wish.tagIds.map((id) => ctx.tags.find((t) => t.id === id)?.name).filter((n) => n !== undefined)
  const chips = [
    ...wish.categoryIds.map((id) => ({ key: id, text: ctx.wishCategories.get(id) ?? '', className: 'wish-chip' })),
    ...tagNames.map((n) => ({ key: `#${n}`, text: formatTag(n), className: 'tag-chip' })),
  ]
  if (chips.length === 0) return max ? <div className="wish-chips">{'\u00a0'}</div> : null
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

function OwnedLine({ wish, ctx }: { wish: WishItem; ctx: CardContext }) {
  const copies = (wish.history?.length ?? 0) + 1
  const ended = statusOf(wish) !== 'inUse'
  return (
    <>
      {ctx.fields.has('ownedFor') && (
        <div className="wish-row wish-owned-for small muted">
          <span>
            {!wish.purchasedOn
              ? 'Owned'
              : wish.kind === 'experience'
                ? `Done ${dayLabel(wish.purchasedOn)}`
                : ended
                  ? `${STATUS_LABELS[statusOf(wish)]}${wish.endedOn ? ` ${dayLabel(wish.endedOn)} ${wish.endedOn.slice(0, 4)}` : ''}`
                  : wish.purchasedOn >= ctx.today
                    ? 'Bought today'
                    : `Owned for ${ownedFor(wish.purchasedOn, ctx.today)}`}
          </span>
          {copies > 1 && (
            <span className="copies-badge" title={`You've had ${copies} of these; open it to see each one`}>
              ×{copies}
            </span>
          )}
        </div>
      )}
      {ctx.fields.has('status') && (
        <div className="wish-row wish-owned small">
          {wish.kind === 'experience' ? (
            <span className="muted">Done</span>
          ) : (
            <StatusSelect wish={wish} ctx={ctx} />
          )}
        </div>
      )}
    </>
  )
}

function StatusSelect({ wish, ctx }: { wish: WishItem; ctx: CardContext }) {
  return (
    <select aria-label={`Status of ${wish.name}`} value={statusOf(wish)} onChange={(e) => ctx.onStatus(wish, e.target.value as OwnedStatus)}>
      {(Object.keys(STATUS_LABELS) as OwnedStatus[]).map((st) => (
        <option key={st} value={st}>
          {STATUS_LABELS[st]}
        </option>
      ))}
    </select>
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
          {wish.owned && statusOf(wish) !== 'inUse' && (
            <>
              <button type="button" role="menuitem" onClick={() => (close(), ctx.onBuy(wish))}>
                <DoneMark /> Bought again…
              </button>
              <button type="button" role="menuitem" title="Put it back on the wishlist; buying it then starts the next copy" onClick={() => (close(), ctx.onReplace(wish))}>
                <RestoreIcon /> Add to wishlist to replace
              </button>
            </>
          )}
          {wish.url && (
            <a role="menuitem" className="menu-link" href={wish.url} target="_blank" rel="noreferrer" onClick={close}>
              <LinkIcon /> Open the page
            </a>
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
    <tr
      className={`clickable${over ? ` drop-${over}` : ''}`}
      {...props}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, a, select, input, [role="menu"]')) return
        ctx.onOpen(wish)
      }}
    >
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
              <StatusSelect wish={wish} ctx={ctx} />
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

const LinkIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
)

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
