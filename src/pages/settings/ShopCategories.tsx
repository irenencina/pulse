import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import CategorySelect from '../../components/CategorySelect'
import ConfirmButton from '../../components/ConfirmButton'
import Info from '../../components/Info'
import Menu from '../../components/Menu'
import NumberStepper from '../../components/NumberStepper'
import { BlockIcon, DoneIcon, PlusIcon, RestoreIcon, TrashIcon } from '../../components/icons'
import { useErrorMessage } from '../../components/useErrorMessage'
import { addPatternRule, forgetMerchant, getSettings, setMerchantBlocked, setMerchantRule, updateSettings, updateTransaction } from '../../db/actions'
import { db } from '../../db/db'
import { learnedMerchants, patternRules, type LearnedMerchant } from '../../domain/insights'
import { matchesPattern, merchantKey, type Transaction } from '../../domain/transactions'
import type { Category } from '../../domain/types'

const SHOWN = 60
const USES_MAX = 10

/** Category rules: the category Pulse gives each shop when importing, learned from your choices, fixed, or from a rule you added. */
export default function ShopCategories() {
  const transactions = useLiveQuery(() => db.transactions.toArray(), [])
  const rules = useLiveQuery(() => db.merchantRules.toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const settings = useLiveQuery(() => getSettings(), [])
  const [search, setSearch] = useState('')
  const { error, run } = useErrorMessage()
  if (!transactions || !rules || !categories || !settings) return null

  const minUses = settings.ruleMinUses
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  const all = learnedMerchants(transactions, rules, minUses)
  const list = all.filter((m) => words.every((w) => m.name.toLowerCase().includes(w))).slice(0, SHOWN)
  return (
    <div className="shop-categories">
      {error && <p className="error">{error}</p>}
      <div className="field">
        <span className="field-label">
          Save a learned rule after{' '}
          <Info>
            How many times you need to pick the same category for a shop before Pulse saves it as a rule and offers it on
            imports. Until then the shop shows “Needs more uses” and its category is greyed out. With 1, Pulse learns
            straight away.
          </Info>
        </span>
        <span className="field-control">
          <NumberStepper
            label="Uses before a rule is saved"
            value={minUses}
            min={1}
            max={USES_MAX}
            unit={['use', 'uses']}
            onChange={(n) => void run(() => updateSettings({ ruleMinUses: n }))}
          />
        </span>
      </div>

      <YourRules transactions={transactions} categories={categories} rules={patternRules(transactions, rules)} run={run} />

      <h3 className="plugin-section-title">
        Shops{' '}
        <Info>
          <b>Fixed</b>: you picked it here, so imports always use it. <b>Your rule</b>: one of your rules above covers it.{' '}
          <b>Learned</b>: the category you picked last time. <b>Needs more uses</b>: not picked often enough yet to be offered.{' '}
          <b>Blocked</b>: you asked Pulse never to suggest a category for it.
        </Info>
      </h3>
      <input
        type="search"
        className="tool-search"
        aria-label="Search shops"
        placeholder="Search shops"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {list.length === 0 ? (
        <p className="muted small">{all.length === 0 ? 'Nothing learned yet. Import a statement first.' : 'No shop matches.'}</p>
      ) : (
        <table className="tool-table rule-table">
          <thead>
            <tr>
              <th>Shop</th>
              <th className="num">Seen</th>
              <th>Category</th>
              <th className="status">Status</th>
              <th aria-label="More" />
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.merchant} className={m.status === 'blocked' ? 'blocked' : undefined}>
                <td>{m.name}</td>
                <td className="num muted">{m.count}×</td>
                <td>
                  <CategorySelect
                    label={`Category for ${m.name}`}
                    categories={categories}
                    value={m.categoryId}
                    disabled={m.status === 'blocked'}
                    className={m.status === 'tooFew' ? 'waiting' : undefined}
                    placeholder={m.status === 'blocked' ? 'Never suggested' : 'Not learned yet'}
                    onChange={(choice) => void run(() => setMerchantRule(m.merchant, choice?.categoryId ?? null))}
                  />
                </td>
                <td className="status">
                  <StatusBadge m={m} minUses={minUses} />
                </td>
                <td className="actions">
                  <Menu label={`More for ${m.name}`}>
                    {(close) => (
                      <>
                        {m.categoryId && m.status !== 'tooFew' && m.differing > 0 && (
                          <button
                            type="button"
                            role="menuitem"
                            title={`Give all ${m.count} transactions of ${m.name} this category`}
                            onClick={() => {
                              close()
                              void run(async () => {
                                const category = categories.find((c) => c.id === m.categoryId)
                                if (!category) return
                                for (const t of transactions) {
                                  if (merchantKey(t.details) === m.merchant && t.categoryId !== category.id) {
                                    await updateTransaction(t.id, { block: category.block, categoryId: category.id })
                                  }
                                }
                              })
                            }}
                          >
                            <DoneIcon /> Apply to {m.differing} more
                          </button>
                        )}
                        {m.rule && (
                          <button
                            type="button"
                            role="menuitem"
                            title="Go back to learning from the category you pick each time"
                            onClick={() => (close(), void run(() => setMerchantRule(m.merchant, null)))}
                          >
                            <RestoreIcon /> Learn again instead
                          </button>
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          title={
                            m.status === 'blocked'
                              ? `Let imports suggest a category for ${m.name} again`
                              : `Imports never suggest a category for ${m.name}: you pick one each time`
                          }
                          onClick={() => (close(), void run(() => setMerchantBlocked(m.merchant, m.status !== 'blocked')))}
                        >
                          {m.status === 'blocked' ? (
                            <>
                              <RestoreIcon /> Unblock
                            </>
                          ) : (
                            <>
                              <BlockIcon /> Never suggest
                            </>
                          )}
                        </button>
                        {m.status !== 'blocked' && (
                          <ConfirmButton
                            label={
                              <>
                                <TrashIcon /> Delete rule
                              </>
                            }
                            title={`Forget ${m.name}: imports stop suggesting a category for it until you pick one again. Its transactions keep their categories.`}
                            confirmLabel="Sure? Click again to delete"
                            onConfirm={() => (close(), void run(() => forgetMerchant(m.merchant)))}
                          />
                        )}
                      </>
                    )}
                  </Menu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function StatusBadge({ m, minUses }: { m: LearnedMerchant; minUses: number }) {
  switch (m.status) {
    case 'fixed':
      return (
        <span className="rule-badge fixed" title="You picked it here: imports always use it">
          Fixed
        </span>
      )
    case 'pattern':
      return (
        <span className="rule-badge pattern" title={`Your rule: details contain “${m.pattern}”`}>
          Your rule
        </span>
      )
    case 'learned':
      return (
        <span className="rule-badge learned" title="The category you picked last time">
          Learned
        </span>
      )
    case 'tooFew': {
      const more = minUses - m.count
      return (
        <span className="rule-badge waiting" title={`Offered once you have picked it ${minUses} times (see the setting above)`}>
          Needs {more} more {more === 1 ? 'use' : 'uses'}
        </span>
      )
    }
    case 'blocked':
      return (
        <span className="rule-badge blocked" title="You asked Pulse never to suggest a category for this shop">
          <BlockIcon /> Blocked
        </span>
      )
    default:
      return <span className="muted small">None yet</span>
  }
}

/** Rules you write yourself: “details contain …” gets a category. */
function YourRules({
  transactions,
  categories,
  rules,
  run,
}: {
  transactions: Transaction[]
  categories: Category[]
  rules: ReturnType<typeof patternRules>
  run: ReturnType<typeof useErrorMessage>['run']
}) {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const clean = text.trim()
  const matches = clean.length >= 2 ? transactions.filter((t) => matchesPattern(t.details, clean)).length : 0
  const reset = () => (setText(''), setCategoryId(null), setAdding(false))

  return (
    <>
      <h3 className="plugin-section-title">
        Your rules{' '}
        <Info>
          Give a category to every transaction whose details contain some text, like “Spotify” or “parking”. They come
          before what Pulse learned, but a shop you fixed below wins. A rule needs at least one of your transactions to
          match, so you can see it works.
        </Info>
      </h3>
      {rules.length > 0 && (
        <table className="tool-table rule-table">
          <thead>
            <tr>
              <th>Details contain</th>
              <th className="num">Matches</th>
              <th>Category</th>
              <th aria-label="More" />
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.key}>
                <td>“{r.text}”</td>
                <td className="num muted">{r.matches}×</td>
                <td>
                  <CategorySelect
                    label={`Category for “${r.text}”`}
                    categories={categories}
                    value={r.categoryId}
                    onChange={(choice) => choice && void run(() => addPatternRule(r.text, choice.categoryId))}
                  />
                </td>
                <td className="actions">
                  <Menu label={`More for “${r.text}”`}>
                    {(close) => (
                      <ConfirmButton
                        label={
                          <>
                            <TrashIcon /> Delete rule
                          </>
                        }
                        title="Delete this rule. Transactions keep their categories."
                        confirmLabel="Sure? Click again to delete"
                        onConfirm={() => (close(), void run(() => db.merchantRules.delete(r.key)))}
                      />
                    )}
                  </Menu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {adding ? (
        <form
          className="add-row rule-form"
          onSubmit={async (e) => {
            e.preventDefault()
            if (categoryId && (await run(() => addPatternRule(clean, categoryId)))) reset()
          }}
          onKeyDown={(e) => e.key === 'Escape' && reset()}
        >
          <input autoFocus placeholder="Details contain…" aria-label="Details contain" value={text} onChange={(e) => setText(e.target.value)} />
          <CategorySelect label="Category for the new rule" categories={categories} value={categoryId} onChange={(c) => setCategoryId(c?.categoryId ?? null)} />
          <span className={`muted small rule-matches${clean.length >= 2 && matches === 0 ? ' none' : ''}`} aria-live="polite">
            {clean.length < 2 ? 'Type at least 2 letters' : matches === 0 ? 'No transaction matches' : `Matches ${matches} ${matches === 1 ? 'transaction' : 'transactions'}`}
          </span>
          <button
            type="submit"
            className="primary icon-add"
            title={matches === 0 ? 'Needs at least one matching transaction' : !categoryId ? 'Pick a category first' : 'Add rule'}
            aria-label="Add rule"
            disabled={matches === 0 || !categoryId}
          >
            <PlusIcon />
          </button>
        </form>
      ) : (
        <button type="button" className="ghost-add" onClick={() => setAdding(true)}>
          <PlusIcon /> New rule
        </button>
      )}
    </>
  )
}
