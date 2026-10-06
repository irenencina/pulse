import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import CategorySelect from '../../components/CategorySelect'
import { useErrorMessage } from '../../components/useErrorMessage'
import { setMerchantRule, updateTransaction } from '../../db/actions'
import { db } from '../../db/db'
import { learnedMerchants } from '../../domain/insights'
import { merchantKey } from '../../domain/transactions'

const SHOWN = 60

/** The category Pulse gives each shop when importing: learned from your choices, or fixed by you. */
export default function ShopCategories() {
  const transactions = useLiveQuery(() => db.transactions.toArray(), [])
  const rules = useLiveQuery(() => db.merchantRules.toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const [search, setSearch] = useState('')
  const { error, run } = useErrorMessage()
  if (!transactions || !rules || !categories) return null

  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  const all = learnedMerchants(transactions, rules)
  const list = all.filter((m) => words.every((w) => m.name.toLowerCase().includes(w))).slice(0, SHOWN)
  return (
    <div className="shop-categories">
      <input
        type="search"
        className="tool-search"
        aria-label="Search shops"
        placeholder="Search shops"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {error && <p className="error">{error}</p>}
      {list.length === 0 ? (
        <p className="muted small">{all.length === 0 ? 'Nothing learned yet. Import a statement first.' : 'No shop matches.'}</p>
      ) : (
        <table className="tool-table">
          <thead>
            <tr>
              <th>Shop</th>
              <th className="num">Seen</th>
              <th>Category</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.merchant}>
                <td>{m.name}</td>
                <td className="num muted">{m.count}×</td>
                <td>
                  <CategorySelect
                    label={`Category for ${m.name}`}
                    categories={categories}
                    value={m.categoryId}
                    placeholder="Not learned yet"
                    onChange={(choice) => void run(() => setMerchantRule(m.merchant, choice?.categoryId ?? null))}
                  />
                  {m.rule ? (
                    <span className="suggested" title="You fixed this: imports always use it">
                      fixed
                    </span>
                  ) : (
                    m.categoryId && (
                      <span className="muted small" title="Learned from the category you picked last time">
                        {' '}
                        learned
                      </span>
                    )
                  )}
                </td>
                <td className="actions">
                  {m.categoryId && m.differing > 0 && (
                    <button
                      type="button"
                      title={`Give all ${m.count} transactions of ${m.name} this category`}
                      onClick={() =>
                        void run(async () => {
                          const category = categories.find((c) => c.id === m.categoryId)
                          if (!category) return
                          for (const t of transactions) {
                            if (merchantKey(t.details) === m.merchant && t.categoryId !== category.id) {
                              await updateTransaction(t.id, { block: category.block, categoryId: category.id })
                            }
                          }
                        })
                      }
                    >
                      Apply to {m.differing} more
                    </button>
                  )}
                  {m.rule && (
                    <button
                      type="button"
                      className="link"
                      title="Go back to learning from your choices"
                      onClick={() => void run(() => setMerchantRule(m.merchant, null))}
                    >
                      Unfix
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
