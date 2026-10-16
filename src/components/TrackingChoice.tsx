import { useEffect } from 'react'
import CategorySelect from './CategorySelect'
import Info from './Info'
import SlideChoice from './SlideChoice'
import { categoryPath } from '../domain/categories'
import { formatMoney } from '../domain/money'
import { trackingMatches } from '../domain/trackingMatch'
import type { Transaction } from '../domain/transactions'
import type { Block, Category } from '../domain/types'

export type TrackingMode = 'link' | 'add' | 'none'

export interface TrackingValue {
  mode: TrackingMode
  /** "Already there": the payment in Tracking it is. */
  linkId: string | null
  /** "Add it now": the category to add it to. */
  recordIn: string | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const shortDay = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(8)}`

/**
 * Whether a purchase or sale is already in Tracking, so it's never counted twice: link the payment
 * that's there (picked for you when one matches), add it now, or leave Tracking alone.
 */
export default function TrackingChoice({
  block,
  cents,
  date,
  categories,
  transactions,
  taken,
  value,
  onChange,
  error,
}: {
  block: Extract<Block, 'expenses' | 'income'>
  cents: number | null
  date: string
  categories: Category[]
  transactions: Transaction[]
  /** Payments already linked to another wish or sale. */
  taken: Set<string>
  value: TrackingValue
  onChange: (value: TrackingValue) => void
  /** What's missing, shown right under the choice. */
  error?: string | null
}) {
  const matches = trackingMatches(transactions, { block, cents, date }, taken)
  const first = matches[0]?.id ?? null
  // Start on the payment that matches, when there is one; until you choose yourself.
  useEffect(() => {
    if (value.mode === 'link' && value.linkId && matches.some((m) => m.id === value.linkId)) return
    if (value.mode === 'link') onChange({ ...value, linkId: first })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, value.mode])

  const word = block === 'income' ? 'income' : 'expense'
  return (
    <>
      <div className="wish-field wide">
        <span>
          In Tracking{' '}
          <Info>
            So it's never counted twice. Paid by card? It's probably there already from a bank import: pick it. Paid cash? Add
            it now; if a bank import brings the same payment later, it takes this one's place.
          </Info>
        </span>
        <SlideChoice
          label="In Tracking"
          value={value.mode}
          options={[
            { value: 'link', label: 'Already there' },
            { value: 'add', label: 'Add it now' },
            { value: 'none', label: "Don't add" },
          ]}
          onChange={(mode) => onChange({ ...value, mode })}
        />
      </div>
      {error && (
        <p className="error-box wide" role="alert">
          <AlertIcon /> {error}
        </p>
      )}
      {/* Always the same height, so switching doesn't make the dialog jump. */}
      <div className="track-panel wide">
        {value.mode === 'none' && <p className="muted small">Nothing goes into Tracking. Paid by card or bank? The next bank import brings it in.</p>}
        {value.mode === 'link' &&
          (matches.length === 0 ? (
            <p className="muted small">No {word} with about this amount within two weeks of that day. Choose Add it now, or come back after the next bank import.</p>
          ) : (
            <div className="track-matches" role="radiogroup" aria-label={`The ${word} it is`}>
              {matches.map((t) => (
                <label key={t.id} className="track-match">
                  <input type="radio" name="track-match" checked={value.linkId === t.id} onChange={() => onChange({ ...value, linkId: t.id })} />
                  <span className="track-date">{shortDay(t.date)}</span>
                  <span className="track-details">
                    {t.details || '–'}
                    {t.categoryId && <span className="muted small"> · {categoryPath(categories, t.categoryId)}</span>}
                  </span>
                  <span className="num">{formatMoney(t.cents)}</span>
                </label>
              ))}
            </div>
          ))}
        {value.mode === 'add' && (
          <div className="wish-field">
            <span>{block === 'income' ? 'Income category' : 'Expense category'}</span>
            <CategorySelect
              label={block === 'income' ? 'Income category' : 'Expense category'}
              categories={categories}
              blocks={[block]}
              value={value.recordIn}
              onChange={(c) => onChange({ ...value, recordIn: c?.categoryId ?? null })}
            />
          </div>
        )}
      </div>
    </>
  )
}

/** What's missing before a choice can be saved, or null. */
export function trackingChoiceError(value: TrackingValue, block: 'expenses' | 'income'): string | null {
  if (value.mode === 'link' && !value.linkId) return `Pick the ${block === 'income' ? 'income' : 'expense'} it is, or choose Add it now or Don't add.`
  if (value.mode === 'add' && !value.recordIn) return `Pick the ${block === 'income' ? 'income' : 'expense'} category to add it to.`
  return null
}

/** A circle with an exclamation mark. */
function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5v.01" />
    </svg>
  )
}
