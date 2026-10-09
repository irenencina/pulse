import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import CategorySelect from '../components/CategorySelect'
import ConfirmButton from '../components/ConfirmButton'
import Info from '../components/Info'
import Menu from '../components/Menu'
import { EditIcon, PlusIcon, TrashIcon } from '../components/icons'
import { useErrorMessage } from '../components/useErrorMessage'
import { getSettings } from '../db/actions'
import { db } from '../db/db'
import { deleteUpcomingItem, saveUpcomingItem, setUpcomingOverride } from '../db/upcoming'
import { formatMoney } from '../domain/money'
import type { Category } from '../domain/types'
import {
  flagOf,
  groupOf,
  NOTICE_OPTIONS,
  REPEAT_LABELS,
  upcomingEvents,
  type Repeat,
  type UpcomingEvent,
  type UpcomingGroup,
  type UpcomingItem,
} from '../domain/upcoming'
import { todayIso } from './tracking/format'
import { Popup } from './wishlist/WishDialogs'

const GROUP_LABELS: Record<UpcomingGroup, string> = { thisMonth: 'This month', nextMonth: 'Next month', later: 'Later' }

const SOURCE_TEXT: Record<UpcomingEvent['source'], string> = {
  planner: 'Every year · Planner',
  tracking: 'Every month',
  subscription: 'Every month · Wishlist',
  warranty: 'Wishlist',
  own: '',
}

const FLAG_TEXT = {
  priceUp: 'Price went up',
  cancelSoon: 'Cancel soon',
  warrantySoon: 'Ends soon',
} as const

