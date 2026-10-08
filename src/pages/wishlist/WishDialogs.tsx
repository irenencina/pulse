import { useEffect, useRef, useState, type ReactNode } from 'react'
import CategorySelect from '../../components/CategorySelect'
import Info from '../../components/Info'
import SlideChoice from '../../components/SlideChoice'
import { StarIcon } from '../../components/icons'
import TagInput from '../../components/TagInput'
import { useErrorMessage } from '../../components/useErrorMessage'
import { addTag } from '../../db/actions'
import { addWish, markBought, setOwnedStatus, updateWish, type WishInput } from '../../db/wishlist'
import { localToday } from '../../domain/lab'
import { evalAmount, formatMoney } from '../../domain/money'
import type { Category, Tag } from '../../domain/types'
import {
  addYears,
  imageSearchUrl,
  KIND_LABELS,
  ownShare,
  STATUS_LABELS,
  type OwnedStatus,
  type WishCategory,
  type WishItem,
  type WishKind,
} from '../../domain/wishlist'
import { dayLabel } from '../tracking/format'

/** A pop-up with a title bar like Settings; Esc or a click outside closes it. */
export function Popup({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = dialog.current
    if (d && !d.open) d.showModal()
  }, [])
  return (
    <dialog
      ref={dialog}
      className={`settings-dialog wish-dialog ${className}`}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current.close()
      }}
    >
      <div className="settings-frame">
        <div className="settings-head">
          <h1>{title}</h1>
          <button type="button" className="icon-button" aria-label="Close" title="Close" onClick={() => dialog.current?.close()}>
            ×
          </button>
        </div>
        <div className="wish-dialog-body">{children}</div>
      </div>
    </dialog>
  )
}

const centsText = (cents: number | null | undefined) => (cents === null || cents === undefined ? '' : (cents / 100).toFixed(2).replace(/\.00$/, ''))

/** "" is no price; anything else must read as an amount. */
function readPrice(text: string, what: string): number | null {
  if (text.trim() === '') return null
  const cents = evalAmount(text)
  if (cents === null || cents < 0) throw new Error(`Type ${what} like 120 or 89.99.`)
  return cents
}

/** What it's "bought" as, by kind. */
export const boughtWord = (kind: WishKind) => (kind === 'experience' ? 'done' : kind === 'subscription' ? 'started' : 'bought')

