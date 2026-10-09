import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import CategorySelect from '../components/CategorySelect'
import ConfirmButton from '../components/ConfirmButton'
import Info from '../components/Info'
import Menu from '../components/Menu'
import { BellIcon, EditIcon, FilterIcon, PlusIcon, ReceiptIcon, TrashIcon } from '../components/icons'
import { useErrorMessage } from '../components/useErrorMessage'
import { getSettings, updateSettings } from '../db/actions'
import { db } from '../db/db'
import { deleteUpcomingItem, saveUpcomingItem, setUpcomingAlerts, setUpcomingCancelled, setUpcomingOverride } from '../db/upcoming'
import { formatMoney } from '../domain/money'
import type { Category } from '../domain/types'
import {
  flagOf,
  groupOf,
  hasAlert,
  inMonth,
  NOTICE_OPTIONS,
  REMIND_OPTIONS,
  REPEAT_LABELS,
  upcomingEvents,
  type Repeat,
  type UpcomingEvent,
  type UpcomingFlag,
  type UpcomingGroup,
  trackedPayments,
  type TrackedPayment,
  type UpcomingItem,
} from '../domain/upcoming'
import { todayIso } from './tracking/format'
import { Popup } from './wishlist/WishDialogs'

const GROUP_LABELS: Record<UpcomingGroup, string> = { thisMonth: 'This month', nextMonth: 'Next month', later: 'Later' }

const SOURCE_TEXT: Record<UpcomingEvent['source'], string> = {
  planner: 'Yearly · Planner',
  tracking: 'Monthly',
  subscription: 'Monthly · Wishlist',
  warranty: 'Wishlist',
  own: '',
}

