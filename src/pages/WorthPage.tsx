import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import CategorySelect from '../components/CategorySelect'
import ConfirmButton from '../components/ConfirmButton'
import Info from '../components/Info'
import Menu from '../components/Menu'
import { EditIcon, PlusIcon, TrashIcon } from '../components/icons'
import { useErrorMessage } from '../components/useErrorMessage'
import { db } from '../db/db'
import { deleteAccount, saveAccount, setBalances } from '../db/worth'
import type { MonthKey } from '../domain/periods'
import type { Transaction } from '../domain/transactions'
import type { Block, Category } from '../domain/types'
import {
  ACCOUNT_KINDS,
  KIND_LABELS,
  SIDE_LABELS,
  addMonths,
  balanceIn,
  hasTerms,
  lastUpdated,
  payMore,
  payoff,
  sideOf,
  suggestBalance,
  worthHistory,
  worthIn,
  type Account,
  type AccountKind,
  type AccountSide,
  type Balance,
  type LoanTerms,
  type WorthPoint,
} from '../domain/worth'
import { monthLabel, plainAmount, todayIso } from './tracking/format'
import { Popup } from './wishlist/WishDialogs'

const signed = (cents: number) => (cents < 0 ? `−${plainAmount(-cents)}` : plainAmount(cents))
const change = (cents: number) => (cents === 0 ? '±0' : cents > 0 ? `+${plainAmount(cents)}` : `−${plainAmount(-cents)}`)

