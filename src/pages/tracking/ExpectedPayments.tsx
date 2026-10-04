import Info from '../../components/Info'
import { addTransaction, skipExpected } from '../../db/actions'
import { categoryPath } from '../../domain/categories'
import type { MonthKey } from '../../domain/periods'
import type { Expected } from '../../domain/recurring'
import type { Category } from '../../domain/types'
import { dayLabel, signedAmount } from './format'

interface Props {
  expected: Expected[]
  month: MonthKey
  categories: Category[]
  run: (action: () => Promise<unknown>) => Promise<boolean>
}

/** Monthly payments that haven't shown up yet this month, ready to add with one click. */
export default function ExpectedPayments({ expected, month, categories, run }: Props) {
  if (expected.length === 0) return null
  return (
    <div className="expected">
      <h3>
        Usually paid every month{' '}
        <Info>
          Payments that came once in each of the last two months, with about the same amount, and not yet this month.
          Add adds it with last month's amount and day; you can change both in the list afterwards. Skip hides it
          until next month. If you import your Revolut statement instead, the bank row takes the place of one you
          added here.
        </Info>
      </h3>
      <ul>
        {expected.map((e) => (
          <li key={e.key} className={`block-${e.block}`}>
            <span className="date">{dayLabel(e.date)}</span>
            <span className="expected-what">
              {e.details || categoryPath(categories, e.categoryId)}
              {e.details && <span className="muted small"> · {categoryPath(categories, e.categoryId)}</span>}
            </span>
            <span className={`num amount${e.block === 'income' ? ' in' : ''}`}>{signedAmount(e.cents, e.block)}</span>
            <button
              type="button"
              aria-label={`Add ${e.details || 'this payment'}`}
              title="Add it with this amount and date"
              onClick={() =>
                void run(() =>
                  addTransaction({ date: e.date, block: e.block, categoryId: e.categoryId, cents: e.cents, details: e.details }),
                )
              }
            >
              Add
            </button>
            <button
              type="button"
              className="link"
              aria-label={`Skip ${e.details || 'this payment'} this month`}
              title="Hide it until next month"
              onClick={() => void run(() => skipExpected(e.key, month))}
            >
              Skip
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