/** "today", "tomorrow" or "in 3 days": how far off a date is. */
const inDays = (date: string, today: string) => {
  const days = Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000)
  return days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`
}

/** A label's text: what needs doing, and how soon. */
const flagText = (flag: UpcomingFlag, e: UpcomingEvent, today: string) =>
  flag === 'priceUp'
    ? 'Price went up'
    : `${flag === 'dueSoon' ? 'Due' : flag === 'cancelSoon' ? 'Cancel' : 'Ends'} ${inDays(e.date, today)}`

/** Everything that will take money, or needs a decision, in the coming months. */
export default function UpcomingPage() {
  const settings = useLiveQuery(() => getSettings(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const cells = useLiveQuery(() => db.budgetCells.toArray(), [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [])
  const wishes = useLiveQuery(() => db.wishItems.toArray(), [])
  const items = useLiveQuery(() => db.upcomingItems.toArray(), [])
  const overrides = useLiveQuery(() => db.upcomingOverrides.toArray(), [])
  const tags = useLiveQuery(() => db.tags.toArray(), [])
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [filter, setFilter] = useState<{ categoryId: string; tagId: string }>({ categoryId: '', tagId: '' })
  const [calendar, setCalendar] = useState(false)
  const [editing, setEditing] = useState<UpcomingItem | 'new' | Partial<UpcomingItem> | null>(null)
  const [alerting, setAlerting] = useState<UpcomingEvent | null>(null)
  const [picking, setPicking] = useState(false)
  const { error, run } = useErrorMessage()
  if (!settings || !categories || !cells || !transactions || !wishes || !items || !overrides || !tags) return null

  const today = todayIso()
  // Wishlist things only count while the plug-in is on.
  const all = upcomingEvents({ categories, cells, transactions, wishes: settings.pluginWishlist ? wishes : [], items, overrides, settings }, today)
  const byId = new Map(categories.map((c) => [c.id, c]))
  const underCategory = (id: string | null) => {
    for (let c = id === null ? undefined : byId.get(id), n = 0; c && n < 50; c = c.parentId === null ? undefined : byId.get(c.parentId), n++) {
      if (c.id === filter.categoryId) return true
    }
    return false
  }
  const filtering = filter.categoryId !== '' || filter.tagId !== ''
  const events = all.filter(
    (e) =>
      (!flaggedOnly || flagOf(e, today)) &&
      (filter.categoryId === '' || underCategory(e.categoryId)) &&
      (filter.tagId === '' || (e.tagIds ?? []).includes(filter.tagId)),
  )
  // What you hid, so it can come back.
  const hiddenKeys = new Set(overrides.filter((o) => o.hidden).map((o) => o.id))
  const cancelledKeys = new Set(overrides.filter((o) => o.cancelledOn).map((o) => o.id))
  const unfiltered =
    hiddenKeys.size + cancelledKeys.size === 0
      ? []
      : upcomingEvents({ categories, cells, transactions, wishes: settings.pluginWishlist ? wishes : [], items, overrides: [], settings }, today).filter(
          (e, i, list) => e.kind !== 'cancelBy' && list.findIndex((x) => x.sourceKey === e.sourceKey) === i,
        )
  const hidden = unfiltered.filter((e) => hiddenKeys.has(e.sourceKey) && !cancelledKeys.has(e.sourceKey))
  // What you ticked as cancelled, so it can be undone.
  const cancelled: Array<{ key: string; name: string; on: string; line: Parameters<typeof setUpcomingCancelled>[0] }> = [
    ...unfiltered
      .filter((e) => cancelledKeys.has(e.sourceKey))
      .map((e) => ({ key: e.sourceKey, name: e.name, on: overrides.find((o) => o.id === e.sourceKey)!.cancelledOn!, line: e })),
    ...items
      .filter((i) => i.cancelledOn)
      .map((i) => ({ key: `own:${i.id}`, name: i.name, on: i.cancelledOn!, line: { sourceKey: `own:${i.id}`, itemId: i.id, source: 'own' } })),
  ]
  const groups = (['thisMonth', 'nextMonth', 'later'] as const).map((g) => ({ g, rows: events.filter((e) => groupOf(e, today) === g) }))
  const onEdit = (e: UpcomingEvent) => {
    const item = items.find((i) => i.id === e.itemId)
    if (item) setEditing(item)
  }
  // Only categories and tags that something in Upcoming uses.
  const usedCategories = categories.filter((c) => !c.archived && all.some((e) => e.categoryId !== null && (e.categoryId === c.id || isUnder(byId, e.categoryId, c.id))))
  const usedTags = tags.filter((t) => all.some((e) => e.tagIds?.includes(t.id)))

  return (
    <section className="page upcoming-page">
      <div className="page-head">
        <h1>
          Upcoming{' '}
          <Info>
            What will take money, or needs a decision, in the next 12 months. Pulse reads it from what it already knows:
            once-a-year lines in the Planner, payments that came every month lately in Tracking, and subscriptions and
            warranties in your Wishlist. Add your own, like a birthday or an insurance renewal, or start one from something
            you paid before. Set alerts on a line in its ⋯ menu.
          </Info>
        </h1>
        <div className="toolbox" role="toolbar" aria-label="Tools">
          <button type="button" className="tool" aria-label="New" title="New: add your own, like a birthday or an insurance renewal" onClick={() => setEditing('new')}>
            <PlusIcon />
          </button>
          <button
            type="button"
            className="tool"
            aria-label="From Tracking"
            title="From Tracking: start a line from something you paid before, with its name, amount and category filled in"
            onClick={() => setPicking(true)}
          >
            <ReceiptIcon />
          </button>
          <span className="toolbox-divider" aria-hidden="true" />
          <button
            type="button"
            className="tool"
            aria-label="Only alerts"
            aria-pressed={flaggedOnly}
            title="Only alerts: show just the lines with a label, like Due soon, Cancel soon, a warranty that ends soon or a price that went up"
            onClick={() => setFlaggedOnly(!flaggedOnly)}
          >
            <BellIcon />
          </button>
          <Menu
            label="Filter"
            title={filtering ? 'Filter (on): show only one category or tag' : 'Filter: show only one category or tag'}
            icon={<FilterIcon />}
            buttonClass={`tool${filtering ? ' on' : ''}`}
            panelClass="menu upcoming-filter"
          >
            {() => (
              <>
                <label className="wish-field">
                  <span>Category</span>
                  <select value={filter.categoryId} onChange={(e) => setFilter({ ...filter, categoryId: e.target.value })}>
                    <option value="">All categories</option>
                    {usedCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.parentId ? `  ${c.name}` : c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wish-field">
                  <span>Tag</span>
                  <select value={filter.tagId} onChange={(e) => setFilter({ ...filter, tagId: e.target.value })} disabled={usedTags.length === 0}>
                    <option value="">{usedTags.length === 0 ? 'No tags in Upcoming' : 'All tags'}</option>
                    {usedTags.map((t) => (
                      <option key={t.id} value={t.id}>
                        #{t.name}
                      </option>
                    ))}
                  </select>
                </label>
                {filtering && (
                  <button type="button" onClick={() => setFilter({ categoryId: '', tagId: '' })}>
                    Show everything
                  </button>
                )}
              </>
            )}
          </Menu>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="view-tabs upcoming-views" role="tablist" aria-label="Views">
        <button type="button" role="tab" aria-selected={!calendar} className="view-tab" onClick={() => setCalendar(false)}>
          Overview
        </button>
        <button type="button" role="tab" aria-selected={calendar} className="view-tab" onClick={() => setCalendar(true)}>
          Calendar
        </button>
      </div>
      {all.length === 0 ? (
        <p className="muted upcoming-empty">
          Nothing coming up yet. Once-a-year lines in the Planner and payments that repeat in Tracking show up here by
          themselves. Add your own with the + button.
        </p>
      ) : calendar ? (
        <UpcomingCalendar events={events} today={today} onOpen={(e) => (e.source === 'own' && e.kind === 'payment' ? onEdit(e) : e.kind !== 'warranty' && setAlerting(e))} />
      ) : (
        groups.map(({ g, rows }) => <Group key={g} group={g} rows={rows} today={today} categories={categories} onEdit={onEdit} onAlerts={setAlerting} run={run} />)
      )}
      {(flaggedOnly || filtering) && events.length === 0 && all.length > 0 && <p className="muted small">Nothing matches the filter.</p>}
      {cancelled.length > 0 && (
        <details className="upcoming-hidden">
          <summary className="muted small">Cancelled ({cancelled.length})</summary>
          <ul>
            {cancelled.map((c) => (
              <li key={c.key}>
                <span>
                  {c.name} <span className="muted small">cancelled {shortDate(c.on)}</span>
                </span>
                <button type="button" onClick={() => void run(() => setUpcomingCancelled(c.line, false, today))}>
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {hidden.length > 0 && (
        <details className="upcoming-hidden">
          <summary className="muted small">Hidden ({hidden.length})</summary>
          <ul>
            {hidden.map((e) => (
              <li key={e.sourceKey}>
                <span>{e.kind === 'warranty' ? `${e.name}: warranty` : e.name}</span>
                <button type="button" onClick={() => void run(() => setUpcomingOverride(e.sourceKey, { hidden: false }))}>
                  Show again
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {picking && (
        <FromTracking
          payments={trackedPayments(transactions, today, settings.upcomingRepeatsOnly)}
          repeatsOnly={settings.upcomingRepeatsOnly}
          categories={categories}
          onPick={(p) => {
            setPicking(false)
            setEditing({ name: p.name, cents: p.cents, date: p.nextDate, repeat: p.repeat, categoryId: p.categoryId })
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {editing && (
        <Editor
          item={editing !== 'new' && 'id' in editing ? (editing as UpcomingItem) : undefined}
          prefill={editing !== 'new' && !('id' in editing) ? editing : undefined}
          categories={categories}
          today={today}
          onClose={() => setEditing(null)}
        />
      )}
      {alerting && <AlertsDialog e={alerting} onClose={() => setAlerting(null)} />}
    </section>
  )
}

function isUnder(byId: Map<string, Category>, id: string, ancestor: string): boolean {
  for (let c = byId.get(id), n = 0; c && n < 50; c = c.parentId === null ? undefined : byId.get(c.parentId), n++) if (c.id === ancestor) return true
  return false
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** The coming months as a calendar, one month at a time; a monthly payment shows in every month. */
function UpcomingCalendar({ events, today, onOpen }: { events: UpcomingEvent[]; today: string; onOpen: (e: UpcomingEvent) => void }) {
  const [offset, setOffset] = useState(0)
  const first = today.slice(0, 7) + '-01'
  const [y, m] = first.split('-').map(Number) as [number, number]
  const index = y * 12 + (m - 1) + offset
  const month = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
  const { days, anyDay } = inMonth(events, month)
  const daysInMonth = new Date(Date.UTC(Math.floor(index / 12), (index % 12) + 1, 0)).getUTCDate()
  const lead = (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7
  const cells: Array<string | null> = [...Array<null>(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)]
  while (cells.length % 7 !== 0) cells.push(null)
  const total = [...[...days.values()].flat(), ...anyDay].reduce((sum, e) => sum + (e.kind === 'payment' ? (e.cents ?? 0) : 0), 0)
  return (
    <section className="upcoming-calendar" aria-label="Calendar">
      <div className="upcoming-calendar-head">
        <button type="button" className="icon-button" aria-label="Previous month" disabled={offset === 0} onClick={() => setOffset(offset - 1)}>
          ‹
        </button>
        <h2>
          {MONTHS[(index % 12)]} {Math.floor(index / 12)}
          {total > 0 && <span className="upcoming-total">{formatMoney(total)} to pay</span>}
        </h2>
        <button type="button" className="icon-button" aria-label="Next month" disabled={offset >= 11} onClick={() => setOffset(offset + 1)}>
          ›
        </button>
      </div>
      {anyDay.length > 0 && (
        <p className="small upcoming-anyday">
          <span className="muted">Sometime this month: </span>
          {anyDay.map((e, i) => (
            <span key={e.key}>
              {i > 0 && ', '}
              <button type="button" className={`upcoming-chip kind-${e.kind}`} onClick={() => onOpen(e)}>
                {e.name} {e.cents !== null && formatMoney(e.cents)}
              </button>
            </span>
          ))}
        </p>
      )}
      <div className="calendar upcoming-month">
        {WEEKDAYS.map((w) => (
          <span key={w} className="calendar-weekday">
            {w}
          </span>
        ))}
        {cells.map((date, i) =>
          date === null ? (
            <span key={`blank-${i}`} className="calendar-blank" />
          ) : (
            <div key={date} className={`upcoming-day${date === today ? ' today' : ''}${date < today ? ' past' : ''}`}>
              <span className="calendar-date">{Number(date.slice(8))}</span>
              {(days.get(date) ?? []).map((e) => {
                const flag = flagOf(e, today)
                const label = e.kind === 'cancelBy' ? `Cancel ${e.name}` : e.kind === 'warranty' ? `${e.name} warranty` : e.name
                return (
                  <button
                    key={e.key + date}
                    type="button"
                    className={`upcoming-chip kind-${e.kind}${flag ? ` ${flag}` : ''}`}
                    title={`${label}${e.kind === 'payment' && e.cents !== null ? `: ${formatMoney(e.cents)}` : ''}${flag ? ` · ${flagText(flag, e, today)}` : ''}`}
                    onClick={() => onOpen(e)}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          ),
        )}
      </div>
    </section>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Every date the same way, "Oct 05". Within 12 months ahead the month alone tells the year. */
const shortDate = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(8, 10)}`