/** What you own and what you owe, from a balance you note once a month. */
export default function WorthPage() {
  const accounts = useLiveQuery(() => db.accounts.orderBy('order').toArray(), [])
  const balances = useLiveQuery(() => db.balances.toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [])
  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  const [updating, setUpdating] = useState(false)
  const { error, run } = useErrorMessage()
  if (!accounts || !balances || !categories || !transactions) return null

  const thisMonth = todayIso().slice(0, 7) as MonthKey
  const now = worthIn(accounts, balances, thisMonth)
  const before = worthIn(accounts, balances, addMonths(thisMonth, -1))
  const history = worthHistory(accounts, balances, thisMonth)
  const updated = lastUpdated(balances)
  const bySide = (side: AccountSide) => accounts.filter((a) => sideOf(a.kind) === side)

  return (
    <section className="page worth-page">
      <div className="page-head">
        <h1>
          Worth{' '}
          <Info>
            What you own and what you owe. Once a month, note what each account holds (or what is still owed) with Update
            balances: last month's numbers are filled in, so you only change what moved. Importing a Revolut statement in
            Tracking fills in your main account, pockets and savings for you. Net worth is everything you own minus
            everything you owe.
          </Info>
        </h1>
        <div className="toolbox" role="toolbar" aria-label="Tools">
          <button type="button" className="tool" aria-label="New account" title="New account: a bank account, savings, investments, a loan or a credit card" onClick={() => setEditing('new')}>
            <PlusIcon />
          </button>
          <button
            type="button"
            className="tool"
            aria-label="Update balances"
            title="Update balances: note what every account holds this month"
            disabled={accounts.length === 0}
            onClick={() => setUpdating(true)}
          >
            <EditIcon />
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      {accounts.length === 0 ? (
        <div className="worth-empty">
          <p className="muted">Add the places your money sits, and what you owe, to see your net worth grow month by month.</p>
          <button type="button" className="primary" onClick={() => setEditing('new')}>
            Add an account
          </button>
        </div>
      ) : (
        <>
          <div className="worth-kpis">
            <div className={`kpi worth-net${now.net < 0 ? ' negative' : ''}`}>
              <span className="kpi-label">
                Net worth <Info>Everything you own minus everything you owe, with each account's latest balance.</Info>
              </span>
              <strong>{signed(now.net)}</strong>
              <span className="muted small">
                {change(now.net - before.net)} since {monthLabel(addMonths(thisMonth, -1), 'month')}
              </span>
            </div>
            <div className="kpi block-savings">
              <span className="kpi-label">Own</span>
              <strong>{plainAmount(now.own)}</strong>
              <span className="muted small">
                {change(now.own - before.own)} since {monthLabel(addMonths(thisMonth, -1), 'month')}
              </span>
            </div>
            <div className="kpi block-expenses">
              <span className="kpi-label">Owe</span>
              <strong>{plainAmount(now.owe)}</strong>
              <span className="muted small">
                {change(now.owe - before.owe)} since {monthLabel(addMonths(thisMonth, -1), 'month')}
              </span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Last update</span>
              <strong>{updated ? monthLabel(updated) : '–'}</strong>
              <span className="muted small">{updated === thisMonth ? 'up to date' : 'time for this month’s'}</span>
            </div>
          </div>

          {history.length > 0 && (
            <section className="dash-panel">
              <div className="dash-panel-head">
                <h2>
                  Over time <Info>Each month's total, using the latest balance noted for every account by then.</Info>
                </h2>
                <span className="worth-legend">
                  <span className="own">Own</span>
                  <span className="owe">Owe</span>
                  <span className="net">Net worth</span>
                </span>
              </div>
              <WorthChart points={history} />
            </section>
          )}

          <section className="dash-panel">
            <h2>Accounts</h2>
            <table className="progress-table worth-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Type</th>
                  <th className="num">Balance</th>
                  <th className="num">Since {monthLabel(addMonths(thisMonth, -1), 'month')}</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              {(['own', 'owe'] as const).map((side) =>
                bySide(side).length === 0 ? null : (
                  <tbody key={side} className={side === 'own' ? 'block-savings' : 'block-expenses'}>
                    <tr className="block-row block-head">
                      <th colSpan={2}>{SIDE_LABELS[side]}</th>
                      <th className="num">{plainAmount(side === 'own' ? now.own : now.owe)}</th>
                      <th colSpan={2} />
                    </tr>
                    {bySide(side).map((a) => (
                      <AccountRow key={a.id} account={a} balances={balances} month={thisMonth} onEdit={() => setEditing(a)} run={run} />
                    ))}
                  </tbody>
                ),
              )}
            </table>
          </section>

          {accounts.some((a) => hasTerms(a.kind)) && <Loans accounts={accounts.filter((a) => hasTerms(a.kind))} balances={balances} month={thisMonth} onEdit={setEditing} />}
        </>
      )}

      {editing && <AccountDialog account={editing === 'new' ? undefined : editing} categories={categories} month={thisMonth} onClose={() => setEditing(null)} />}
      {updating && (
        <UpdateDialog accounts={accounts} balances={balances} categories={categories} transactions={transactions} month={thisMonth} onClose={() => setUpdating(false)} />
      )}
    </section>
  )
}

function AccountRow({
  account,
  balances,
  month,
  onEdit,
  run,
}: {
  account: Account
  balances: Balance[]
  month: MonthKey
  onEdit: () => void
  run: ReturnType<typeof useErrorMessage>['run']
}) {
  const now = balanceIn(balances, account.id, month)
  const before = balanceIn(balances, account.id, addMonths(month, -1))
  const moved = (now?.cents ?? 0) - (before?.cents ?? 0)
  // An account not updated this month shows its last balance, with the month it's from.
  const stale = now && now.month !== month
  return (
    <tr>
      <td>{account.name}</td>
      <td className="muted">
        {KIND_LABELS[account.kind]}
        {account.bankName && (
          <span className="worth-bank" title={`Filled in from your Revolut statement (${account.bankName === 'Personal Account' ? 'main account' : account.bankName})`}>
            Revolut
          </span>
        )}
      </td>
      <td className="num" title={stale ? `Last noted in ${monthLabel(now.month)}` : undefined}>
        {now ? plainAmount(now.cents) : '–'}
        {stale && <span className="worth-stale"> ({monthLabel(now.month, 'month')})</span>}
      </td>
      <td className="num muted">{before || now ? change(moved) : ''}</td>
      <td className="actions">
        <Menu label={`More for ${account.name}`}>
          {(close) => (
            <>
              <button type="button" role="menuitem" onClick={() => (close(), onEdit())}>
                <EditIcon /> Edit
              </button>
              <ConfirmButton
                label={
                  <>
                    <TrashIcon /> Delete
                  </>
                }
                confirmLabel="Sure? Its history goes too"
                title={`Delete ${account.name} and its balances`}
                onConfirm={() => void run(async () => (close(), await deleteAccount(account.id)))}
              />
            </>
          )}
        </Menu>
      </td>
    </tr>
  )
}

