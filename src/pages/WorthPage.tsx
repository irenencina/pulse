import { useLiveQuery } from 'dexie-react-hooks'
import DateInput from '../components/DateInput'
import { useState } from 'react'
import CategorySelect from '../components/CategorySelect'
import ConfirmButton from '../components/ConfirmButton'
import Info from '../components/Info'
import Menu from '../components/Menu'
import { EditIcon, EyeIcon, GripIcon, PlusIcon, TrashIcon } from '../components/icons'
import { useErrorMessage } from '../components/useErrorMessage'
import { db } from '../db/db'
import { getSettings, updateSettings } from '../db/actions'
import { deleteAccount, saveAccount, setBalances } from '../db/worth'
import PocketBar from '../components/PocketBar'
import { topCategories } from '../domain/pocketBudgets'
import type { MonthKey } from '../domain/periods'
import type { Pocket, Transaction } from '../domain/transactions'
import type { Block, Category } from '../domain/types'
import {
  ACCOUNT_KINDS,
  KIND_LABELS,
  SIDE_LABELS,
  addMonths,
  balanceIn,
  estimateOwed,
  hasTerms,
  kindLabel,
  namesKind,
  lastUpdated,
  movePocket,
  payMore,
  pocketStatements,
  POCKET_COLOURS,
  pocketColour,
  type PocketStatement,
  payoff,
  sideOf,
  suggestBalance,
  worthHistory,
  lastNoted,
  worthIn,
  type Account,
  type AccountKind,
  type AccountSide,
  type Balance,
  type LoanTerms,
  type WorthPoint,
} from '../domain/worth'
import { dayLabel, monthLabel, plainAmount, todayIso } from './tracking/format'
import { Popup } from './wishlist/WishDialogs'

