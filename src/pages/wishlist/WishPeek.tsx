import { useEffect, useRef, type ReactNode } from 'react'
import { useErrorMessage } from '../../components/useErrorMessage'
import { setTimelineDate, type TimelineDate } from '../../db/wishlist'
import { EditIcon, PeekCenterIcon, PeekSideIcon, RestoreIcon } from '../../components/icons'
import { formatMoney } from '../../domain/money'
import { formatTag } from '../../domain/tags'
import type { Category, Tag } from '../../domain/types'
import {
  averageLifetime,
  copiesOf,
  KIND_LABELS,
  ownedFor,
  ownShare,
  spentOnAllCopies,
  STATUS_LABELS,
  statusOf,
  type OwnedStatus,
  type WishItem,
} from '../../domain/wishlist'
import { dayLabel } from '../tracking/format'
import { KindIcon } from './KindIcon'
import { PlaceholderArt } from './PlaceholderArt'
import { boughtWord } from './WishDialogs'

export type PeekMode = 'center' | 'side'

const date = (iso: string | undefined) => (iso ? `${dayLabel(iso)} ${iso.slice(0, 4)}` : '–')

/**
 * Everything about one wish or owned thing: its details, and a timeline of every copy you've
 * had. Opens in the middle of the page or as a panel on the side, like a Notion page; the
 * button in its bar switches between the two.
 */
export default function WishPeek({
  wish,
  mode,
  wishCategories,
  categories,
  tags,
  today,
  onMode,
  onClose,
  onEdit,
  onStatus,
  onBuyAgain,
  onReplace,
}: {
  wish: WishItem
  mode: PeekMode
  wishCategories: Map<string, string>
  categories: Category[]
  tags: Tag[]
  today: string
  onMode: (mode: PeekMode) => void
  onClose: () => void
  onEdit: () => void
  onStatus: (status: OwnedStatus) => void
  onBuyAgain: () => void
  onReplace: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (mode === 'center' && !d.open) d.showModal()
    if (mode === 'side' && !d.open) d.show()
  }, [mode])
  // The side panel isn't modal, so Escape is caught here.
  useEffect(() => {
    if (mode !== 'side') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]:modal')) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mode, onClose])

  return (
    <dialog
      key={mode}
      ref={dialog}
      className={`peek peek-${mode}`}
      aria-label={wish.name}
      onClose={onClose}
      onClick={(e) => {
        if (mode === 'center' && e.target === dialog.current) dialog.current.close()
      }}
    >
      <div className="peek-frame">
        <div className="peek-bar">
          <span className="peek-kind" title={KIND_LABELS[wish.kind]}>
            <KindIcon kind={wish.kind} /> {KIND_LABELS[wish.kind]}
          </span>
          <span className="peek-tools">
            <button type="button" className="icon-button" title="Edit" aria-label="Edit" onClick={onEdit}>
              <EditIcon />
            </button>
            <button
              type="button"
              className="icon-button"
              title={mode === 'center' ? 'Open as a side panel' : 'Open in the middle'}
              aria-label={mode === 'center' ? 'Open as a side panel' : 'Open in the middle'}
              onClick={() => onMode(mode === 'center' ? 'side' : 'center')}
            >
              {mode === 'center' ? <PeekSideIcon /> : <PeekCenterIcon />}
            </button>
            <button type="button" className="icon-button" aria-label="Close" title="Close" onClick={() => (mode === 'center' ? dialog.current?.close() : onClose())}>
              ×
            </button>
          </span>
        </div>
        <div className="peek-body">
          <div className="peek-image">{wish.imageUrl ? <img src={wish.imageUrl} alt="" referrerPolicy="no-referrer" /> : <PlaceholderArt name={wish.name} />}</div>
          <div className="peek-main">
            <h2 className="peek-title">{wish.name}</h2>
            {wish.brand && <p className="peek-brand muted">{wish.brand}</p>}
            <Facts wish={wish} wishCategories={wishCategories} categories={categories} tags={tags} today={today} onStatus={onStatus} />
            <Timeline wish={wish} today={today} onBuyAgain={onBuyAgain} onReplace={onReplace} />
          </div>
        </div>
      </div>
    </dialog>
  )
}

