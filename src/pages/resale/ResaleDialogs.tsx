import { useState } from 'react'
import CategorySelect from '../../components/CategorySelect'
import DateInput from '../../components/DateInput'
import Info from '../../components/Info'
import TagInput from '../../components/TagInput'
import { useErrorMessage } from '../../components/useErrorMessage'
import { addTag } from '../../db/actions'
import { addResale, markGiven, markSold, updateResale, type ResaleInput } from '../../db/resale'
import { localToday } from '../../domain/lab'
import { evalAmount } from '../../domain/money'
import { RESALE_STATUS_LABELS, SELLING, type ResaleItem, type ResaleStatus } from '../../domain/resale'
import type { Category, Tag } from '../../domain/types'
import { imageSearchUrl } from '../../domain/wishlist'
import { Popup } from '../wishlist/WishDialogs'

const centsText = (cents: number | null | undefined) => (cents === null || cents === undefined ? '' : (cents / 100).toFixed(2).replace(/\.00$/, ''))

/** "" is no price; anything else must read as an amount. */
function readPrice(text: string, what: string): number | null {
  if (text.trim() === '') return null
  const cents = evalAmount(text)
  if (cents === null || cents < 0) throw new Error(`Type ${what} like 40 or 12.50.`)
  return cents
}

/** Add or edit something to sell. */
export function ResaleEditor({
  item,
  sites,
  tags,
  brands,
  onClose,
}: {
  item: ResaleItem | null
  /** The sites from Settings → Plug-ins, plus any this item already uses. */
  sites: string[]
  tags: Tag[]
  brands: string[]
  onClose: () => void
}) {
  const [name, setName] = useState(item?.name ?? '')
  const [brand, setBrand] = useState(item?.brand ?? '')
  const [asking, setAsking] = useState(centsText(item?.askingCents))
  const [lowest, setLowest] = useState(centsText(item?.lowestCents))
  const [paid, setPaid] = useState(centsText(item?.paidCents))
  const [picked, setPicked] = useState<string[]>(item?.sites ?? [])
  const [status, setStatus] = useState<ResaleStatus>(item?.status ?? 'toPost')
  const [postedOn, setPostedOn] = useState(item?.postedOn ?? localToday())
  const [pickupOn, setPickupOn] = useState(item?.pickupOn ?? '')
  const [url, setUrl] = useState(item?.url ?? '')
  const [imageUrl, setImageUrl] = useState(item?.imageUrl?.startsWith('data:') ? '' : (item?.imageUrl ?? ''))
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [tagNames, setTagNames] = useState<string[]>(() => (item?.tagIds ?? []).map((id) => tags.find((t) => t.id === id)?.name).filter((n) => n !== undefined))
  const { error, run } = useErrorMessage()
  const selling = !item || SELLING.includes(item.status)
  const allSites = [...new Set([...sites, ...picked])]

  const save = () =>
    run(async () => {
      const tagIds: string[] = []
      for (const t of tagNames) tagIds.push(await addTag(t))
      const lowestCents = readPrice(lowest, 'the lowest price')
      const paidCents = readPrice(paid, 'what it cost')
      const input: ResaleInput = {
        name,
        brand,
        askingCents: readPrice(asking, 'the price'),
        lowestCents: lowestCents ?? undefined,
        paidCents: paidCents ?? undefined,
        sites: picked,
        url,
        // A picture dropped on the card stays unless a link replaces it.
        imageUrl: imageUrl || (item?.imageUrl?.startsWith('data:') ? item.imageUrl : ''),
        notes,
        tagIds,
      }
      if (selling) {
        input.status = status
        if (status !== 'toPost') input.postedOn = postedOn || localToday()
        input.pickupOn = status === 'reserved' ? pickupOn : ''
      }
      if (item) await updateResale(item.id, input)
      else await addResale(input)
      onClose()
    })

  return (
    <Popup title={item ? `Edit ${item.name}` : 'Add something to sell'} onClose={onClose}>
      <form
        className="wish-form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {error && <p className="error">{error}</p>}
        <label className="wish-field wide">
          <span>What is it?</span>
          <input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="Name and model" />
        </label>
        <label className="wish-field">
          <span>Asking price</span>
          <input inputMode="decimal" value={asking} onChange={(e) => setAsking(e.target.value)} placeholder="Not decided" />
        </label>
        <label className="wish-field">
          <span>
            Lowest you'd take <Info>Only for you: the least you'd accept when someone haggles. Never shown to anyone else.</Info>
          </span>
          <input inputMode="decimal" value={lowest} onChange={(e) => setLowest(e.target.value)} placeholder="Optional" />
        </label>
        <label className="wish-field">
          <span>Brand</span>
          <input list="resale-brands" value={brand} onChange={(e) => setBrand(e.target.value)} />
          <datalist id="resale-brands">
            {brands.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </label>
        <label className="wish-field">
          <span>
            What it cost you <Info>For comparing with what you get for it. Filled in when it comes from your Wishlist.</Info>
          </span>
          <input inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="Optional" />
        </label>
        <div className="wish-field wide">
          <span>
            Posted on <Info>The sites it's listed on. Change the list of sites in Settings → Plug-ins → Resale.</Info>
          </span>
          <div className="chip-choices" role="group" aria-label="Posted on">
            {allSites.map((s) => (
              <button
                key={s}
                type="button"
                className="chip-toggle"
                aria-pressed={picked.includes(s)}
                onClick={() => {
                  const next = picked.includes(s) ? picked.filter((x) => x !== s) : [...picked, s]
                  setPicked(next)
                  // Ticking a site means it's up there.
                  if (next.length > 0 && status === 'toPost') setStatus('posted')
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        {selling && (
          <>
            <label className="wish-field">
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as ResaleStatus)}>
                {SELLING.map((s) => (
                  <option key={s} value={s}>
                    {RESALE_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <div className="wish-field">
              <span>
                Pick-up <Info>The day the buyer comes for it. It shows in Upcoming, and picking a day marks it as reserved.</Info>
              </span>
              <DateInput
                label="Pick-up"
                value={pickupOn}
                placeholder="Not arranged"
                onChange={(d) => {
                  setPickupOn(d)
                  if (d) setStatus('reserved')
                }}
              />
            </div>
            {status !== 'toPost' && (
              <div className="wish-field">
                <span>
                  First posted <Info>Upcoming suggests a lower price after a month without a buyer, counted from this day or the last time you lowered it.</Info>
                </span>
                <DateInput label="First posted" max={localToday()} value={postedOn} onChange={setPostedOn} />
              </div>
            )}
          </>
        )}
        <label className="wish-field wide">
          <span>Listing link</span>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </label>
        <div className="wish-field wide">
          <span>
            Picture <Info>Paste a picture's address here, or drag a picture (or a file) onto the card.</Info>
          </span>
          <span className="field-pair">
            <input
              type="url"
              aria-label="Picture link"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder={item?.imageUrl?.startsWith('data:') ? 'Picture dropped on the card' : 'https://…'}
            />
            <a className="button" href={imageSearchUrl({ name: name || 'item', brand })} target="_blank" rel="noreferrer">
              Find image
            </a>
          </span>
        </div>
        <div className="wish-field">
          <span>Tags</span>
          <TagInput label="Tags" value={tagNames} onChange={setTagNames} tags={tags} />
        </div>
        <label className="wish-field">
          <span>Notes</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condition, who's interested…" />
        </label>
        <div className="wish-actions wide">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!name.trim()}>
            {item ? 'Save' : 'Add it'}
          </button>
        </div>
      </form>
    </Popup>
  )
}

/** Sold: what it went for, added to Tracking as income. */
export function MarkSold({
  item,
  categories,
  lastCategory,
  fromWishlist,
  onClose,
}: {
  item: ResaleItem
  categories: Category[]
  /** The income category the last sale went to. */
  lastCategory?: string
  /** The name of the owned thing on the Wishlist it came from. */
  fromWishlist?: string
  onClose: () => void
}) {
  const income = categories.filter((c) => c.block === 'income' && !c.archived)
  const [date, setDate] = useState(localToday())
  const [price, setPrice] = useState(centsText(item.askingCents))
  const [record, setRecord] = useState(true)
  const [recordIn, setRecordIn] = useState<string | null>(income.find((c) => c.id === lastCategory)?.id ?? income.find((c) => c.parentId === null && /other/i.test(c.name))?.id ?? null)
  const { error, run } = useErrorMessage()
  return (
    <Popup title={`Sold ${item.name}`} onClose={onClose} className="small-dialog">
      <form
        className="wish-form"
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            const cents = readPrice(price, 'what it sold for')
            if (cents === null) throw new Error('Type what it sold for, or 0.')
            if (record && cents > 0 && !recordIn) throw new Error('Pick the income category to add it to, or untick “Add to Tracking”.')
            await markSold(item.id, { date, cents, recordIn: record ? recordIn : null })
            onClose()
          })
        }}
      >
        {error && <p className="error">{error}</p>}
        <label className="wish-field">
          <span>Sold on</span>
          <DateInput required value={date} onChange={setDate} />
        </label>
        <label className="wish-field">
          <span>Sold for</span>
          <input inputMode="decimal" autoFocus value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="wish-field wide check">
          <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} />
          <span>Add the money to Tracking as income</span>
        </label>
        {record && (
          <div className="wish-field wide">
            <span>Income category</span>
            <CategorySelect label="Income category" categories={categories} blocks={['income']} value={recordIn} onChange={(c) => setRecordIn(c?.categoryId ?? null)} />
          </div>
        )}
        {fromWishlist && <p className="muted small wide">{fromWishlist} is marked as sold in your Wishlist too.</p>}
        <div className="wish-actions wide">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Mark as sold
          </button>
        </div>
      </form>
    </Popup>
  )
}

/** Given away: only the day it went. */
export function MarkGiven({ item, fromWishlist, onClose }: { item: ResaleItem; fromWishlist?: string; onClose: () => void }) {
  const [date, setDate] = useState(localToday())
  const { error, run } = useErrorMessage()
  return (
    <Popup title={`Gave away ${item.name}`} onClose={onClose} className="small-dialog">
      <form
        className="wish-form"
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            await markGiven(item.id, date)
            onClose()
          })
        }}
      >
        {error && <p className="error">{error}</p>}
        <label className="wish-field wide">
          <span>When did it go?</span>
          <DateInput required value={date} onChange={setDate} />
        </label>
        {fromWishlist && <p className="muted small wide">{fromWishlist} is marked as given away in your Wishlist too.</p>}
        <div className="wish-actions wide">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Given away
          </button>
        </div>
      </form>
    </Popup>
  )
}
