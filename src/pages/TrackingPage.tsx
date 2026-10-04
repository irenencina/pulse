import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import CategorySelect from '../components/CategorySelect'
import ConfirmButton from '../components/ConfirmButton'
import Info from '../components/Info'
import InlineEdit from '../components/InlineEdit'
import { useErrorMessage } from '../components/useErrorMessage'
import { addTransaction, deleteTransaction, getSettings, updateTransaction } from '../db/actions'
import { db } from '../db/db'
import { computePlan } from '../domain/budget'
import { parseAmount } from '../domain/money'
import type { MonthKey } from '../domain/periods'
import { parseRevolut, type BankFile } from '../domain/revolut'
import { formatTag } from '../domain/tags'
import { countsFor, trackedTotals, type Transaction } from '../domain/transactions'
import { BLOCKS, BLOCK_LABELS, type Block, type Category, type Settings, type Tag } from '../domain/types'
import { dayLabel, monthLabel, plainAmount, signedAmount, todayIso } from './tracking/format'
import RevolutImport from './tracking/RevolutImport'

const ALL = 'all'

export default function TrackingPage() {
  const settings = useLiveQuery(() => getSettings(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [])
  const cells = useLiveQuery(() => db.budgetCells.toArray(), [])
  const tags = useLiveQuery(() => db.tags.toArray(), [])
  const [month, setMonth] = useState<MonthKey | typeof ALL>(todayIso().slice(0, 7))
  const [pending, setPending] = useState<{ file: BankFile; name: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { error, run } = useErrorMessage()
  const fileInput = useRef<HTMLInputElement>(null)

  if (!settings || !categories || !transactions || !cells || !tags) return null

  const withMonth = transactions.map((t) => ({ t, counts: countsFor(t, settings) }))
  const months = [...new Set([todayIso().slice(0, 7), ...withMonth.map((x) => x.counts)])].sort().reverse()
  const shown = withMonth
    .filter((x) => month === ALL || x.counts === month)
    .sort((a, b) => b.t.date.localeCompare(a.t.date) || b.t.createdAt - a.t.createdAt)
  const tracked = trackedTotals(transactions, month === ALL ? null : month, settings)
  const planned =
    month === ALL ? null : computePlan(categories, cells, settings, Number(month.slice(0, 4))).totals[Number(month.slice(5)) - 1]!
  const uncategorised = shown.filter((x) => x.t.categoryId === null).length
  const last = transactions.reduce<Transaction | null>((a, t) => (!a || t.date > a.date ? t : a), null)

  const openFile = async (file: File) => {
    setNotice(null)
    await run(async () => {
      setPending({ file: parseRevolut(await file.text()), name: file.name })
    })
  }

  return (
    <section className="page wide">
      <div className="page-head">
        <h1>
          Tracking{' '}
          <Info>
            Everything you actually earned, spent and saved. Add it by hand or import a Revolut statement. Income on or
            after day {settings.lateIncomeDay} counts for the next month when "Shift late income" is on in Settings.
          </Info>
        </h1>
        <div className="toolbar">
          <label>
            Month{' '}
            <select id="tracking-month" value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
              <option value={ALL}>All months</option>
            </select>
          </label>
          <button type="button" onClick={() => fileInput.current?.click()} title="Import a CSV statement exported from the Revolut app">
            Import Revolut CSV
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void openFile(file)
            }}
          />
        </div>
      </div>

      <div className="kpis">
        {BLOCKS.map((block) => (
          <div key={block} className={`kpi block-${block}`}>
            <span className="kpi-label">{BLOCK_LABELS[block]}</span>
            <strong>{plainAmount(tracked[block])}</strong>
            {planned && <span className="muted small">of {plainAmount(planned[block])} planned</span>}
          </div>
        ))}
        <div className="kpi">
          <span className="kpi-label">Transactions</span>
          <strong>{tracked.count}</strong>
          <span className="muted small">{last ? `Last on ${dayLabel(last.date)}` : 'None yet'}</span>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {pending ? (
        <RevolutImport
          file={pending.file}
          fileName={pending.name}
          categories={categories}
          history={transactions}
          onClose={(message) => {
            setPending(null)
            setNotice(message)
          }}
        />
      ) : (
        <>
          <QuickAdd categories={categories} settings={settings} onAdded={(m) => setMonth(m)} />
          {uncategorised > 0 && (
            <p className="needs-category small">
              {uncategorised} {uncategorised === 1 ? 'transaction needs' : 'transactions need'} a category.
            </p>
          )}
          {shown.length === 0 ? (
            <p className="muted">
              No transactions {month === ALL ? 'yet' : `in ${monthLabel(month)}`}. Add one above or import a Revolut
              statement.
            </p>
          ) : (
            <div className="grid-scroll">
              <table className="ledger">
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

function QuickAdd({
  categories,
  settings,
  onAdded,
}: {
  categories: Category[]
  settings: Settings
  onAdded: (month: MonthKey) => void
}) {
  const [date, setDate] = useState(todayIso())
  const [choice, setChoice] = useState<{ block: Block; categoryId: string } | null>(null)
  const [amount, setAmount] = useState('')
  const [details, setDetails] = useState('')
  const [tagText, setTagText] = useState('')
  const { error, run } = useErrorMessage()
  const amountInput = useRef<HTMLInputElement>(null)

  return (
    <form
      className="quick-add"
      onSubmit={async (e) => {
        e.preventDefault()
        const ok = await run(async () => {
          if (!choice) throw new Error('Pick a category.')
          const cents = parseAmount(amount)
          if (cents === null || cents === 0) throw new Error('Type an amount like 12.50.')
          await addTransaction({ date, ...choice, cents: Math.abs(cents), details, tags: tagText })
          onAdded(countsFor({ date, block: choice.block }, settings))
        })
        if (ok) {
          // Keep the date and category: several receipts of one day are often typed in a row.
          setAmount('')
          setDetails('')
          setTagText('')
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
      <input aria-label="Tags" placeholder="#tags" value={tagText} onChange={(e) => setTagText(e.target.value)} />
      <button type="submit" className="primary">
        Add
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

function LedgerRow({
  t,
  counts,
  categories,
  tags,
  run,
}: {
  t: Transaction
  counts: MonthKey
  categories: Category[]
  tags: Tag[]
  run: (action: () => Promise<unknown>) => Promise<boolean>
}) {
  const tagNames = t.tagIds.flatMap((id) => tags.filter((tag) => tag.id === id).map((tag) => tag.name))
  const shifted = counts !== t.date.slice(0, 7)
  return (
    <tr className={`block-${t.block}${t.categoryId === null ? ' uncategorised' : ''}`}>
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
            if (choice) void run(() => updateTransaction(t.id, choice))
          }}
        />
      </td>
      <td>
        <InlineEdit
          value={t.details}
          display={(v) => v || '…'}
          label="Details"
          title="Edit details"
          onSave={(v) => run(() => updateTransaction(t.id, { details: v }))}
        />
      </td>
      <td>
        <InlineEdit
          value={tagNames.map(formatTag).join(' ')}
          display={(v) => v || '…'}
          label="Tags"
          title="Edit tags"
          onSave={(v) => run(() => updateTransaction(t.id, { tags: v }))}
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