/** The local date of a moment, as "2026-10-09". */
const isoDay = (at: number) => {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const signed = (cents: number) => (cents < 0 ? `−${plainAmount(-cents)}` : plainAmount(cents))
const change = (cents: number) => (cents === 0 ? '±0' : cents > 0 ? `+${plainAmount(cents)}` : `−${plainAmount(-cents)}`)

/** What you own and what you owe, from a balance you note once a month. */
export default function WorthPage() {
  const accounts = useLiveQuery(() => db.accounts.orderBy('order').toArray(), [])
  const balances = useLiveQuery(() => db.balances.toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [])
  const pockets = useLiveQuery(() => db.pockets.toArray(), [])
  const cells = useLiveQuery(() => db.budgetCells.toArray(), [])
  const settings = useLiveQuery(() => getSettings(), [])
  const [editing, setEditing] = useState<Account | 'new' | 'newLoan' | null>(null)
  const [updating, setUpdating] = useState(false)
  const { error, run } = useErrorMessage()
  if (!accounts || !balances || !categories || !transactions || !pockets || !cells || !settings) return null

  const thisMonth = todayIso().slice(0, 7) as MonthKey
  const now = worthIn(accounts, balances, thisMonth)
  const before = worthIn(accounts, balances, addMonths(thisMonth, -1))
  const history = worthHistory(accounts, balances, thisMonth, Infinity)
  const updated = lastUpdated(balances)
  // The last statement import, else the last balance typed in.
  const noted = lastNoted(balances.filter((b) => b.imported)) ?? lastNoted(balances)
  const bySide = (side: AccountSide) => accounts.filter((a) => sideOf(a.kind) === side)
  const statements = pocketStatements(pockets, accounts, balances, transactions, thisMonth, settings.pocketOrder)

  return (
    <section className="page worth-page">
      <div className="page-head">
        <h1>
          Wealth{' '}
          <Info>
            First, the pocket check: whether each Revolut pocket holds what its categories still need this month. Below it, what
            you own and what you owe. Once a month, note what each account holds (or what is still owed) with Update
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

      {statements.length > 0 && <PocketCheckPanel statements={statements} pockets={pockets} categories={categories} colours={settings.pocketColours ?? {}} month={thisMonth} />}

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
              <span className="muted small">
                {noted?.notedAt !== undefined && `${noted.imported ? 'Imported' : 'Noted'} on ${dayLabel(isoDay(noted.notedAt))}`}
                {noted?.notedAt !== undefined && updated !== thisMonth && ', '}
                {updated !== thisMonth ? 'time for this month’s' : noted?.notedAt === undefined && 'up to date'}
              </span>
            </div>
          </div>

          {history.length > 0 && <OverTime history={history} />}

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

          <Loans accounts={accounts.filter((a) => hasTerms(a.kind))} balances={balances} month={thisMonth} onEdit={setEditing} onAdd={() => setEditing('newLoan')} run={run} />
        </>
      )}

      {editing && <AccountDialog account={typeof editing === 'string' ? undefined : editing} balanceNow={typeof editing === 'string' ? undefined : balanceIn(balances, editing.id, thisMonth)?.cents} startKind={editing === 'newLoan' ? 'loan' : 'bank'} categories={categories} month={thisMonth} onClose={() => setEditing(null)} />}
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
        {kindLabel(account)}
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

const COLOUR_NAMES: Record<string, string> = {
  '#1b2550': 'Navy',
  '#2bb673': 'Income green',
  '#e5197d': 'Expenses pink',
  '#2f6fd6': 'Savings blue',
  '#f59e0b': 'Orange',
  '#8b5cf6': 'Purple',
  '#14b8a6': 'Teal',
  '#ef6c4a': 'Coral',
  '#eab308': 'Yellow',
  '#64748b': 'Slate',
}

/** Each Revolut pocket's month as the bank shows it: start, put in, paid out (per category), in it now. */
function PocketCheckPanel({
  statements,
  pockets,
  categories,
  colours,
  month,
}: {
  statements: PocketStatement[]
  pockets: Pocket[]
  categories: Category[]
  colours: Record<string, string>
  month: MonthKey
}) {
  const name = (id: string) => categories.find((c) => c.id === id)?.name ?? ''
  // Drag a row by its handle (or use the arrow keys on it) to put the pockets in your own order.
  const [drag, setDrag] = useState<{ pocket: string; over: string | null; after: boolean } | null>(null)
  const [grabbed, setGrabbed] = useState<string | null>(null)
  const names = statements.map((c) => c.pocket)
  const linked = (pocket: string) => {
    const p = pockets.find((x) => x.name === pocket)
    return p ? topCategories(p, categories).map(name) : []
  }
  const shown = statements.find((c) => c.month)
  const asOf = statements.reduce<number | undefined>((max, c) => (c.asOf !== undefined && (max === undefined || c.asOf > max) ? c.asOf : max), undefined)
  const move = (pocket: string, target: string, after: boolean) => void updateSettings({ pocketOrder: movePocket(names, pocket, target, after) })
  const paint = (pocket: string, colour: string) => void updateSettings({ pocketColours: { ...colours, [pocket]: colour } })
  return (
    <section className="dash-panel pocket-check">
      <div className="dash-panel-head">
        <h2>
          Pocket check{' '}
          <Info>
            Each Revolut pocket's month as the bank shows it, from your statement imports. Start: what it held at the end of last
            month. Put in: top-ups and anything else that came in. Paid out: payments made from the pocket, split by the
            category you gave them in Tracking. In it now: what it holds. Start + put in − paid out = in it now. The bar is this
            month's money: what was paid out, then what's still in it, with the share paid out next to it; hover a row to split
            the payments by category, and the bar for start, put in and paid out. Your plan plays no part here: the Dashboard compares the pockets with their budgets. Click the
            colour next to a pocket to change it, and drag a pocket by the handle on its left to reorder.
          </Info>
        </h2>
        {shown?.month && (
          <span className="muted small">
            {monthLabel(shown.month)}
            {asOf !== undefined && ` · imported on ${dayLabel(isoDay(asOf))}`}
          </span>
        )}
      </div>
      <table className="progress-table pocket-table">
        <thead>
          <tr>
            <th>Pocket</th>
            <th className="num" title="What it holds, from your latest statement import">
              In it now
            </th>
            <th className="pocket-bar-cell" title="This month's money: paid out per category, and still in the pocket">
              Paid out
            </th>
          </tr>
        </thead>
        <tbody>
          {statements.map((c) => {
            const stale = c.month !== null && c.month !== month
            const i = names.indexOf(c.pocket)
            const colour = pocketColour(colours, c.pocket, i)
            const dropSide = drag && drag.pocket !== c.pocket && drag.over === c.pocket ? (drag.after ? ' drop-after' : ' drop-before') : ''
            return (
              <tr
                key={c.pocket}
                className={`${drag?.pocket === c.pocket ? 'dragging' : ''}${dropSide}`}
                draggable={grabbed === c.pocket}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', c.pocket)
                  setDrag({ pocket: c.pocket, over: null, after: false })
                }}
                onDragEnd={() => {
                  setDrag(null)
                  setGrabbed(null)
                }}
                onDragOver={(e) => {
                  if (!drag || drag.pocket === c.pocket) return
                  e.preventDefault()
                  const box = e.currentTarget.getBoundingClientRect()
                  const after = e.clientY > box.top + box.height / 2
                  if (drag.over !== c.pocket || drag.after !== after) setDrag({ ...drag, over: c.pocket, after })
                }}
                onDrop={(e) => {
                  if (!drag || drag.over === null) return
                  e.preventDefault()
                  move(drag.pocket, drag.over, drag.after)
                  setDrag(null)
                }}
              >
                <td className="pocket-name">
                  <span
                    className="grip"
                    role="button"
                    tabIndex={0}
                    aria-label={`Move ${c.pocket} (arrow keys)`}
                    title="Drag up or down to reorder (or use the arrow keys)"
                    onMouseDown={() => setGrabbed(c.pocket)}
                    onMouseUp={() => setGrabbed(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp' && i > 0) move(c.pocket, names[i - 1]!, false)
                      if (e.key === 'ArrowDown' && i < names.length - 1) move(c.pocket, names[i + 1]!, true)
                    }}
                  >
                    <GripIcon />
                  </span>
                  <Menu
                    label={`Colour of ${c.pocket}`}
                    title="Change its colour"
                    icon={<span />}
                    buttonClass="pocket-colour"
                    buttonStyle={{ background: colour }}
                    panelClass="menu colour-menu"
                    align="left"
                  >
                    {(close) => (
                      <>
                        <div className="colour-swatches">
                          {POCKET_COLOURS.map((sw) => (
                            <button
                              key={sw}
                              type="button"
                              className={`colour-swatch${sw === colour ? ' picked' : ''}`}
                              style={{ background: sw }}
                              title={COLOUR_NAMES[sw]}
                              aria-label={COLOUR_NAMES[sw]}
                              onClick={() => (close(), paint(c.pocket, sw))}
                            />
                          ))}
                        </div>
                        <label className="colour-custom">
                          <input type="color" value={colour} onChange={(e) => paint(c.pocket, e.target.value)} /> Any colour
                        </label>
                      </>
                    )}
                  </Menu>
                  <span className="pocket-title">
                    {c.pocket}
                    <span className="muted small pocket-cats">{linked(c.pocket).join(', ') || 'No categories linked'}</span>
                  </span>
                </td>
                {c.nowCents === null ? (
                  <td className="muted small pocket-none" colSpan={2}>
                    No balance yet: import a Revolut statement in Tracking.
                  </td>
                ) : (
                  <>
                    <td className="num">
                      {plainAmount(c.nowCents)}
                      {stale && <span className="worth-stale" title={`From your ${monthLabel(c.month!)} statement`}> ({monthLabel(c.month!, 'month')})</span>}
                    </td>
                    <td className="pocket-bar-cell done">
                      <StatementBar statement={c} colour={colour} name={(id) => (id === null ? 'Not sorted yet' : name(id))} />
                      <span className="small">{c.outCents + Math.max(0, c.nowCents) > 0 ? pct(c.outCents / (c.outCents + Math.max(0, c.nowCents))) : '–'}</span>
                    </td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

/** This month's money in a pocket: what was paid out (one pattern per category while the row is hovered), then what's still in it. */
function StatementBar({ statement: c, colour, name }: { statement: PocketStatement; colour: string; name: (id: string | null) => string }) {
  const now = Math.max(0, c.nowCents ?? 0)
  const kinds = c.out.map((_, i) => `spent p${i % 6}`)
  return (
    <PocketBar
      colour={colour}
      whole={c.outCents + now}
      label={`Paid out ${plainAmount(c.outCents)}, ${plainAmount(now)} still in it`}
      pieces={[...c.out.map((o, i) => ({ key: String(o.categoryId), cents: o.cents, kind: kinds[i]! })), { key: 'still', cents: now, kind: 'carried' }]}
      rows={[
        ...c.out.map((o, i) => ({ key: String(o.categoryId), swatch: kinds[i]!.replace('spent ', ''), text: name(o.categoryId), cents: o.cents })),
        { key: 'still', swatch: 'carried', text: 'Still in it', cents: now },
      ]}
      footer={c.startCents !== null && c.inCents !== null ? `Started with ${plainAmount(c.startCents)}, put in ${plainAmount(c.inCents)}, paid out ${plainAmount(c.outCents)}` : `Paid out ${plainAmount(c.outCents)}`}
    />
  )
}

/** "42%". */
const pct = (x: number) => `${Math.round(x * 100)}%`

/** "Aug 2035". */
const shortMonth = (m: MonthKey) => new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).toLocaleString(undefined, { month: 'short', year: 'numeric' })

/** "2y 3m", "11m", "1y". */
function duration(months: number): string {
  const years = Math.floor(months / 12)
  const rest = months % 12
  return [years ? `${years}y` : '', rest ? `${rest}m` : ''].filter(Boolean).join(' ') || 'this month'
}

/** Loans and other debts: when each is paid off, and what paying more would change. */
function Loans({
  accounts,
  balances,
  month,
  onEdit,
  onAdd,
  run,
}: {
  accounts: Account[]
  balances: Balance[]
  month: MonthKey
  onEdit: (a: Account) => void
  onAdd: () => void
  run: ReturnType<typeof useErrorMessage>['run']
}) {
  return (
    <section className="dash-panel">
      <h2>
        Loans{' '}
        <Info>
          When each loan is paid off at its monthly payment, and the interest still to pay until then. Try paying a little more a
          month to see how much sooner it ends: the eye button on a card shows it. Monthly payments also show in Upcoming until Tracking shows them. Add a loan with
          the card at the end, and edit or delete one from its ⋯ menu.
        </Info>
      </h2>
      <div className="loan-cards">
        {accounts.map((a) => (
          <LoanCard key={a.id} account={a} balances={balances} month={month} onEdit={() => onEdit(a)} run={run} />
        ))}
        <button type="button" className="loan-card loan-add" onClick={onAdd}>
          <PlusIcon /> Add a loan
        </button>
      </div>
    </section>
  )
}

function LoanCard({ account, balances, month, onEdit, run }: { account: Account; balances: Balance[]; month: MonthKey; onEdit: () => void; run: ReturnType<typeof useErrorMessage>['run'] }) {
  const [extra, setExtra] = useState('50')
  const [trying, setTrying] = useState(false)
  const now = balanceIn(balances, account.id, month)
  // With no balance noted, a loan you were already paying is worked out from what you borrowed and when.
  const estimated = now ? null : estimateOwed(account.loan, month)
  const owed = now?.cents ?? estimated ?? 0
  const unknown = !now && estimated === null
  // Paid off so far: from what was first borrowed, if you said, else from the first balance noted.
  const firstNoted = balances.filter((b) => b.accountId === account.id).reduce<Balance | null>((min, b) => (!min || b.month < min.month ? b : min), null)
  const first = account.loan?.borrowedCents
    ? { cents: account.loan.borrowedCents, month: account.loan.startMonth ?? null }
    : firstNoted && { cents: firstNoted.cents, month: firstNoted.month as MonthKey | null }
  const paidShare = first && first.cents > 0 ? Math.max(0, Math.min(1, 1 - owed / first.cents)) : 0
  const terms = account.loan
  const menu = (
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
  )
  if (!terms || unknown) {
    return (
      <article className="loan-card">
        <div className="loan-head">
          <h3>{account.name}</h3>
          {menu}
        </div>
        <p className="muted small">{unknown ? 'No balance noted yet.' : `Still owed ${plainAmount(owed)}.`}</p>
        <button type="button" onClick={onEdit}>
          <EditIcon /> {terms ? 'Add what’s still owed' : 'Add its interest and payment'}
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
  // Paying more only helps a loan that's being paid off.
  const canTry = owed > 0 && plan.months !== null
  return (
    <article className="loan-card">
      <div className="loan-head">
        <h3>{account.name}</h3>
        <span className="loan-tools">
          {canTry && (
            <button
              type="button"
              className="icon-button"
              aria-pressed={trying}
              aria-label={`Paying more on ${account.name}`}
              title={trying ? 'Hide what paying more would change' : 'See what paying more each month would change'}
              onClick={() => setTrying(!trying)}
            >
              <EyeIcon />
            </button>
          )}
          {menu}
        </span>
        <span className="muted small">
          {terms.ratePct.toLocaleString('en', { maximumFractionDigits: 2 })}% a year, {plainAmount(terms.paymentCents)} on day {terms.day}
        </span>
      </div>
      {first && (
        <div className="loan-progress" title={`${Math.round(paidShare * 100)}% of ${plainAmount(first.cents)} paid off${first.month ? ` since ${monthLabel(first.month)}` : ''}`}>
          <span style={{ width: `${paidShare * 100}%` }} />
        </div>
      )}
      {account.loan?.borrowedCents && (
        <span className="muted small loan-since">
          {Math.round(paidShare * 100)}% of {plainAmount(account.loan.borrowedCents)} repaid
          {account.loan.startMonth && ` since ${shortMonth(account.loan.startMonth)}`}
        </span>
      )}
      <dl className="loan-facts">
        <div>
          <dt>Still owed</dt>
          <dd title={estimated !== null ? 'Worked out from what you borrowed, when, the interest and the monthly payment. Note the real balance in Update balances.' : undefined}>
            {estimated !== null && '≈ '}
            {plainAmount(owed)}
          </dd>
          {estimated !== null && <span className="muted small">estimated</span>}
        </div>
        <div>
          <dt>Paid off</dt>
          <dd>{owed <= 0 ? 'Done' : plan.endMonth ? shortMonth(plan.endMonth) : 'Never'}</dd>
          {plan.months !== null && owed > 0 && <span className="muted small">in {duration(plan.months)}</span>}
        </div>
        <div>
          <dt>Interest left</dt>
          <dd>{plainAmount(plan.interestCents)}</dd>
        </div>
      </dl>
      {plan.months === null && owed > 0 ? (
        <p className="error small">The payment doesn’t cover the interest, so what’s owed keeps growing.</p>
      ) : (
        canTry &&
        trying && (
          <div className="loan-more">
            <label>
              Pay{' '}
              <input inputMode="decimal" aria-label={`Extra a month for ${account.name}`} value={extra} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setExtra(e.target.value)} />{' '}
              more a month
            </label>
            {more && more.sooner > 0 ? (
              <dl className="loan-facts loan-gain">
                <div>
                  <dt>Ends</dt>
                  <dd>{shortMonth(more.endMonth!)}</dd>
                </div>
                <div>
                  <dt>Sooner by</dt>
                  <dd>{duration(more.sooner)}</dd>
                </div>
                <div>
                  <dt title="Interest you no longer pay">Saved</dt>
                  <dd>{plainAmount(more.savedCents)}</dd>
                </div>
              </dl>
            ) : (
              <p className="muted">{extraCents > 0 ? 'Not enough to end it a month sooner.' : 'Type an amount to see how much sooner it ends.'}</p>
            )}
          </div>
        )
      )}
    </article>
  )
}

const SPANS = [
  { months: Infinity, label: 'All time' },
  { months: 12, label: 'Last 12m' },
  { months: 6, label: 'Last 6m' },
] as const

/** The chart of own, owe and net worth, over all months or the last few. */
function OverTime({ history }: { history: WorthPoint[] }) {
  const [span, setSpan] = useState<number>(Infinity)
  const points = span === Infinity ? history : history.slice(-span)
  return (
    <section className="dash-panel">
      <div className="dash-panel-head">
        <h2>
          Over time <Info>Each month's total, using the latest balance noted for every account by then.</Info>
        </h2>
        <div className="view-tabs" role="tablist" aria-label="Months shown">
          {SPANS.map((o) => (
            <button key={o.label} type="button" role="tab" className="view-tab" aria-selected={span === o.months} onClick={() => setSpan(o.months)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <span className="worth-legend">
        <span className="own">Own</span>
        <span className="owe">Owe</span>
        <span className="net">Net worth</span>
      </span>
      <WorthChart points={points} />
    </section>
  )
}

/** Own, owe and net worth per month, as lines. */
function WorthChart({ points }: { points: WorthPoint[] }) {
  const width = 800
  const height = 220
  const left = 64
  const right = 12
  const top = 12
  // A tick per month (a longer one each January) in every view. Over a year and a half the month names get crowded, so
  // only the years show; otherwise the year goes under the first month and under each January. The axis keeps the same
  // height either way, so switching views doesn't move the chart.
  const long = points.length > 18
  const bottom = 44
  const years: Array<{ year: string; from: number; to: number }> = []
  for (const [i, p] of points.entries()) {
    const yr = years[years.length - 1]
    if (yr?.year === p.month.slice(0, 4)) yr.to = i
    else years.push({ year: p.month.slice(0, 4), from: i, to: i })
  }
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
      <g className="year-axis">
        {points.map((p, i) => (
          <line key={p.month} x1={x(i)} x2={x(i)} y1={height - bottom} y2={height - bottom + (p.month.endsWith('-01') ? 10 : 4)} className={p.month.endsWith('-01') ? 'major' : 'minor'} />
        ))}
        {long
          ? years.map((yr) => (
              <text key={yr.year} x={(x(yr.from) + x(yr.to)) / 2} y={height - 6} textAnchor="middle" className="year">
                {yr.year}
              </text>
            ))
          : points.map((p, i) => (
              <g key={p.month}>
                <text x={x(i)} y={height - bottom + 22} textAnchor="middle">
                  {monthLabel(p.month, 'month')}
                </text>
                {(i === 0 || p.month.endsWith('-01')) && (
                  <text x={x(i)} y={height - 6} textAnchor="middle" className="year">
                    {p.month.slice(0, 4)}
                  </text>
                )}
              </g>
            ))}
      </g>
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
function AccountDialog({ account, balanceNow, startKind = 'bank', categories, month, onClose }: { account: Account | undefined; balanceNow?: number; startKind?: AccountKind; categories: Category[]; month: MonthKey; onClose: () => void }) {
  const [name, setName] = useState(account?.name ?? '')
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? startKind)
  const [kindName, setKindName] = useState(account?.kindName ?? '')
  const [bankName, setBankName] = useState(account?.bankName ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(account?.categoryId ?? null)
  const [rate, setRate] = useState(account?.loan ? String(account.loan.ratePct) : '')
  const [payment, setPayment] = useState(centsText(account?.loan?.paymentCents))
  const [day, setDay] = useState(String(account?.loan?.day ?? 1))
  const [borrowed, setBorrowed] = useState(centsText(account?.loan?.borrowedCents))
  const [startMonth, setStartMonth] = useState(account?.loan?.startMonth ?? '')
  // The names a Revolut statement uses: the main account, the savings account and your pockets.
  const bankNames = useLiveQuery(async () => {
    const names = new Set(['Personal Account', 'Savings'])
    for (const p of await db.pockets.toArray()) names.add(p.name)
    for (const a of await db.accounts.toArray()) if (a.bankName) names.add(a.bankName)
    return [...names]
  }, [])
  const [start, setStart] = useState(centsText(balanceNow))
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
    const borrowedCents = readCents(borrowed, 'what you first borrowed')
    return { ratePct, paymentCents, day: Number(day), ...(borrowedCents ? { borrowedCents } : {}), ...(startMonth ? { startMonth } : {}) }
  }
  // A loan you were already paying: what's still owed, worked out from what was borrowed and when.
  let estimate: number | null = null
  try {
    estimate = hasTerms(kind) ? estimateOwed(terms() ?? undefined, month) : null
  } catch {
    estimate = null
  }
  return (
    <Popup title={account ? `Edit ${account.name}` : startKind === 'loan' ? 'New loan' : 'New account'} onClose={onClose} className="small-dialog">
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
                kindName: namesKind(kind) ? kindName : null,
                startCents: account && start === centsText(balanceNow) ? undefined : readCents(start, 'the balance'),
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
          <input autoFocus required placeholder={startKind === 'loan' && !account ? 'Student loan, car loan…' : 'Current account, student loan…'} value={name} onChange={(e) => setName(e.target.value)} />
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
        {namesKind(kind) && (
          <label className="wish-field">
            <span>Your own type</span>
            <input placeholder={owed ? 'Owed to a friend, tax…' : 'Crypto, a deposit…'} value={kindName} onChange={(e) => setKindName(e.target.value)} />
          </label>
        )}
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
            <label className="wish-field">
              <span>
                Borrowed at the start{' '}
                <Info>
                  For a loan you’re already paying off: what you first borrowed and the month it started. The card then shows how
                  much of it is paid off so far. Leave them empty for a new loan.
                </Info>
              </span>
              <input inputMode="decimal" placeholder="Optional" value={borrowed} onChange={(e) => setBorrowed(e.target.value)} />
            </label>
            <label className="wish-field">
              <span>Started in</span>
              <DateInput mode="month" label="Started in" max={month} value={startMonth} onChange={setStartMonth} />
            </label>
          </>
        )}
        <label className="wish-field">
          <span>
            {owed ? 'Still owed now' : 'Balance now'}{' '}
            <Info>
              {owed
                ? 'What’s still owed this month. For a loan you were already paying, leave it empty to have it worked out from what you borrowed, when, the interest and the payment. Update balances keeps it current.'
                : 'What it holds this month. You can also leave it empty and fill it in with Update balances.'}
            </Info>
          </span>
          <input inputMode="decimal" placeholder={estimate !== null ? `About ${plainAmount(estimate)}` : '0.00'} value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
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
                            {!last ? `about ${plainAmount(hint.cents)} from its start` : `${change(hint.changeCents)} ${hint.from === 'loan' ? 'after payment' : 'tracked'}`}
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