function Group({
  group,
  rows,
  today,
  categories,
  onEdit,
  onAlerts,
  run,
}: {
  group: UpcomingGroup
  rows: UpcomingEvent[]
  today: string
  categories: Category[]
  onEdit: (e: UpcomingEvent) => void
  onAlerts: (e: UpcomingEvent) => void
  run: ReturnType<typeof useErrorMessage>['run']
}) {
  const toPay = rows.reduce((sum, e) => sum + (e.kind === 'payment' && !e.done ? (e.cents ?? 0) : 0), 0)
  return (
    <section className="upcoming-group" aria-label={GROUP_LABELS[group]}>
      <h2>
        {GROUP_LABELS[group]}
        {toPay > 0 && <span className="upcoming-total">{formatMoney(toPay)} to pay</span>}
      </h2>
      {rows.length === 0 ? (
        <p className="muted small">Nothing.</p>
      ) : (
        <table className="tool-table upcoming-table">
          <tbody>
            {rows.map((e) => (
              <Row key={e.key} e={e} today={today} categories={categories} onEdit={onEdit} onAlerts={onAlerts} run={run} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

/** Where a line comes from, on hover over its second line. */
const SOURCE_HOVER: Record<UpcomingEvent['source'], string> = {
  planner: 'From a once-a-year line in the Planner. Change its amount or month there.',
  tracking: 'Found in Tracking: it was paid once in each of the last two months. It follows the amount and day of the last payment.',
  subscription: 'An owned subscription in your Wishlist. It stops when you mark it as ended there.',
  warranty: 'The warranty of something you own. Change its date in the item’s timeline in the Wishlist.',
  own: 'Added by you.',
}

function Row({
  e,
  today,
  categories,
  onEdit,
  onAlerts,
  run,
}: {
  e: UpcomingEvent
  today: string
  categories: Category[]
  onEdit: (e: UpcomingEvent) => void
  onAlerts: (e: UpcomingEvent) => void
  run: ReturnType<typeof useErrorMessage>['run']
}) {
  const category = categories.find((c) => c.id === e.categoryId)
  const flag = flagOf(e, today)
  const name = e.kind === 'cancelBy' ? `Last day to cancel ${e.name}` : e.kind === 'warranty' ? `${e.name}: warranty ends` : e.name
  // Alerts belong to the payment; its "last day to cancel" line leads there too.
  const canAlert = e.kind !== 'warranty' && !e.done
  // Its day has passed and Tracking doesn't show it paid.
  const overdue = !e.done && e.kind === 'payment' && !e.monthOnly && e.date < today
  const detail =
    e.kind === 'cancelBy'
      ? `It renews on ${shortDate(e.renewsOn!)}`
      : e.kind === 'warranty'
        ? 'Check it still works while it’s covered'
        : e.done
          ? 'Paid this month'
          : overdue
            ? 'Not in Tracking yet'
            : e.source === 'own'
            ? REPEAT_LABELS[e.repeat]
            : SOURCE_TEXT[e.source]
  const open = () => (e.source === 'own' && e.kind === 'payment' ? onEdit(e) : canAlert ? onAlerts(e) : undefined)
  return (
    <tr
      className={`upcoming-row kind-${e.kind}${e.done ? ' done' : overdue ? ' overdue' : ''}`}
      onClick={(ev) => {
        if (!(ev.target as HTMLElement).closest('button, a, label, input, [role="menu"]')) open()
      }}
    >
      <td className="upcoming-date">{shortDate(e.date)}</td>
      <td className="upcoming-what">
        <span className="upcoming-name">
          {e.done && <span aria-label="Paid">✓ </span>}
          {name}
          {e.kind === 'payment' && hasAlert(e) && (
            <span className="upcoming-bell" title={alertText(e)} aria-label={alertText(e)}>
              <BellIcon />
            </span>
          )}
        </span>
        <span className="muted small" title={SOURCE_HOVER[e.source]}>
          {detail}
        </span>

      </td>
      <td className="upcoming-cat">{category && <span className={`category-chip ${category.block}`}>{category.name}</span>}</td>
      <td className="num upcoming-amount">
        {e.kind === 'cancelBy' ? (
          <label className="upcoming-cancelled" title="Tick once you’ve cancelled it: it leaves Upcoming and Tracking stops expecting it">
            <input type="checkbox" onChange={() => void run(() => setUpcomingCancelled(e, true, today))} /> Cancelled
          </label>
        ) : e.kind === 'payment' && e.cents !== null ? (
          formatMoney(e.cents)
        ) : (
          ''
        )}
      </td>
      <td className="upcoming-flag">
        {flag && (
          <span
            className={`upcoming-badge ${flag}`}
            title={
              flag === 'priceUp' && e.priceUp
                ? `It was ${formatMoney(e.priceUp.from)}, now ${formatMoney(e.priceUp.to)}`
                : flag === 'cancelSoon'
                  ? 'The last day to cancel is less than 2 weeks away'
                  : flag === 'dueSoon'
                    ? 'Inside the reminder you set'
                    : 'The warranty ends within a month'
            }
          >
            {flagText(flag, e, today)}
          </span>
        )}
      </td>
      <td className="actions">
        <Menu label={`More for ${name}`}>
          {(close) => (
            <>
              {e.source === 'own' && e.kind === 'payment' && (
                <button type="button" role="menuitem" onClick={() => (close(), onEdit(e))}>
                  <EditIcon /> Edit…
                </button>
              )}
              {canAlert && (
                <button type="button" role="menuitem" onClick={() => (close(), onAlerts(e))}>
                  <BellIcon /> Alerts
                </button>
              )}
              {e.source === 'own' ? (
                <ConfirmButton
                  label={
                    <>
                      <TrashIcon /> Delete
                    </>
                  }
                  confirmLabel="Sure? Click again to delete"
                  onConfirm={() => (close(), void run(() => deleteUpcomingItem(e.itemId!)))}
                />
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  title="Leave it out of Upcoming. It stays where it came from."
                  onClick={() => (close(), void run(() => setUpcomingOverride(e.sourceKey, { hidden: true })))}
                >
                  <TrashIcon /> Hide
                </button>
              )}
            </>
          )}
        </Menu>
      </td>
    </tr>
  )
}

const daysText = (days: number, options: Array<[number, string]>) => options.find(([d]) => d === days)?.[1] ?? `${days} days`

/** The alerts on a line, in a few words. */
const alertText = (e: UpcomingEvent) =>
  [e.remindDays && `Payment reminder ${daysText(e.remindDays, REMIND_OPTIONS)} before`, e.noticeDays && `Cancel reminder ${daysText(e.noticeDays, NOTICE_OPTIONS)} before`]
    .filter(Boolean)
    .join(' · ')

/** The two alerts a payment can have, each on its own. */
function AlertsDialog({ e, onClose }: { e: UpcomingEvent; onClose: () => void }) {
  const [remind, setRemind] = useState(String(e.remindDays ?? 0))
  const [notice, setNotice] = useState(String(e.noticeDays ?? 0))
  const [cancelled, setCancelled] = useState(false)
  const { error, run } = useErrorMessage()
  const repeats = e.repeat !== 'once'
  return (
    <Popup title={`Alerts: ${e.name}`} onClose={onClose} className="small-dialog">
      <form
        className="wish-form"
        onSubmit={(ev) => {
          ev.preventDefault()
          void run(async () => {
            await setUpcomingAlerts(e, { remindDays: Number(remind), noticeDays: repeats ? Number(notice) : 0 })
            if (cancelled) await setUpcomingCancelled(e, true, todayIso())
            onClose()
          })
        }}
      >
        {error && <p className="error">{error}</p>}
        <label className="wish-field wide">
          <span>
            Payment reminder <Info>Shows “Due soon” on the line this long before it’s paid.</Info>
          </span>
          <select value={remind} onChange={(ev) => setRemind(ev.target.value)}>
            <option value="0">Off</option>
            {REMIND_OPTIONS.map(([days, label]) => (
              <option key={days} value={days}>
                {label} before
              </option>
            ))}
          </select>
        </label>
        {repeats && (
          <label className="wish-field wide">
            <span>
              Cancel reminder{' '}
              <Info>
                For a contract or subscription that renews itself: how long before it renews you have to cancel. Upcoming adds that
                last day as its own line, marked “Cancel soon” in the last 2 weeks.
              </Info>
            </span>
            <select value={notice} onChange={(ev) => setNotice(ev.target.value)}>
              <option value="0">Off</option>
              {NOTICE_OPTIONS.map(([days, label]) => (
                <option key={days} value={days}>
                  {label} before
                </option>
              ))}
            </select>
          </label>
        )}
        {repeats && notice !== '0' && (
          <label className="wish-check wide">
            <input type="checkbox" checked={cancelled} onChange={(ev) => setCancelled(ev.target.checked)} />
            I’ve cancelled it{' '}
            <Info>It leaves Upcoming and Tracking stops expecting it. A Wishlist subscription is marked as cancelled there. Undo it under Cancelled at the bottom of Upcoming.</Info>
          </label>
        )}
        <div className="wish-actions wide">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Save
          </button>
        </div>
      </form>
    </Popup>
  )
}

const centsText = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2).replace(/\.00$/, ''))

/** Adds or changes something of your own. Its alerts are set apart, under Alerts. */
function Editor({
  item,
  prefill,
  categories,
  today,
  onClose,
}: {
  item: UpcomingItem | undefined
  /** Filled in from something tracked, for a new line. */
  prefill?: Partial<UpcomingItem>
  categories: Category[]
  today: string
  onClose: () => void
}) {
  const start = item ?? prefill
  const [name, setName] = useState(start?.name ?? '')
  const [amount, setAmount] = useState(centsText(start?.cents ?? null))
  const [date, setDate] = useState(start?.date ?? today)
  const [repeat, setRepeat] = useState<Repeat>(start?.repeat ?? 'once')
  const [categoryId, setCategoryId] = useState<string | null>(start?.categoryId ?? null)
  const { error, run } = useErrorMessage()

  return (
    <Popup title={item ? `Edit ${item.name}` : 'New in Upcoming'} onClose={onClose} className="small-dialog">
      <form
        className="wish-form"
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            const text = amount.trim().replace(',', '.')
            const cents = text === '' ? null : Math.round(Number(text) * 100)
            if (cents !== null && !Number.isFinite(cents)) throw new Error('Type the amount as a number, or leave it empty.')
            await saveUpcomingItem({ name, cents, date, repeat, categoryId, noticeDays: item?.noticeDays, remindDays: item?.remindDays }, item?.id)
            onClose()
          })
        }}
      >
        {error && <p className="error">{error}</p>}
        <label className="wish-field wide">
          <span>Name</span>
          <input autoFocus required placeholder="Mum’s birthday, car insurance…" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="wish-field">
          <span>
            Amount <Info>Leave it empty for a deadline that costs nothing, like renewing your ID card.</Info>
          </span>
          <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="wish-field">
          <span>{repeat === 'once' ? 'Date' : 'Next date'}</span>
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="wish-field">
          <span>Repeats</span>
          <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
            {(Object.keys(REPEAT_LABELS) as Repeat[]).map((r) => (
              <option key={r} value={r}>
                {REPEAT_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <div className="wish-field">
          <span>Paid from</span>
          <CategorySelect label="Paid from" categories={categories} blocks={['expenses', 'savings']} placeholder="No category" value={categoryId} onChange={(c) => setCategoryId(c?.categoryId ?? null)} />
        </div>
        <div className="wish-actions wide">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {item ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </Popup>
  )
}

type PaymentSort = 'times' | 'priceHigh' | 'priceLow' | 'latest'

const PAYMENT_SORTS: Record<PaymentSort, [string, (a: TrackedPayment, b: TrackedPayment) => number]> = {
  times: ['Most often', (a, b) => b.times - a.times || b.lastDate.localeCompare(a.lastDate)],
  priceHigh: ['Highest price', (a, b) => b.cents - a.cents],
  priceLow: ['Lowest price', (a, b) => a.cents - b.cents],
  latest: ['Most recent', (a, b) => b.lastDate.localeCompare(a.lastDate)],
}

/** Pick something you paid before, to start an Upcoming line from it. */
function FromTracking({
  payments,
  repeatsOnly,
  categories,
  onPick,
  onClose,
}: {
  payments: TrackedPayment[]
  repeatsOnly: boolean
  categories: Category[]
  onPick: (p: TrackedPayment) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const nameOf = (id: string | null) => categories.find((c) => c.id === id)?.name ?? ''
  const [sort, setSort] = useState<PaymentSort>('times')
  const shown = payments
    .filter((p) => words.every((w) => `${p.name} ${nameOf(p.categoryId)}`.toLowerCase().includes(w)))
    .sort(PAYMENT_SORTS[sort][1])
    .slice(0, 100)
  return (
    <Popup title="From Tracking" onClose={onClose} className="small-dialog from-tracking">
      <p className="muted small">Pick something you paid before. Its name, amount and category are filled in, and you can change them before adding it.</p>
      <div className="from-tracking-tools">
        <input type="search" autoFocus placeholder="Search by name or category" aria-label="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as PaymentSort)}>
          {(Object.keys(PAYMENT_SORTS) as PaymentSort[]).map((k) => (
            <option key={k} value={k}>
              {PAYMENT_SORTS[k][0]}
            </option>
          ))}
        </select>
      </div>
      <span className="switch-row small">
        <span>
          Repeated payments only <Info>Only payments made more than once to the same place for the same amount, like a subscription. Also in Settings → General.</Info>
        </span>
        <label className="switch">
          <input type="checkbox" role="switch" aria-label="Repeated payments only" checked={repeatsOnly} onChange={(e) => void updateSettings({ upcomingRepeatsOnly: e.target.checked })} />
          <span aria-hidden="true" />
        </label>
      </span>
      {shown.length === 0 ? (
        <p className="muted small">Nothing tracked matches.</p>
      ) : (
        <ul className="from-tracking-list">
          {shown.map((p) => (
            <li key={p.key}>
              <button type="button" onClick={() => onPick(p)}>
                <span className="from-tracking-name">
                  <strong>{p.name}</strong>
                  <span className="muted small">
                    {nameOf(p.categoryId) || 'No category'} · last {shortDate(p.lastDate)}
                    {p.lastDate.slice(0, 4) !== todayIso().slice(0, 4) ? `, ${p.lastDate.slice(0, 4)}` : ''}
                    {p.times > 1 ? ` · ${p.times} times` : ''}
                  </span>
                </span>
                <span className="num">{formatMoney(p.cents)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Popup>
  )
}
