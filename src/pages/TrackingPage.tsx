import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState, type MouseEvent, type ReactNode } from 'react'
import CategorySelect from '../components/CategorySelect'
import ConfirmButton from '../components/ConfirmButton'
import Info from '../components/Info'
import InlineEdit from '../components/InlineEdit'
import TagInput from '../components/TagInput'
import { useErrorMessage } from '../components/useErrorMessage'
import { useRowSelection } from '../components/useRowSelection'
import { addTransaction, deleteTransaction, getSettings, updateTransaction } from '../db/actions'
import { db } from '../db/db'
import { computePlan } from '../domain/budget'
import { isFiltering, ledgerMatcher, NO_CATEGORY, NO_FILTER, type LedgerFilter } from '../domain/ledgerFilter'
import { parseAmount } from '../domain/money'
import { monthPeriod, type MonthKey } from '../domain/periods'
import { categoryProgress } from '../domain/progress'
import { expectedPayments, findDuplicate } from '../domain/recurring'
import { readBankFile, type BankFile } from '../domain/revolut'
import { countsFor, trackedTotals, type Transaction } from '../domain/transactions'
import { BLOCKS, BLOCK_LABELS, type Block, type Category, type Settings, type Tag } from '../domain/types'
import { dayLabel, monthLabel, plainAmount, signedAmount, todayIso } from './tracking/format'
import CategoryProgressTable from './tracking/CategoryProgressTable'
import ExpectedPayments from './tracking/ExpectedPayments'
import LedgerFilters from './tracking/LedgerFilters'
import RevolutImport from './tracking/RevolutImport'
import { BulkTagsPanel, ImportsPanel, MerchantRulesPanel, SpendingCalendarPanel } from './tracking/ToolPanels'
import { CalendarIcon, ImportIcon, RulesIcon, TagIcon, UndoIcon } from '../components/icons'

const ALL = 'all'

type Tool = 'undo' | 'rules' | 'tags' | 'calendar'