function Facts({
  wish,
  wishCategories,
  categories,
  tags,
  today,
  onStatus,
}: {
  wish: WishItem
  wishCategories: Map<string, string>
  categories: Category[]
  tags: Tag[]
  today: string
  onStatus: (status: OwnedStatus) => void
}) {
  const rows: Array<[string, ReactNode]> = []
  const perMonth = wish.kind === 'subscription' ? ' / month' : ''
  rows.push(['Price when added', wish.priceCents === null ? <span className="muted">Not known</span> : `${formatMoney(wish.priceCents)}${perMonth}`])
  if (wish.owned) {
    const paid = wish.paidCents ?? wish.priceCents
    rows.push(['Paid', paid === null ? '–' : `${formatMoney(paid)}${perMonth}`])
    if (wish.giftShare) rows.push(['Gift share', `${wish.giftShare}%, so your part was ${formatMoney(ownShare(paid ?? 0, wish.giftShare))}`])
    rows.push([boughtWord(wish.kind) === 'done' ? 'Done on' : 'Bought on', date(wish.purchasedOn)])
    if (wish.kind !== 'experience') {
      rows.push([
        'Status',
        <select key="s" aria-label={`Status of ${wish.name}`} value={statusOf(wish)} onChange={(e) => onStatus(e.target.value as OwnedStatus)}>
          {(Object.keys(STATUS_LABELS) as OwnedStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>,
      ])
      if (wish.purchasedOn && statusOf(wish) === 'inUse') rows.push(['Owned for', wish.purchasedOn >= today ? 'Bought today' : ownedFor(wish.purchasedOn, today)])
    }
  }
  if (wish.categoryIds.length > 0)
    rows.push([
      'Categories',
      <span key="c" className="wish-chips">
        {wish.categoryIds.map((id) => (
          <span key={id} className="wish-chip">
            {wishCategories.get(id)}
          </span>
        ))}
      </span>,
    ])
  const tagNames = wish.tagIds.map((id) => tags.find((t) => t.id === id)?.name).filter((n) => n !== undefined)
  if (tagNames.length > 0)
    rows.push([
      'Tags',
      <span key="t" className="wish-chips">
        {tagNames.map((n) => (
          <span key={n} className="tag-chip">
            {formatTag(n)}
          </span>
        ))}
      </span>,
    ])
  const from = categories.find((c) => c.id === wish.paidFrom)
  if (from) rows.push(['Paid from', from.name])
  if (wish.giftFor) rows.push(['Present for', wish.giftFor])
  if (wish.url)
    rows.push([
      'Link',
      <a key="l" className="button peek-link" href={wish.url} target="_blank" rel="noreferrer">
        Open the page ↗
      </a>,
    ])

  return (
    <dl className="peek-facts">
      {rows.map(([label, value]) => (
        <div key={label} className="peek-fact">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Added, then each copy: bought, and how it ended. */
function Timeline({ wish, today, onBuyAgain, onReplace }: { wish: WishItem; today: string; onBuyAgain: () => void; onReplace: () => void }) {
  const copies = copiesOf(wish)
  const many = copies.length > 1 || (!wish.owned && copies.length > 0)
  const { error, run } = useErrorMessage()
  const events: Array<{ on?: string; title: string; detail?: string; kind: 'add' | 'buy' | 'end' | 'now'; which?: TimelineDate }> = [
    { on: wish.addedOn, title: 'Added', kind: 'add', which: { field: 'addedOn' } },
  ]
  copies.forEach((c, i) => {
    const word = boughtWord(wish.kind) === 'done' ? 'Done' : 'Bought'
    events.push({
      on: c.purchasedOn,
      title: many ? `${word} #${i + 1}` : word,
      detail: c.paidCents !== undefined ? formatMoney(ownShare(c.paidCents, c.giftShare)) : undefined,
      kind: 'buy',
      which: { copy: i, field: 'purchasedOn' },
    })
    if (c.end) {
      events.push({
        on: c.endedOn,
        title: STATUS_LABELS[c.end],
        detail: c.purchasedOn && c.endedOn ? `lasted ${ownedFor(c.purchasedOn, c.endedOn)}` : undefined,
        kind: 'end',
        which: { copy: i, field: 'endedOn' },
      })
    } else if (c.current && c.purchasedOn && wish.kind !== 'experience') {
      events.push({ on: today, title: 'In use', detail: c.purchasedOn >= today ? 'since today' : `${ownedFor(c.purchasedOn, today)} so far`, kind: 'now' })
    }
  })
  if (!wish.owned && copies.length > 0) events.push({ title: 'On the wishlist to replace', kind: 'now' })
  // In date order; "now" lines stay last, and an imported date that comes after a purchase can't jump ahead of it.
  events.sort((a, b) => (a.kind === 'now' || b.kind === 'now' ? Number(a.kind === 'now') - Number(b.kind === 'now') : (a.on ?? '').localeCompare(b.on ?? '')))
  const average = averageLifetime(wish)
  const ended = wish.owned && statusOf(wish) !== 'inUse'

  return (
    <section className="peek-timeline" aria-label="Timeline">
      <h3>Timeline</h3>
      {error && <p className="error">{error}</p>}
      {copies.length > 0 && (
        <p className="peek-summary">
          {copies.length} {copies.length === 1 ? 'copy' : 'copies'} · {formatMoney(spentOnAllCopies(wish))} in total
          {average && ` · each lasted about ${average}`}
        </p>
      )}
      <ol className="timeline">
        {events.map((e, i) => (
          // Keyed by what the line is, so a line that moves after its date changes keeps its place for the keyboard.
          <li key={e.which ? JSON.stringify(e.which) : `${e.kind}-${i}`} className={`tl-${e.kind}`}>
            <span className="tl-dot" aria-hidden="true" />
            <span className="tl-title">{e.title}</span>
            {e.detail && <span className="tl-detail muted"> · {e.detail}</span>}
            {e.which ? (
              <input
                type="date"
                className="tl-date tl-date-input"
                aria-label={`Date: ${e.title}`}
                title="Change the date"
                value={e.on ?? ''}
                max={today}
                onChange={(ev) => ev.target.value && void run(() => setTimelineDate(wish.id, e.which!, ev.target.value))}
              />
            ) : (
              e.on && e.kind !== 'now' && <span className="tl-date muted">{date(e.on)}</span>
            )}
          </li>
        ))}
      </ol>
      {ended && (
        <div className="peek-actions">
          <button type="button" className="primary" onClick={onBuyAgain}>
            Bought again…
          </button>
          <button type="button" onClick={onReplace} title="Put it back on the wishlist; buying it then starts the next copy">
            <RestoreIcon /> Add to wishlist to replace
          </button>
        </div>
      )}
    </section>
  )
}