/** "Aug 2035". */
const shortMonth = (m: MonthKey) => new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).toLocaleString(undefined, { month: 'short', year: 'numeric' })

/** "2 years 3 months", "11 months", "1 year". */
function duration(months: number): string {
  const years = Math.floor(months / 12)
  const rest = months % 12
  const part = (n: number, word: string) => (n === 0 ? '' : `${n} ${word}${n === 1 ? '' : 's'}`)
  return [part(years, 'year'), part(rest, 'month')].filter(Boolean).join(' ') || 'this month'
}

/** Loans and other debts: when each is paid off, and what paying more would change. */
function Loans({ accounts, balances, month, onEdit }: { accounts: Account[]; balances: Balance[]; month: MonthKey; onEdit: (a: Account) => void }) {
  return (
    <section className="dash-panel">
      <h2>
        Loans{' '}
        <Info>
          When each loan is paid off at its monthly payment, and the interest still to pay until then. Try paying a little more a
          month to see how much sooner it ends. Monthly payments also show in Upcoming until Tracking shows them.
        </Info>
      </h2>
      <div className="loan-cards">
        {accounts.map((a) => (
          <LoanCard key={a.id} account={a} balances={balances} month={month} onEdit={() => onEdit(a)} />
        ))}
      </div>
    </section>
  )
}

function LoanCard({ account, balances, month, onEdit }: { account: Account; balances: Balance[]; month: MonthKey; onEdit: () => void }) {
  const [extra, setExtra] = useState('50')
  const now = balanceIn(balances, account.id, month)
  const owed = now?.cents ?? 0
  // Paid off so far: from the first balance noted.
  const first = balances.filter((b) => b.accountId === account.id).reduce<Balance | null>((min, b) => (!min || b.month < min.month ? b : min), null)
  const paidShare = first && first.cents > 0 ? Math.max(0, Math.min(1, 1 - owed / first.cents)) : 0
  const terms = account.loan
  if (!terms) {
    return (
      <article className="loan-card">
        <h3>{account.name}</h3>
        <p className="muted small">Still owed {plainAmount(owed)}.</p>
        <button type="button" onClick={onEdit}>
          <EditIcon /> Add its interest and payment
        </button>
      </article>
    )
  }
  const from = now?.month ?? month
  const plan = payoff(owed, terms.ratePct, terms.paymentCents, from)
  let extraCents = 0
  try {
    extraCents = readCents(extra, 'the extra amount') ?? 0
  } catch {
    extraCents = 0
  }
  const more = extraCents > 0 ? payMore(owed, terms, extraCents, from) : null
  return (
    <article className="loan-card">
      <div className="loan-head">
        <h3>{account.name}</h3>
        <span className="muted small">
          {terms.ratePct.toLocaleString('en', { maximumFractionDigits: 2 })}% a year, {plainAmount(terms.paymentCents)} on day {terms.day}
        </span>
      </div>
      {first && (
        <div className="loan-progress" title={`${Math.round(paidShare * 100)}% paid off since ${monthLabel(first.month)}`}>
          <span style={{ width: `${paidShare * 100}%` }} />
        </div>
      )}
      <dl className="loan-facts">
        <div>
          <dt>Still owed</dt>
          <dd>{plainAmount(owed)}</dd>
        </div>
        <div>
          <dt>Paid off</dt>
          <dd>{owed <= 0 ? 'Done' : plan.endMonth ? shortMonth(plan.endMonth) : 'Never'}</dd>
          {plan.months !== null && owed > 0 && <span className="muted small">in {duration(plan.months)}</span>}
        </div>
        <div>
          <dt>Interest to go</dt>
          <dd>{plainAmount(plan.interestCents)}</dd>
        </div>
      </dl>
      {plan.months === null && owed > 0 ? (
        <p className="error small">The payment doesn’t cover the interest, so what’s owed keeps growing.</p>
      ) : (
        owed > 0 && (
          <div className="loan-more">
            <label>
              Pay{' '}
              <input inputMode="decimal" aria-label={`Extra a month for ${account.name}`} value={extra} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setExtra(e.target.value)} />{' '}
              more a month
            </label>
            {more && more.sooner > 0 ? (
              <p>
                Paid off in <strong>{shortMonth(more.endMonth!)}</strong>, <strong>{duration(more.sooner)} sooner</strong>
                {more.savedCents > 0 && (
                  <>
                    , with <strong>{plainAmount(more.savedCents)}</strong> less interest
                  </>
                )}
                .
              </p>
            ) : (
              <p className="muted">{extraCents > 0 ? 'Not enough to end it a month sooner.' : 'Type an amount to see how much sooner it ends.'}</p>
            )}
          </div>
        )
      )}
    </article>
  )
}

