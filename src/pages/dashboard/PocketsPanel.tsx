import { useLiveQuery } from 'dexie-react-hooks'
import Info from '../../components/Info'
import PocketBar from '../../components/PocketBar'
import { db } from '../../db/db'
import type { BudgetCell } from '../../domain/budget'
import type { MonthKey } from '../../domain/periods'
import { pocketBudgets, type PocketBudget } from '../../domain/pocketBudgets'
import type { Transaction } from '../../domain/transactions'
import type { Category, Settings } from '../../domain/types'
import { pocketColour } from '../../domain/worth'
import { monthLabel, plainAmount } from '../tracking/format'

/**
 * Each Revolut pocket against its budget: what its categories planned, what was tracked in them
 * (from any account) and, for pockets whose leftovers carry over, last month's leftover on top.
 */
export default function PocketsPanel({
  categories,
  cells,
  transactions,
  settings,
  month,
}: {
  categories: Category[]
  cells: BudgetCell[]
  transactions: Transaction[]
  settings: Settings
  month: MonthKey
}) {
  const pockets = useLiveQuery(() => db.pockets.toArray(), [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [])
  if (!pockets || !accounts || pockets.length === 0) return null
  const rows = pocketBudgets(pockets, categories, cells, transactions, settings, month, accounts)
  if (rows.every((r) => r.budgetCents === 0 && r.spentCents === 0)) return null
  const name = (id: string) => categories.find((c) => c.id === id)?.name ?? ''
  return (
    <section className="dash-panel pocket-check">
      <h2>
        Pockets in {monthLabel(month)}{' '}
        <Info>
          Each Revolut pocket against its budget. Budget: what the categories it pays for planned this month. Tracked: what
          Tracking shows in those categories, from any account. Pockets whose leftovers carry over (Settings → Bank imports) add
          last month's leftover on top: last month's budget and leftover minus what was tracked. The budget itself never
          changes. The bar is the budget: tracked so far (hover a row to split it by category, and the bar for the numbers),
          the grey rest left to spend, its light end what was carried over, and anything past the end over budget. What
          really went in and out of each pocket is in Wealth.
        </Info>
      </h2>
      <table className="progress-table pocket-table">
        <thead>
          <tr>
            <th>Pocket</th>
            <th className="num">Budget</th>
            <th className="num">Tracked</th>
            <th className="num">Left</th>
            <th className="pocket-bar-cell" aria-label="Tracked per category against the budget" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const colour = pocketColour(settings.pocketColours ?? {}, r.pocket, i)
            const left = r.budgetCents + r.carriedCents - r.spentCents
            return (
              <tr key={r.pocket}>
                <td className="pocket-name">
                  <span className="pocket-colour static" style={{ background: colour }} aria-hidden="true" />
                  <span className="pocket-title">
                    {r.pocket}
                    <span className="muted small pocket-cats">{r.spent.map((s) => name(s.categoryId)).join(', ') || 'No categories linked'}</span>
                  </span>
                </td>
                <td className="num">
                  {plainAmount(r.budgetCents)}
                  {r.carriedCents > 0 && <span className="pocket-note">+{plainAmount(r.carriedCents)} carried over</span>}
                </td>
                <td className="num">{plainAmount(r.spentCents)}</td>
                <td className={`num${left < 0 ? ' over' : ''}`}>{left < 0 ? `−${plainAmount(-left)}` : plainAmount(left)}</td>
                <td className="pocket-bar-cell">
                  <BudgetBar row={r} colour={colour} name={name} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

/** The budget (plus what carried over) as a bar: tracked per category, the grey rest, the carried-over end, then over budget in a darker shade. */
function BudgetBar({ row: r, colour, name }: { row: PocketBudget; colour: string; name: (id: string) => string }) {
  const limit = r.budgetCents + r.carriedCents
  const spent = r.spent.map((s, i) => ({ ...s, pattern: `p${i % 6}` })).filter((s) => s.cents > 0)
  const pieces: Array<{ key: string; cents: number; kind: string }> = []
  let at = 0
  for (const s of spent) {
    const within = Math.max(0, Math.min(s.cents, limit - at))
    if (within > 0) pieces.push({ key: s.categoryId, cents: within, kind: `spent ${s.pattern}` })
    if (s.cents > within) pieces.push({ key: 'over', cents: s.cents - within, kind: `spent ${s.pattern} above` })
    at += s.cents
  }
  const left = Math.max(0, limit - r.spentCents)
  // Spending uses this month's budget first, then what carried over.
  const carriedLeft = Math.min(r.carriedCents, left)
  pieces.push({ key: 'rest', cents: left - carriedLeft, kind: 'rest' }, { key: 'carried', cents: carriedLeft, kind: 'carried' })
  const over = Math.max(0, r.spentCents - limit)
  return (
    <PocketBar
      colour={colour}
      whole={Math.max(limit, r.spentCents)}
      label={`Tracked ${plainAmount(r.spentCents)} of ${plainAmount(limit)}`}
      pieces={pieces}
      rows={[
        ...spent.map((s) => ({ key: s.categoryId, swatch: s.pattern, text: name(s.categoryId), cents: s.cents })),
        ...(left > 0 ? [{ key: 'rest', swatch: 'rest', text: 'Left to spend', cents: left }] : []),
        ...(carriedLeft > 0 ? [{ key: 'carried', swatch: 'carried', text: 'of it carried over', cents: carriedLeft, sub: true }] : []),
        ...(over > 0 ? [{ key: 'over', swatch: 'p0 above', text: 'Over budget', cents: over }] : []),
      ]}
      footer={`Budget ${plainAmount(r.budgetCents)}${r.carriedCents > 0 ? ` + ${plainAmount(r.carriedCents)} carried over` : ''}`}
    />
  )
}
