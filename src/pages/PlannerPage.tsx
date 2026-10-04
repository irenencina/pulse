import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import Info from '../components/Info'
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
        <h1>
          Budget planner{' '}
          <Info>
            Click a cell and type an amount, or a percentage like 15% to take that share of the month's income. Hover
            a row and click → to repeat its first month over the rest of the year.
          </Info>
        </h1>
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
        <th scope="col">
          Avg/month <Info>The year total divided by 12. A cost paid once a year shows here as its monthly share.</Info>
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
                    income={plan.totals[i]!.income}
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
          <th scope="row" className="row-label">
            Main Pot{' '}
            <Info>
              Calculated automatically: whatever is left of your income after expenses and savings. When a month
              spends more than it earns, it takes the difference out of the Main Pot (shown in red). Change this in
              Settings.
            </Info>
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
            <th scope="row" className="row-label">
              Main Pot balance <Info>How much is in the Main Pot at the end of each month, counted from the starting year.</Info>
            </th>
            {plan.totals.map((t) => (
              <td key={t.month} className={t.potBalance < 0 ? 'num neg' : 'num'}>
                {fmt(t.potBalance)}
              </td>
            ))}
            <td colSpan={2} />
          </tr>
          <tr className="balance">
            <th scope="row" className="row-label">
              Saved so far{' '}
              <Info>Everything planned into savings since the starting year, including the Main Pot.</Info>
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
  income,
  allowPercent,
  onSave,
}: {
  label: string
  cell: BudgetCell | undefined
  computed: number
  income: number
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

  const shown = cell?.kind === 'percent' ? fmt(computed) : cell ? fmt(cell.cents) : ''
  const percentTitle =
    cell?.kind === 'percent' ? `${cell.basisPoints / 100}% of income (${fmt(income)}) = ${fmt(computed)}` : undefined
  return (
    <>
      <input
        aria-label={label}
        className={invalid ? 'invalid' : cell?.kind === 'percent' ? 'percent' : undefined}
        title={
          invalid
            ? allowPercent
              ? 'Type an amount like 486.50 or a share like 15%'
              : 'Type an amount like 3119.22'
            : editing
              ? undefined
              : percentTitle
        }
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
      {cell?.kind === 'percent' && !editing && (
        <span className="pct-tag" aria-hidden="true">
          {cell.basisPoints / 100}%
        </span>
      )}
    </>
  )
}