export default function TrackingPage() {
  const settings = useLiveQuery(() => getSettings(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [])
  const cells = useLiveQuery(() => db.budgetCells.toArray(), [])
  const tags = useLiveQuery(() => db.tags.toArray(), [])
  const pockets = useLiveQuery(() => db.pockets.toArray(), [])
  const skippedExpected = useLiveQuery(async () => new Set((await db.skippedRecurring.toArray()).map((s) => s.id)), [])
  const imports = useLiveQuery(() => db.imports.toArray(), [])
  const rules = useLiveQuery(() => db.merchantRules.toArray(), [])
  const [tool, setTool] = useState<Tool | null>(null)
  const [filter, setFilter] = useState<LedgerFilter>(NO_FILTER)
  const [month, setMonthState] = useState<MonthKey | typeof ALL>(todayIso().slice(0, 7))
  // A day picked on the calendar belongs to one month.
  const setMonth = (m: MonthKey | typeof ALL) => {
    setMonthState(m)
    setFilter((f) => (f.day ? { ...f, day: '' } : f))
  }
  const [pending, setPending] = useState<{ file: BankFile; name: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { error, run } = useErrorMessage()
  const fileInput = useRef<HTMLInputElement>(null)
  const shown =
    transactions && settings && categories && tags
      ? visible(transactions, settings, month).filter((x) => ledgerMatcher(filter, categories, tags)(x.t))
      : []
  const selection = useRowSelection(shown.map((x) => x.t.id))

  if (!settings || !categories || !transactions || !cells || !tags || !pockets || !skippedExpected || !imports || !rules) {
    return null
  }
  const toggle = (t: Tool) => setTool((current) => (current === t ? null : t))

  const months = [...new Set([todayIso().slice(0, 7), ...transactions.map((t) => countsFor(t, settings))])].sort().reverse()
  const tracked = trackedTotals(transactions, month === ALL ? null : month, settings)
  const planned =
    month === ALL ? null : computePlan(categories, cells, settings, Number(month.slice(0, 4))).totals[Number(month.slice(5)) - 1]!
  const inMonth = visible(transactions, settings, month)
  const uncategorised = inMonth.filter((x) => x.t.categoryId === null).length
  const thisMonth = todayIso().slice(0, 7)
  const expected = month === thisMonth ? expectedPayments(transactions, month, settings, skippedExpected) : []
  const progress = month === ALL ? null : categoryProgress(categories, cells, transactions, settings, month)
  const pocketNames = [...new Set(transactions.flatMap((t) => (t.pocket ? [t.pocket] : [])))].sort()
  const last = transactions.reduce<Transaction | null>((a, t) => (!a || t.date > a.date ? t : a), null)

  const openFile = async (file: File) => {
    setNotice(null)
    await run(async () => {
      setPending({ file: await readBankFile(new Uint8Array(await file.arrayBuffer())), name: file.name })
    })
  }

  return (
    <section className="page wide">
      {/* One grid, so the totals on the right line up with the month picker above them. */}
      <div className="tracking-top">
        <div className="tracking-title">
          <h1>
            Tracking{' '}
            <Info>
              Everything you actually earned, spent and saved. Add it by hand or import a Revolut statement. Income on or
              after day {settings.lateIncomeDay} counts for the next month when "Shift late income" is on in Settings.
            </Info>
          </h1>
          <div className="tracking-tools">
            {/* More tracking tools can sit next to this one. Each explains itself on hover. */}
            <div className="toolbox" role="toolbar" aria-label="Tools">
              <button
                type="button"
                className="tool"
                aria-label="Import a bank statement"
                title="Import a bank statement. For now: the Revolut statement (Excel or CSV) from the Revolut app."
                onClick={() => fileInput.current?.click()}
              >
                <ImportIcon />
              </button>
              <ToolButton tool="undo" current={tool} onToggle={toggle} label="Undo an import" title="Undo an import: remove everything one statement added">
                <UndoIcon />
              </ToolButton>
              <ToolButton tool="rules" current={tool} onToggle={toggle} label="Merchant rules" title="Merchant rules: see and change the category Pulse uses for each shop">
                <RulesIcon />
              </ToolButton>
              <ToolButton tool="tags" current={tool} onToggle={toggle} label="Tag selected rows" title="Tag selected rows: add or remove tags on all the rows you selected">
                <TagIcon />
              </ToolButton>
              <ToolButton tool="calendar" current={tool} onToggle={toggle} label="Spending calendar" title="Spending calendar: which days of the month you spent the most">
                <CalendarIcon />
              </ToolButton>
            </div>
            <label htmlFor="tracking-month">Month</label>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void openFile(file)
            }}
          />
        </div>
        <select id="tracking-month" className="tracking-month" value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => (
            <option key={m} value={m}>
              {periodLabel(m, settings)}
            </option>
          ))}
          <option value={ALL}>All months</option>
        </select>
        {progress && !pending ? <CategoryProgressTable rows={progress} /> : <div />}
        <div className="kpis">
          <div className="kpi">
            <span className="kpi-label">Transactions</span>
            <strong>{tracked.count}</strong>
            <span className="muted small">{last ? `Last on ${dayLabel(last.date)}` : 'None yet'}</span>
          </div>
          {BLOCKS.map((block) => (
            <div key={block} className={`kpi block-${block}`}>
              <span className="kpi-label">{BLOCK_LABELS[block]}</span>
              <strong>{plainAmount(tracked[block])}</strong>
              {planned && <span className="muted small">of {plainAmount(planned[block])} planned</span>}
            </div>
          ))}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {!pending && tool === 'undo' && <ImportsPanel imports={imports} run={run} onClose={() => setTool(null)} />}
      {!pending && tool === 'rules' && (
        <MerchantRulesPanel transactions={transactions} rules={rules} categories={categories} run={run} onClose={() => setTool(null)} />
      )}
      {!pending && tool === 'tags' && (
        <BulkTagsPanel
          selected={[...selection.selected].filter((id) => shown.some((x) => x.t.id === id))}
          transactions={transactions}
          tags={tags}
          run={run}
          onClose={() => setTool(null)}
        />
      )}
      {!pending && tool === 'calendar' && (
        <SpendingCalendarPanel
          transactions={transactions}
          month={month === ALL ? null : month}
          settings={settings}
          day={filter.day}
          onPickDay={(day) => setFilter({ ...filter, day })}
          onClose={() => setTool(null)}
        />
      )}

      {pending ? (
        <RevolutImport
          file={pending.file}
          fileName={pending.name}
          categories={categories}
          history={transactions}
          pockets={pockets}
          rules={rules}
          onClose={(message) => {
            setPending(null)
            setNotice(message)
          }}
        />
      ) : (
        <>
          <QuickAdd categories={categories} settings={settings} transactions={transactions} tags={tags} onAdded={(m) => setMonth(m)} />
          <ExpectedPayments expected={expected} month={month} categories={categories} run={run} />
          {uncategorised > 0 && filter.category !== NO_CATEGORY && (
            <p className="needs-category small">
              {uncategorised} {uncategorised === 1 ? 'transaction needs' : 'transactions need'} a category.{' '}
              <button type="button" className="link" onClick={() => setFilter({ ...NO_FILTER, category: NO_CATEGORY })}>
                Show {uncategorised === 1 ? 'it' : 'them'}
              </button>
            </p>
          )}
          {inMonth.length > 0 && (
            <LedgerFilters filter={filter} onChange={setFilter} categories={categories} tags={tags} pockets={pocketNames} />
          )}
          {shown.length === 0 ? (
            <p className="muted">
              {isFiltering(filter) && inMonth.length > 0
                ? 'Nothing matches these filters.'
                : `No transactions ${month === ALL ? 'yet' : `in ${monthLabel(month)}`}. Add one above or import a Revolut statement.`}
            </p>
          ) : (
            <div className="grid-scroll" tabIndex={-1} onKeyDown={(e) => e.key === 'Escape' && selection.clear()}>
              <table className="ledger selectable">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Details</th>
                    <th>Tags</th>
                    <th className="num">Amount</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map(({ t, counts }) => (
                    <LedgerRow
                      key={t.id}
                      t={t}
                      counts={counts}
                      categories={categories}
                      tags={tags}
                      run={run}
                      selected={selection.selected.has(t.id)}
                      onRowClick={(e) => selection.onRowClick(e, t.id)}
                      onCategory={(choice) =>
                        run(async () => {
                          for (const id of selection.targetsOf(t.id)) await updateTransaction(id, choice)
                        })
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** The transactions that count for a month (or all), newest first. */
function visible(transactions: Transaction[], settings: Settings, month: MonthKey | typeof ALL) {
  return transactions
    .map((t) => ({ t, counts: countsFor(t, settings) }))
    .filter((x) => month === ALL || x.counts === month)
    .sort((a, b) => b.t.date.localeCompare(a.t.date) || b.t.createdAt - a.t.createdAt)
}

function QuickAdd({
  categories,
  settings,
  transactions,
  tags,
  onAdded,
}: {
  categories: Category[]
  settings: Settings
  transactions: Transaction[]
  tags: Tag[]
  onAdded: (month: MonthKey) => void
}) {
  /** A possible duplicate shown after the first click; a second click on Add adds it anyway. */
  const [warning, setWarning] = useState<{ text: string; signature: string } | null>(null)
  const [date, setDate] = useState(todayIso())
  const [choice, setChoice] = useState<{ block: Block; categoryId: string } | null>(null)
  const [amount, setAmount] = useState('')
  const [details, setDetails] = useState('')
  const [tagNames, setTagNames] = useState<string[]>([])
  const { error, run } = useErrorMessage()
  const amountInput = useRef<HTMLInputElement>(null)

  return (
    <form
      className="quick-add"
      onSubmit={async (e) => {
        e.preventDefault()
        let added = false
        await run(async () => {
          if (!choice) throw new Error('Pick a category.')
          const cents = parseAmount(amount)
          if (cents === null || cents === 0) throw new Error('Type an amount like 12.50.')
          const candidate = { date, block: choice.block, cents: Math.abs(cents) }
          const signature = `${date}|${choice.block}|${candidate.cents}`
          const twin = findDuplicate(candidate, transactions)
          if (twin && warning?.signature !== signature) {
            setWarning({
              signature,
              text: `You already have ${signedAmount(twin.cents, twin.block)}${twin.details ? ` (${twin.details})` : ''} on ${dayLabel(twin.date)}. Click Add again to add this one too.`,
            })
            return false
          }
          setWarning(null)
          await addTransaction({ date, ...choice, cents: Math.abs(cents), details, tags: tagNames.join(' ') })
          onAdded(countsFor({ date, block: choice.block }, settings))
          added = true
        })
        if (added) {
          // Keep the date and category: several receipts of one day are often typed in a row.
          setAmount('')
          setDetails('')
          setTagNames([])
          amountInput.current?.focus()
        }
      }}
    >
      <input type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} required />
      <CategorySelect label="Category" categories={categories} value={choice?.categoryId ?? null} onChange={setChoice} required />
      <input
        ref={amountInput}
        aria-label="Amount"
        className="amount-input"
        placeholder="0.00"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <input aria-label="Details" placeholder="Details" value={details} onChange={(e) => setDetails(e.target.value)} />
      <TagInput label="Tags" placeholder="#tags" value={tagNames} onChange={setTagNames} tags={tags} />
      <button type="submit" className="primary">
        Add
      </button>
      {error && <p className="error">{error}</p>}
      {warning && !error && <p className="warning small">{warning.text}</p>}
    </form>
  )
}

function LedgerRow({
  t,
  counts,
  categories,
  tags,
  run,
  selected,
  onRowClick,
  onCategory,
}: {
  t: Transaction
  counts: MonthKey
  categories: Category[]
  tags: Tag[]
  run: (action: () => Promise<unknown>) => Promise<boolean>
  selected: boolean
  onRowClick: (e: MouseEvent) => void
  onCategory: (choice: { block: Block; categoryId: string }) => void
}) {
  const tagNames = t.tagIds.flatMap((id) => tags.filter((tag) => tag.id === id).map((tag) => tag.name))
  const shifted = counts !== t.date.slice(0, 7)
  return (
    <tr
      className={`block-${t.block}${t.categoryId === null ? ' uncategorised' : ''}${selected ? ' selected-row' : ''}`}
      onClick={onRowClick}
    >
      <td className="date">
        {dayLabel(t.date)}
        {shifted && (
          <span className="shifted" title={`Late income: counts for ${monthLabel(counts)} (see Settings)`}>
            → {monthLabel(counts, 'month')}
          </span>
        )}
      </td>
      <td>
        <span className="dot" aria-hidden="true" />
        <CategorySelect
          label={`Category of ${t.details || 'transaction'}`}
          categories={categories}
          value={t.categoryId}
          placeholder="Pick a category"
          onChange={(choice) => {
            if (choice) onCategory(choice)
          }}
        />
      </td>
      <td>
        {t.pocket && (
          <span className="pocket-chip" title={`Paid from your ${t.pocket} pocket`}>
            {t.pocket}
          </span>
        )}
        <InlineEdit
          value={t.details}
          display={(v) => v || '…'}
          label="Details"
          title="Edit details"
          onSave={(v) => run(() => updateTransaction(t.id, { details: v }))}
        />
      </td>
      <td>
        <TagInput
          label={`Tags of ${t.details || 'transaction'}`}
          placeholder="+ tag"
          value={tagNames}
          tags={tags}
          onChange={(names) => void run(() => updateTransaction(t.id, { tags: names.join(' ') }))}
        />
      </td>
      <td className={`num amount${t.block === 'income' ? ' in' : ''}`}>
        <InlineEdit
          value={plainAmount(t.cents)}
          display={() => signedAmount(t.cents, t.block)}
          label="Amount"
          title="Edit amount"
          onSave={(v) =>
            run(async () => {
              const cents = parseAmount(v)
              if (cents === null || cents === 0) throw new Error('Type an amount like 12.50.')
              await updateTransaction(t.id, { cents: Math.abs(cents) })
            })
          }
        />
      </td>
      <td className="actions">
        <ConfirmButton label="Delete" confirmLabel="Sure?" onConfirm={() => void run(() => deleteTransaction(t.id))} />
      </td>
    </tr>
  )
}

/** "October 2026", or "October 2026 (24 Sep – 23 Oct)" when whole months are shifted. */
function periodLabel(month: MonthKey, settings: Settings): string {
  if (!(settings.shiftWholeMonth && settings.shiftLateIncome)) return monthLabel(month)
  const { from, to } = monthPeriod(month, settings)
  return `${monthLabel(month)} (${dayLabel(from)} – ${dayLabel(to)})`
}

function ToolButton({
  tool,
  current,
  onToggle,
  label,
  title,
  children,
}: {
  tool: Tool
  current: Tool | null
  onToggle: (tool: Tool) => void
  label: string
  title: string
  children: ReactNode
}) {
  return (
    <button type="button" className="tool" aria-label={label} title={title} aria-pressed={current === tool} onClick={() => onToggle(tool)}>
      {children}
    </button>
  )
}