/** Everything that will take money, or needs a decision, in the coming months. */
export default function UpcomingPage() {
  const settings = useLiveQuery(() => getSettings(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const cells = useLiveQuery(() => db.budgetCells.toArray(), [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [])
  const wishes = useLiveQuery(() => db.wishItems.toArray(), [])
  const items = useLiveQuery(() => db.upcomingItems.toArray(), [])
  const overrides = useLiveQuery(() => db.upcomingOverrides.toArray(), [])
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [editing, setEditing] = useState<UpcomingEvent | 'new' | null>(null)
  const { error, run } = useErrorMessage()
  if (!settings || !categories || !cells || !transactions || !wishes || !items || !overrides) return null

  const today = todayIso()
  // Wishlist things only count while the plug-in is on.
  const all = upcomingEvents({ categories, cells, transactions, wishes: settings.pluginWishlist ? wishes : [], items, overrides, settings }, today)
  const events = flaggedOnly ? all.filter((e) => flagOf(e, today)) : all
  // What you hid, so it can come back.
  const hiddenKeys = new Set(overrides.filter((o) => o.hidden).map((o) => o.id))
  const hidden =
    hiddenKeys.size === 0
      ? []
      : upcomingEvents({ categories, cells, transactions, wishes: settings.pluginWishlist ? wishes : [], items, overrides: [], settings }, today).filter(
          (e, i, list) => hiddenKeys.has(e.sourceKey) && e.kind !== 'cancelBy' && list.findIndex((x) => x.sourceKey === e.sourceKey) === i,
        )
  const groups = (['thisMonth', 'nextMonth', 'later'] as const).map((g) => ({ g, rows: events.filter((e) => groupOf(e, today) === g) }))

  return (
    <section className="page upcoming-page">
      <div className="page-head">
        <h1>
          Upcoming{' '}
          <Info>
            What will take money, or needs a decision, in the next 12 months. Pulse finds most of it: once-a-year lines in
            the Planner, payments that came every month lately in Tracking, and subscriptions and warranties in your
            Wishlist. Add your own, like a birthday or an insurance renewal, with New. Give something a notice period and
            Upcoming adds the last day to cancel it before it renews.
          </Info>
        </h1>
        <div className="head-tools">
          <span className="switch-row">
            <span>
              Only alerts{' '}
              <Info>
                Show only the lines with a red or blue label: a price that went up, a last day to cancel within 2 weeks, and a
                warranty that ends within a month.
              </Info>
            </span>
            <label className="switch">
              <input type="checkbox" role="switch" aria-label="Only alerts" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
              <span aria-hidden="true" />
            </label>
          </span>
          <button type="button" className="primary" onClick={() => setEditing('new')}>
            <PlusIcon /> New
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {all.length === 0 ? (
        <p className="muted upcoming-empty">
          Nothing coming up yet. Once-a-year lines in the Planner and payments that repeat in Tracking show up here by
          themselves. Add your own with New.
        </p>
      ) : (
        groups.map(({ g, rows }) => <Group key={g} group={g} rows={rows} today={today} categories={categories} onOpen={setEditing} run={run} />)
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
      {editing && (
        <Editor
          event={editing === 'new' ? null : editing}
          item={editing !== 'new' && editing.itemId ? items.find((i) => i.id === editing.itemId) : undefined}
          categories={categories}
          today={today}
          onClose={() => setEditing(null)}
        />
      )}
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
  onOpen,
  run,
}: {
  group: UpcomingGroup
  rows: UpcomingEvent[]
  today: string
  categories: Category[]
  onOpen: (e: UpcomingEvent) => void
  run: ReturnType<typeof useErrorMessage>['run']
}) {
  const toPay = rows.reduce((sum, e) => sum + (e.kind === 'payment' && !e.done ? (e.cents ?? 0) : 0), 0)
  const ordered = [...rows.filter((e) => !e.done), ...rows.filter((e) => e.done)]
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
            {ordered.map((e) => (
              <Row key={e.key} e={e} today={today} categories={categories} onOpen={onOpen} run={run} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function Row({
  e,
  today,
  categories,
  onOpen,
  run,
}: {
  e: UpcomingEvent
  today: string
  categories: Category[]
  onOpen: (e: UpcomingEvent) => void
  run: ReturnType<typeof useErrorMessage>['run']
}) {
  const category = categories.find((c) => c.id === e.categoryId)
  const flag = flagOf(e, today)
  const name = e.kind === 'cancelBy' ? `Last day to cancel ${e.name}` : e.kind === 'warranty' ? `${e.name}: warranty ends` : e.name
  const detail =
    e.kind === 'cancelBy'
      ? `It renews on ${shortDate(e.renewsOn!)}`
      : e.kind === 'warranty'
        ? 'Check it still works while it’s covered'
        : e.done
          ? 'Paid this month'
          : e.source === 'tracking' && e.date < today
            ? 'Usually paid by now, not in Tracking yet'
            : e.source === 'own'
            ? REPEAT_LABELS[e.repeat]
            : SOURCE_TEXT[e.source]
  return (
    <tr
      className={`upcoming-row kind-${e.kind}${e.done ? ' done' : ''}`}
      onClick={(ev) => {
        if (!(ev.target as HTMLElement).closest('button, a, [role="menu"]')) onOpen(e)
      }}
    >
      <td className="upcoming-date">{shortDate(e.date)}</td>
      <td className="upcoming-what">
        <span className="upcoming-name">
          {e.done && <span aria-label="Paid">✓ </span>}
          {name}
        </span>
        <span className="muted small">{detail}</span>
      </td>
      <td className="upcoming-cat">{category && <span className={`category-chip ${category.block}`}>{category.name}</span>}</td>
      <td className="num upcoming-amount">{e.kind === 'payment' && e.cents !== null ? formatMoney(e.cents) : ''}</td>
      <td className="upcoming-flag">
        {flag && (
          <span
            className={`upcoming-badge ${flag}`}
            title={
              flag === 'priceUp' && e.priceUp
                ? `It was ${formatMoney(e.priceUp.from)}, now ${formatMoney(e.priceUp.to)}`
                : flag === 'cancelSoon'
                  ? 'The last day to cancel is less than 2 weeks away'
                  : 'The warranty ends within a month'
            }
          >
            {FLAG_TEXT[flag]}
          </span>
        )}
      </td>
      <td className="actions">
        <Menu label={`More for ${name}`}>
          {(close) => (
            <>
              <button type="button" role="menuitem" onClick={() => (close(), onOpen(e))}>
                <EditIcon /> {e.source === 'own' ? 'Edit…' : 'Notice and details…'}
              </button>
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

const centsText = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2).replace(/\.00$/, ''))

/** Adds or changes your own item; for something Pulse found, only its notice period, or hiding it. */
function Editor({
  event,
  item,
  categories,
  today,
  onClose,
}: {
  event: UpcomingEvent | null
  item: UpcomingItem | undefined
  categories: Category[]
  today: string
  onClose: () => void
}) {
  const own = !event || event.source === 'own'
  const [name, setName] = useState(item?.name ?? '')
  const [amount, setAmount] = useState(centsText(item?.cents ?? null))
  const [date, setDate] = useState(item?.date ?? event?.date ?? today)
  const [repeat, setRepeat] = useState<Repeat>(item?.repeat ?? 'once')
  const [categoryId, setCategoryId] = useState<string | null>(item?.categoryId ?? null)
  const [notice, setNotice] = useState(String(item?.noticeDays ?? event?.noticeDays ?? 0))
  const { error, run } = useErrorMessage()
  const canNotice = own ? repeat !== 'once' : event!.kind === 'payment' && event!.repeat !== 'once'

  const noticeField = canNotice && (
    <label className="wish-field wide">
      <span>
        Notice to cancel <Info>For a contract or subscription that renews itself: how long before it renews you have to cancel. Upcoming adds that last day as its own line.</Info>
      </span>
      <select value={notice} onChange={(e) => setNotice(e.target.value)}>
        <option value="0">None</option>
        {NOTICE_OPTIONS.map(([days, label]) => (
          <option key={days} value={days}>
            {label} before
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <Popup title={own ? (item ? `Edit ${item.name}` : 'New in Upcoming') : event!.name} onClose={onClose} className="small-dialog">
      <form
        className="wish-form"
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            if (own) {
              const text = amount.trim().replace(',', '.')
              const cents = text === '' ? null : Math.round(Number(text) * 100)
              if (cents !== null && !Number.isFinite(cents)) throw new Error('Type the amount as a number, or leave it empty.')
              await saveUpcomingItem({ name, cents, date, repeat, categoryId, noticeDays: Number(notice) || undefined }, item?.id)
            } else {
              await setUpcomingOverride(event!.sourceKey, { noticeDays: Number(notice) || undefined })
            }
            onClose()
          })
        }}
      >
        {error && <p className="error">{error}</p>}
        {own ? (
          <>
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
            {noticeField}
          </>
        ) : (
          <>
            <p className="muted small wide">
              {event!.source === 'planner'
                ? 'This comes from a once-a-year line in the Planner. Change its amount or month there.'
                : event!.source === 'tracking'
                  ? 'Pulse found this because it was paid once in each of the last two months. It follows the amount and day of the last payment.'
                  : event!.source === 'subscription'
                    ? 'This is an owned subscription in your Wishlist. It stops when you mark it as ended there.'
                    : 'This is the warranty of something you own. Change its date in the item’s timeline in the Wishlist.'}
            </p>
            {noticeField}
          </>
        )}
        <div className="wish-actions wide">
          {!own && (
            <button type="button" className="push-left" onClick={() => void run(async () => (await setUpcomingOverride(event!.sourceKey, { hidden: true }), onClose()))}>
              Hide it
            </button>
          )}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {own && !item ? 'Add' : 'Save'}
          </button>
        </div>
      </form>
    </Popup>
  )
}