/** Add or edit a wish, or (with owned) something you already have. */
export function WishEditor({
  wish,
  owned,
  wishCategories,
  categories,
  tags,
  brands,
  onClose,
}: {
  wish: WishItem | null
  /** Adding straight to Owned. */
  owned: boolean
  wishCategories: WishCategory[]
  categories: Category[]
  tags: Tag[]
  brands: string[]
  onClose: () => void
}) {
  const isOwned = wish?.owned ?? owned
  const [name, setName] = useState(wish?.name ?? '')
  const [kind, setKind] = useState<WishKind>(wish?.kind ?? 'item')
  const [price, setPrice] = useState(centsText(wish?.priceCents))
  const [url, setUrl] = useState(wish?.url ?? '')
  const [imageUrl, setImageUrl] = useState(wish?.imageUrl?.startsWith('data:') ? '' : (wish?.imageUrl ?? ''))
  const [brand, setBrand] = useState(wish?.brand ?? '')
  const [cats, setCats] = useState<string[]>(wish?.categoryIds ?? [])
  const [tagNames, setTagNames] = useState<string[]>(() => (wish?.tagIds ?? []).map((id) => tags.find((t) => t.id === id)?.name).filter((n) => n !== undefined))
  const [paidFrom, setPaidFrom] = useState<string | null>(wish?.paidFrom ?? null)
  const [desired, setDesired] = useState(wish?.desired ?? false)
  const [purchasedOn, setPurchasedOn] = useState(wish?.purchasedOn ?? (isOwned ? localToday() : ''))
  const [paid, setPaid] = useState(centsText(wish?.paidCents))
  const [giftShare, setGiftShare] = useState(String(wish?.giftShare ?? 0))
  const [status, setStatus] = useState<OwnedStatus>(wish?.status ?? 'inUse')
  const { error, run } = useErrorMessage()

  const save = () =>
    run(async () => {
      const tagIds: string[] = []
      for (const t of tagNames) tagIds.push(await addTag(t))
      const share = Number(giftShare || 0)
      if (!Number.isFinite(share) || share < 0 || share > 100) throw new Error('The gift share goes from 0 to 100%.')
      const input: WishInput = {
        name,
        kind,
        priceCents: readPrice(price, 'the price'),
        url,
        // A picture dropped on the card stays unless a link replaces it.
        imageUrl: imageUrl || (wish?.imageUrl?.startsWith('data:') ? wish.imageUrl : ''),
        brand,
        categoryIds: cats,
        tagIds,
        paidFrom: paidFrom ?? undefined,
        desired,
      }
      if (isOwned) {
        input.owned = true
        input.purchasedOn = purchasedOn || undefined
        input.paidCents = readPrice(paid, 'the price paid') ?? undefined
        input.giftShare = share
        input.status = status
      }
      if (wish) await updateWish(wish.id, input)
      else await addWish(input)
      onClose()
    })

  const what = KIND_LABELS[kind].toLowerCase()
  return (
    <Popup title={wish ? `Edit ${wish.name}` : isOwned ? 'Add something you own' : 'Add a wish'} onClose={onClose}>
      <form
        className="wish-form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {error && <p className="error">{error}</p>}
        <div className="wish-field wide">
          <label htmlFor="wish-name">Full model name</label>
          <div className="name-row">
            <input id="wish-name" autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="What is it?" />
            <button
              type="button"
              className={`star${desired ? ' on' : ''}`}
              aria-pressed={desired}
              aria-label="Most desired"
              title={desired ? 'Most desired: click to unstar' : 'Star as most desired'}
              onClick={() => setDesired(!desired)}
            >
              <StarIcon />
            </button>
          </div>
        </div>
        <div className="wish-field wide">
          <span>
            Kind{' '}
            <Info>
              An item becomes something you own once bought, an experience (a trip, a course) is marked as done, and a
              subscription is a monthly cost.
            </Info>
          </span>
          <SlideChoice
            label="Kind"
            value={kind}
            options={(Object.keys(KIND_LABELS) as WishKind[]).map((k) => ({ value: k, label: KIND_LABELS[k] }))}
            onChange={setKind}
          />
        </div>
        <label className="wish-field">
          <span>{kind === 'subscription' ? 'Price per month' : isOwned ? 'Price when added' : 'Price'}</span>
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
        </label>
        <label className="wish-field">
          <span>Brand</span>
          <input list="wish-brands" value={brand} onChange={(e) => setBrand(e.target.value)} />
          <datalist id="wish-brands">
            {brands.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </label>
        <label className="wish-field wide">
          <span>Link</span>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </label>
        <div className="wish-field wide">
          <span>
            Picture{' '}
            <Info>
              Paste a picture's address here, or drag a picture from a web page (or a file) onto the card. Find image opens a
              web image search for it in a new tab.
            </Info>
          </span>
          <span className="field-pair">
            <input
              type="url"
              aria-label="Picture link"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder={wish?.imageUrl?.startsWith('data:') ? 'Picture dropped on the card' : 'https://…'}
            />
            <a className="button" href={imageSearchUrl({ name: name || 'item', brand })} target="_blank" rel="noreferrer">
              Find image
            </a>
          </span>
        </div>
        <div className="wish-field wide">
          <span>Categories</span>
          <div className="chip-choices" role="group" aria-label="Categories">
            {wishCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                className="chip-toggle"
                aria-pressed={cats.includes(c.id)}
                onClick={() => setCats(cats.includes(c.id) ? cats.filter((x) => x !== c.id) : [...cats, c.id])}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="wish-field">
          <span>Tags</span>
          <TagInput label="Tags" value={tagNames} onChange={setTagNames} tags={tags} />
        </div>
        <div className="wish-field">
          <span>
            Paid from <Info>The budget category it will be paid from, savings included. Marking it as bought adds it to Tracking there.</Info>
          </span>
          <CategorySelect
            label="Paid from"
            categories={categories}
            blocks={['expenses', 'savings']}
            value={paidFrom}
            placeholder="Not decided"
            onChange={(c) => setPaidFrom(c?.categoryId ?? null)}
          />
        </div>
        {isOwned && (
          <fieldset className="wish-owned-fields wide">
            <legend>Owned</legend>
            <label className="wish-field">
              <span>{kind === 'experience' ? 'Done on' : 'Bought on'}</span>
              <input type="date" value={purchasedOn} onChange={(e) => setPurchasedOn(e.target.value)} />
            </label>
            <label className="wish-field">
              <span>Price paid</span>
              <input inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="Same as the price" />
            </label>
            <label className="wish-field">
              <span>
                Gift share <Info>The part of the price that was a present, in %. Only the rest counts as what you spent. Who gave it isn't kept.</Info>
              </span>
              <span className="field-pair">
                <input className="percent" type="number" min={0} max={100} value={giftShare} onChange={(e) => setGiftShare(e.target.value)} /> %
              </span>
            </label>
            <label className="wish-field">
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as OwnedStatus)}>
                {(Object.keys(STATUS_LABELS) as OwnedStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        )}
        <div className="wish-actions wide">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!name.trim()}>
            {wish ? 'Save' : `Add ${isOwned ? '' : 'the '}${isOwned ? what : 'wish'}`}
          </button>
        </div>
      </form>
    </Popup>
  )
}

/** Moves a wish to Owned, with what it cost; your part is added to Tracking. */
export function MarkBought({ wish, categories, onClose }: { wish: WishItem; categories: Category[]; onClose: () => void }) {
  const from = categories.find((c) => c.id === wish.paidFrom)
  const [date, setDate] = useState(localToday())
  const [paid, setPaid] = useState(centsText(wish.priceCents))
  const [giftShare, setGiftShare] = useState('0')
  // Spending is recorded in an expense category; one paid from savings asks which expense it counts as.
  const [recordIn, setRecordIn] = useState<string | null>(from?.block === 'expenses' ? from.id : null)
  const [record, setRecord] = useState(true)
  // Things come with a warranty (2 years is the EU minimum); experiences and subscriptions don't.
  const [warranty, setWarranty] = useState<string>(wish.kind === 'item' ? '2' : 'none')
  const [warrantyDate, setWarrantyDate] = useState('')
  const { error, run } = useErrorMessage()
  const word = boughtWord(wish.kind)
  const warrantyUntil = warranty === 'none' ? undefined : warranty === 'date' ? warrantyDate || undefined : addYears(date, Number(warranty))
  let preview: number | null = null
  try {
    const cents = readPrice(paid, 'the price')
    const share = Number(giftShare || 0)
    if (cents !== null && share >= 0 && share <= 100) preview = ownShare(cents, share)
  } catch {
    preview = null
  }

  return (
    <Popup title={`Mark ${wish.name} as ${word}`} onClose={onClose} className="small-dialog">
      <form
        className="wish-form"
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            const share = Number(giftShare || 0)
            if (!Number.isFinite(share) || share < 0 || share > 100) throw new Error('The gift share goes from 0 to 100%.')
            const cents = readPrice(paid, 'the price paid')
            if (cents === null) throw new Error('Type what it cost, or 0.')
            if (record && cents > 0 && share < 100 && !recordIn) throw new Error('Pick the expense category to add it to, or untick “Add to Tracking”.')
            if (warranty === 'date' && !warrantyDate) throw new Error('Pick the day the warranty ends, or choose No warranty.')
            await markBought(wish.id, { date, paidCents: cents, giftShare: share, recordIn: record ? recordIn : null, ...(warrantyUntil ? { warrantyUntil } : {}) })
            onClose()
          })
        }}
      >
        {error && <p className="error">{error}</p>}
        <label className="wish-field">
          <span>{word === 'done' ? 'Done on' : word === 'started' ? 'Started on' : 'Bought on'}</span>
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="wish-field">
          <span>Price paid</span>
          <input inputMode="decimal" autoFocus value={paid} onChange={(e) => setPaid(e.target.value)} />
        </label>
        <label className="wish-field">
          <span>
            Gift share <Info>The part that was a present, in %. Only the rest counts as your spending. Who gave it isn't kept.</Info>
          </span>
          <span className="field-pair">
            <input className="percent" type="number" min={0} max={100} value={giftShare} onChange={(e) => setGiftShare(e.target.value)} /> %
          </span>
        </label>
        <label className="wish-field">
          <span>Your part</span>
          <output>{preview === null ? '–' : formatMoney(preview)}</output>
        </label>
        {wish.kind === 'item' && (
          <div className="wish-field wide">
            <span>
              Warranty{' '}
              <Info>
                How long this copy is covered. Upcoming reminds you a month before it ends, so you can check it still works.
                New things bought in the EU have at least 2 years.
              </Info>
            </span>
            <span className="field-pair">
              <select aria-label="Warranty" value={warranty} onChange={(e) => setWarranty(e.target.value)}>
                <option value="none">No warranty</option>
                <option value="1">1 year</option>
                <option value="2">2 years</option>
                <option value="3">3 years</option>
                <option value="5">5 years</option>
                <option value="date">Until a date…</option>
              </select>
              {warranty === 'date' ? (
                <input type="date" aria-label="Warranty ends on" min={date} value={warrantyDate} onChange={(e) => setWarrantyDate(e.target.value)} />
              ) : (
                warrantyUntil && <span className="muted small">until {dayLabel(warrantyUntil)} {warrantyUntil.slice(0, 4)}</span>
              )}
            </span>
          </div>
        )}
        <label className="wish-field wide check">
          <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} />
          <span>Add your part to Tracking as an expense</span>
        </label>
        {record && (
          <div className="wish-field wide">
            <span>
              Expense category{' '}
              {from?.block === 'savings' && (
                <Info>
                  It's planned from {from.name} (savings). Pick the expense it counts as, so the month's spending shows it. Taking
                  money out of a savings fund isn't tracked separately yet.
                </Info>
              )}
            </span>
            <CategorySelect label="Expense category" categories={categories} blocks={['expenses']} value={recordIn} onChange={(c) => setRecordIn(c?.categoryId ?? null)} />
          </div>
        )}
        <div className="wish-actions wide">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Mark as {word}
          </button>
        </div>
      </form>
    </Popup>
  )
}

const END_QUESTION: Record<Exclude<OwnedStatus, 'inUse'>, string> = {
  broken: 'When did it break?',
  lost: 'When did you lose it?',
  sold: 'When did you sell it?',
}

/** Broken, lost or sold: asks the day it happened, today filled in. */
export function EndDate({
  wish,
  status,
  archives,
  onClose,
}: {
  wish: WishItem
  status: Exclude<OwnedStatus, 'inUse'>
  /** Whether it will move to Archived. */
  archives: boolean
  onClose: () => void
}) {
  const [date, setDate] = useState(localToday())
  const { error, run } = useErrorMessage()
  return (
    <Popup title={`${wish.name}: ${STATUS_LABELS[status].toLowerCase()}`} onClose={onClose} className="small-dialog">
      <form
        className="wish-form"
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            await setOwnedStatus(wish.id, status, date)
            onClose()
          })
        }}
      >
        {error && <p className="error">{error}</p>}
        <label className="wish-field wide">
          <span>{END_QUESTION[status]}</span>
          <input type="date" required autoFocus value={date} max={localToday()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <p className="muted small wide">
          It goes into its timeline{archives ? ' and moves to Archived' : ''}. If you buy the same model again, the next copy starts its own line.
        </p>
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
