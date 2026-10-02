import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { useErrorMessage } from '../components/useErrorMessage'
import { copyYear, fillBudgetCells, getSettings, setBudgetCell } from '../db/actions'
import { db } from '../db/db'
import {
  cellId,
  computePlan,
  formatCellInput,
  monthlyAverage,
  parseCellInput,
  type BudgetCell,
  type CellValue,
  type MonthTotals,
  type PlanYear,
} from '../domain/budget'
import { buildTree, flattenTree } from '../domain/categories'
import { BLOCKS, BLOCK_LABELS, type Block, type Category } from '../domain/types'

const number = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (cents: number) => (cents === 0 ? '–' : number.format(cents / 100))
const monthName = (key: string) =>
  new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1).toLocaleString(undefined, { month: 'short' })
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export default function PlannerPage() {
  const settings = useLiveQuery(() => getSettings(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const cells = useLiveQuery(() => db.budgetCells.toArray(), [])
  const [chosenYear, setYear] = useState<number | null>(null)
  const { error, run } = useErrorMessage()
  const [notice, setNotice] = useState<string | null>(null)

  if (!settings || !categories || !cells) return null

  const year = chosenYear ?? Math.max(settings.startingYear, new Date().getFullYear())
  const plan = computePlan(categories, cells, settings, year)
  const cellMap = new Map(cells.map((c) => [c.id, c]))
  const years = Array.from({ length: 10 }, (_, i) => settings.startingYear + i)
  const yearToAllocate = sum(plan.totals.map((t) => t.toAllocate))

  return (
    <section className="page wide">
      <div className="page-head">
        <div>
          <h1>Budget planner</h1>
          <p className="muted">
            Type an amount, or a percentage like <code>15%</code> to take a share of that month's income. Use{' '}
            <strong>Avg/month</strong> to see yearly costs spread over the year.
          </p>
        </div>
        <div className="toolbar">
          <label>
            Year{' '}
            <select id="planner-year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() =>
              run(async () => {
                const copied = await copyYear(year)
                setNotice(
                  copied === 0
                    ? `Nothing to copy: every category already has amounts in ${year + 1}, or ${year} is empty.`
                    : `Copied ${copied} amounts into ${year + 1}.`,
                )
              })
            }
          >
            Copy {year} into {year + 1}
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <div className="grid-scroll">
        <table className="planner">
          <thead>
            <tr className="allocate-row">
              <th scope="row" className="row-label">To be allocated</th>
              {plan.totals.map((t) => (
                <td key={t.month} className={t.toAllocate === 0 ? 'ok' : t.toAllocate < 0 ? 'bad' : 'warn'}>
                  {t.toAllocate === 0 ? '✓' : fmt(t.toAllocate)}
                </td>
              ))}
              <td className={yearToAllocate === 0 ? 'ok' : yearToAllocate < 0 ? 'bad' : 'warn'}>
                {yearToAllocate === 0 ? '✓' : fmt(yearToAllocate)}
              </td>
              <td />
            </tr>
          </thead>
          {BLOCKS.map((block) => (
            <BlockRows
              key={block}
              block={block}
              categories={categories}
              plan={plan}
              cellMap={cellMap}
              run={run}
            />
          ))}
        </table>
      </div>
      <p className="muted small">
        The Main Pot takes whatever is left after expenses and savings
        {settings.allowDissaving ? ', and covers months where you plan to spend more than you earn' : ''}. Change this
        in Settings.
      </p>
    </section>
  )
}

function BlockRows({
  block,
  categories,
  plan,
  cellMap,
  run,
}: {
  block: Block
  categories: Category[]
  plan: PlanYear
  cellMap: Map<string, BudgetCell>
  run: (action: () => Promise<unknown>) => Promise<boolean>
}) {
  const rows = flattenTree(buildTree(categories, block))
  const totalOf = (t: MonthTotals) => (block === 'savings' ? t.savings + t.mainPot : t[block])
  const totals = plan.totals.map(totalOf)

  return (
    <tbody className={`block-${block}`}>
      <tr className="block-head">
        <th scope="col">{BLOCK_LABELS[block]}</th>
        {plan.months.map((m) => (
          <th key={m} scope="col">
            {monthName(m)}
          </th>
        ))}
        <th scope="col">{plan.year}</th>
        <th scope="col" title="Year total divided by 12">
          Avg/month
        </th>
      </tr>
      {rows.length === 0 && (
        <tr>
          <td className="row-label muted" colSpan={15}>
            No {BLOCK_LABELS[block].toLowerCase()} categories yet. Add them on the Categories page.
          </td>
        </tr>
      )}
      {rows.map(({ category, depth, children }) => {
        const values = plan.amounts.get(category.id) ?? []
        const isParent = children.length > 0
        return (
          <tr key={category.id} className={isParent ? 'parent' : undefined}>
            <th scope="row" className="row-label" style={{ paddingLeft: `${0.6 + depth * 1}rem` }}>
              <span>{category.name}</span>
              {!isParent && (
                <button
                  type="button"
                  className="fill"
                  title="Repeat the first planned month in every later month of this year"
                  onClick={() => {
                    const first = plan.months.find((m) => cellMap.has(cellId(category.id, m)))
                    if (first) void run(() => fillBudgetCells(category.id, first, plan.months.filter((m) => m > first)))
                  }}
                >
                  →
                </button>
              )}
            </th>
            {plan.months.map((month, i) =>
              isParent ? (
                <td key={month} className="num">
                  {fmt(values[i] ?? 0)}
                </td>
              ) : (
                <td key={month} className="num input-cell">
                  <CellInput
                    label={`${category.name}, ${monthName(month)} ${plan.year}`}
                    cell={cellMap.get(cellId(category.id, month))}
                    computed={values[i] ?? 0}
                    allowPercent={block !== 'income'}
                    onSave={(value) => run(() => setBudgetCell(category.id, month, value))}
                  />
                </td>
              ),
            )}
            <td className="num strong">{fmt(sum(values))}</td>
            <td className="num muted">{fmt(monthlyAverage(values))}</td>
          </tr>
        )
      })}
      {block === 'savings' && (
        <tr className="main-pot">
          <th scope="row" className="row-label" title="What's left after expenses and savings">
            Main Pot
          </th>
          {plan.totals.map((t) => (
            <td key={t.month} className={t.mainPot < 0 ? 'num neg' : 'num'}>
              {fmt(t.mainPot)}
            </td>
          ))}
          <td className="num strong">{fmt(sum(plan.totals.map((t) => t.mainPot)))}</td>
          <td className="num muted">{fmt(monthlyAverage(plan.totals.map((t) => t.mainPot)))}</td>
        </tr>
      )}
      <tr className="total">
        <th scope="row" className="row-label">
          Total
        </th>
        {totals.map((v, i) => (
          <td key={plan.months[i]} className="num">
            {fmt(v)}
          </td>
        ))}
        <td className="num">{fmt(sum(totals))}</td>
        <td className="num muted">{fmt(monthlyAverage(totals))}</td>
      </tr>
      {block === 'savings' && (
        <>
          <tr className="balance">
            <th scope="row" className="row-label" title="Main Pot balance at the end of each month">
              Main Pot balance
            </th>
            {plan.totals.map((t) => (
              <td key={t.month} className={t.potBalance < 0 ? 'num neg' : 'num'}>
                {fmt(t.potBalance)}
              </td>
            ))}
            <td colSpan={2} />
          </tr>
          <tr className="balance">
            <th scope="row" className="row-label" title="Everything planned into savings so far, including the Main Pot">
              Saved so far
            </th>
            {plan.totals.map((t) => (
              <td key={t.month} className="num">
                {fmt(t.savedTotal)}
              </td>
            ))}
            <td colSpan={2} />
          </tr>
        </>
      )}
    </tbody>
  )
}

function CellInput({
  label,
  cell,
  computed,
  allowPercent,
  onSave,
}: {
  label: string
  cell: BudgetCell | undefined
  computed: number
  allowPercent: boolean
  onSave: (value: CellValue | null) => Promise<boolean> | void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const editing = draft !== null
  const cancelled = useRef(false)

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    if (draft === null) return
    const parsed = parseCellInput(draft)
    if (parsed === undefined || (parsed?.kind === 'percent' && !allowPercent)) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setDraft(null)
    if (formatCellInput(parsed ?? undefined) !== formatCellInput(cell)) void onSave(parsed)
  }

  const shown =
    cell?.kind === 'percent' ? `${cell.basisPoints / 100}% · ${fmt(computed)}` : cell ? fmt(cell.cents) : ''

  return (
    <input
      aria-label={label}
      className={invalid ? 'invalid' : cell?.kind === 'percent' ? 'percent' : undefined}
      title={invalid ? (allowPercent ? 'Type an amount like 486.50 or a share like 15%' : 'Type an amount like 3119.22') : undefined}
      value={editing ? draft : shown}
      placeholder="–"
      inputMode="decimal"
      onFocus={(e) => {
        setDraft(formatCellInput(cell))
        requestAnimationFrame(() => e.target.select())
      }}
      onChange={(e) => {
        setDraft(e.target.value)
        setInvalid(false)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          cancelled.current = true
          setDraft(null)
          setInvalid(false)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}