/** Own, owe and net worth per month, as lines. */
function WorthChart({ points }: { points: WorthPoint[] }) {
  const width = 800
  const height = 220
  const left = 64
  const right = 12
  const top = 12
  const bottom = 28
  const values = points.flatMap((p) => [p.own, p.owe, p.net])
  // Round steps (1, 2 or 5 × 10ⁿ) so the axis reads 0, 10,000, 20,000…
  const raw = (Math.max(0, ...values) - Math.min(0, ...values)) / 3 || 100
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 5, 10].find((f) => f * magnitude >= raw) ?? 10) * magnitude
  const max = Math.ceil(Math.max(0, ...values) / step) * step
  const min = Math.floor(Math.min(0, ...values) / step) * step
  const span = max - min || 1
  const x = (i: number) => (points.length === 1 ? (left + width - right) / 2 : left + (i / (points.length - 1)) * (width - left - right))
  const y = (cents: number) => top + ((max - cents) / span) * (height - top - bottom)
  const ticks = Array.from({ length: Math.round(span / step) + 1 }, (_, n) => min + n * step)
  const line = (key: 'own' | 'owe' | 'net') => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ')
  return (
    <svg className="worth-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Own, owe and net worth per month">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={width - right} y1={y(t)} y2={y(t)} className="grid" />
          <text x={left - 8} y={y(t) + 4} textAnchor="end">
            {signed(t).replace(/[.,]00$/, '')}
          </text>
        </g>
      ))}
      {points.map((p, i) => (
        <text key={p.month} x={x(i)} y={height - 8} textAnchor="middle">
          {monthLabel(p.month, 'month')}
        </text>
      ))}
      {(['own', 'owe', 'net'] as const).map((key) => (
        <g key={key} className={key}>
          <path d={line(key)} />
          {points.map((p, i) => (
            <circle key={p.month} cx={x(i)} cy={y(p[key])} r={key === 'net' ? 4 : 3}>
              <title>
                {monthLabel(p.month)}: {key === 'net' ? 'net worth' : key} {signed(p[key])}
              </title>
            </circle>
          ))}
        </g>
      ))}
    </svg>
  )
}

const centsText = (cents: number | null | undefined) => (cents === null || cents === undefined ? '' : (cents / 100).toFixed(2).replace(/\.00$/, ''))

function readCents(text: string, what: string): number | null {
  const t = text.trim().replace(',', '.')
  if (t === '') return null
  const cents = Math.round(Number(t) * 100)
  if (!Number.isFinite(cents) || cents < 0) throw new Error(`Type ${what} as a number without a minus, like 1250.50.`)
  return cents
}

/** Add an account, or change its name or type. */
function AccountDialog({ account, categories, month, onClose }: { account: Account | undefined; categories: Category[]; month: MonthKey; onClose: () => void }) {
  const [name, setName] = useState(account?.name ?? '')
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'bank')
  const [bankName, setBankName] = useState(account?.bankName ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(account?.categoryId ?? null)
  const [rate, setRate] = useState(account?.loan ? String(account.loan.ratePct) : '')
  const [payment, setPayment] = useState(centsText(account?.loan?.paymentCents))
  const [day, setDay] = useState(String(account?.loan?.day ?? 1))
  // The names a Revolut statement uses: the main account, the savings account and your pockets.
  const bankNames = useLiveQuery(async () => {
    const names = new Set(['Personal Account', 'Savings'])
    for (const p of await db.pockets.toArray()) names.add(p.name)
    for (const a of await db.accounts.toArray()) if (a.bankName) names.add(a.bankName)
    return [...names]
  }, [])
  const [start, setStart] = useState('')
  const { error, run } = useErrorMessage()
  const owed = sideOf(kind) === 'owe'
  // Revolut statements hold a main account, pockets and savings.
  const linkable = kind === 'bank' || kind === 'pocket' || kind === 'savings'
  // Savings and investments fill up from a Savings category; a loan's payments come from an Expenses one.
  const categoryBlock: Block | null = owed ? 'expenses' : kind === 'savings' || kind === 'investment' || kind === 'otherOwn' ? 'savings' : null
  const pickedCategory = categoryBlock && categories.find((c) => c.id === categoryId)?.block === categoryBlock ? categoryId : null
  const terms = (): LoanTerms | null => {
    const paymentCents = readCents(payment, 'the monthly payment')
    if (!hasTerms(kind) || paymentCents === null) return null
    const ratePct = rate.trim() === '' ? 0 : Number(rate.trim().replace(',', '.').replace('%', ''))
    if (!Number.isFinite(ratePct) || ratePct < 0) throw new Error('Type the interest as a percentage, like 3.5.')
    return { ratePct, paymentCents, day: Number(day) }
  }
  return (
    <Popup title={account ? `Edit ${account.name}` : 'New account'} onClose={onClose} className="small-dialog">
      <form
        className="wish-form"
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            await saveAccount(
              {
                name,
                kind,
                bankName: linkable ? bankName || null : null,
                categoryId: pickedCategory,
                loan: terms(),
                startCents: account ? undefined : readCents(start, 'the balance'),
                month,
              },
              account?.id,
            )
            onClose()
          })
        }}
      >
        {error && <p className="error">{error}</p>}
        <label className="wish-field wide">
          <span>Name</span>
          <input autoFocus required placeholder="Current account, student loan…" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="wish-field">
          <span>Type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
            {(['own', 'owe'] as const).map((side) => (
              <optgroup key={side} label={side === 'own' ? 'You own' : 'You owe'}>
                {ACCOUNT_KINDS[side].map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {linkable && (
          <label className="wish-field">
            <span>
              Revolut account{' '}
              <Info>
                Link it to an account or pocket in your Revolut statement: importing the statement in Tracking then fills in its
                balances here. Pockets and accounts not linked yet are added on their own when you import.
              </Info>
            </span>
            <select value={bankName} onChange={(e) => setBankName(e.target.value)}>
              <option value="">Not linked</option>
              {bankNames?.map((n) => (
                <option key={n} value={n}>
                  {n === 'Personal Account' ? 'Main account' : n}
                </option>
              ))}
            </select>
          </label>
        )}
        {categoryBlock && (
          <label className="wish-field">
            <span>
              {owed ? 'Paid from' : 'Saved through'}{' '}
              <Info>
                {owed
                  ? 'The Expenses category its payments are tracked in. Upcoming then leaves the payment to Tracking.'
                  : 'The Savings category you track what goes in (and comes out) with. Update balances then suggests the new balance from it.'}
              </Info>
            </span>
            <CategorySelect
              label={owed ? 'Paid from' : 'Saved through'}
              categories={categories}
              blocks={[categoryBlock]}
              placeholder="No category"
              value={pickedCategory}
              onChange={(c) => setCategoryId(c?.categoryId ?? null)}
            />
          </label>
        )}
        {hasTerms(kind) && (
          <>
            <label className="wish-field">
              <span>
                Monthly payment <Info>What you pay off each month. With it, Pulse works out when it’s paid off and adds the payment to Upcoming.</Info>
              </span>
              <input inputMode="decimal" placeholder="0.00" value={payment} onChange={(e) => setPayment(e.target.value)} />
            </label>
            <label className="wish-field">
              <span>Interest a year (%)</span>
              <input inputMode="decimal" placeholder="0" value={rate} onChange={(e) => setRate(e.target.value)} />
            </label>
            <label className="wish-field">
              <span>Paid on day</span>
              <select value={day} onChange={(e) => setDay(e.target.value)}>
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {!account && (
          <label className="wish-field">
            <span>
              {owed ? 'Still owed now' : 'Balance now'} <Info>What it holds this month. You can also leave it empty and fill it in with Update balances.</Info>
            </span>
            <input inputMode="decimal" placeholder="0.00" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
        )}
        <div className="wish-actions wide">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {account ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </Popup>
  )
}

/** Every account's balance for one month, with the last known one filled in. */
function UpdateDialog({
  accounts,
  balances,
  categories,
  transactions,
  month,
  onClose,
}: {
  accounts: Account[]
  balances: Balance[]
  categories: Category[]
  transactions: Transaction[]
  month: MonthKey
  onClose: () => void
}) {
  const [picked, setPicked] = useState<MonthKey>(month)
  const suggested = (a: Account, m: MonthKey) => (balanceIn(balances, a.id, m)?.month === m ? null : suggestBalance(a, balances, m, transactions, categories))
  // A balance already noted that month; else one worked out from Tracking or the loan; else the last one.
  const filled = (m: MonthKey) => Object.fromEntries(accounts.map((a) => [a.id, centsText(suggested(a, m)?.cents ?? balanceIn(balances, a.id, m)?.cents)]))
  const [values, setValues] = useState<Record<string, string>>(() => filled(month))
  const { error, run } = useErrorMessage()
  const months = Array.from({ length: 12 }, (_, i) => addMonths(month, -i))
  return (
    <Popup title="Update balances" onClose={onClose} className="small-dialog worth-update">
      <form
        className="wish-form"
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            const entries = accounts.map((a) => ({ accountId: a.id, cents: readCents(values[a.id] ?? '', `${a.name}'s balance`) }))
            await setBalances(picked, entries)
            onClose()
          })
        }}
      >
        {error && <p className="error">{error}</p>}
        <label className="wish-field wide">
          <span>Month</span>
          <select
            value={picked}
            onChange={(e) => {
              setPicked(e.target.value)
              setValues(filled(e.target.value))
            }}
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </label>
        <table className="worth-update-table wide">
          {(['own', 'owe'] as const).map((side) => {
            const list = accounts.filter((a) => sideOf(a.kind) === side)
            if (list.length === 0) return null
            return (
              <tbody key={side}>
                <tr>
                  <th colSpan={3} className={`worth-update-side ${side}`}>
                    {side === 'own' ? 'You own' : 'You owe'}
                  </th>
                </tr>
                {list.map((a) => {
                  const last = balanceIn(balances, a.id, addMonths(picked, -1))
                  const hint = suggested(a, picked)
                  return (
                    <tr key={a.id}>
                      <td>{a.name}</td>
                      <td className="muted small num">
                        {last ? `${monthLabel(last.month, 'month')}: ${plainAmount(last.cents)}` : 'new'}
                        {hint && (
                          <span
                            className="worth-suggested"
                            title={hint.from === 'loan' ? 'Worked out from the loan’s interest and monthly payment' : 'Worked out from what Tracking shows going in and out of its category'}
                          >
                            {change(hint.changeCents)} {hint.from === 'loan' ? 'after payment' : 'tracked'}
                          </span>
                        )}
                      </td>
                      <td>
                        <input
                          inputMode="decimal"
                          aria-label={`${a.name} in ${monthLabel(picked)}`}
                          placeholder="0.00"
                          value={values[a.id] ?? ''}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => setValues({ ...values, [a.id]: e.target.value })}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            )
          })}
        </table>
        <div className="wish-actions wide">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Save
          </button>
        </div>
      </form>
    </Popup>
  )
}
