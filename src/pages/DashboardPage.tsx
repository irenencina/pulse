import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Info from '../components/Info'
import ScopePickers from '../components/ScopePickers'
import { ChartIcon, FlaskIcon } from '../components/icons'
import { getSettings, updateSettings } from '../db/actions'
import { db } from '../db/db'
import { computePlan } from '../domain/budget'
import { monthBars, periodCompletion, savingsRate, topSlices } from '../domain/dashboard'
import { otherLabel } from '../domain/categories'
import { categoryProgress, type CategoryProgress } from '../domain/progress'
import { LAB_TITLE, pretendTransactions } from '../domain/lab'
import { formatMoney } from '../domain/money'
import { safetyLevel, safetyNet } from '../domain/safetyNet'
import { DEFAULT_SCOPE, scopeMonths, type Scope } from '../domain/scope'
import { countsFor, trackedTotals } from '../domain/transactions'
import { BLOCKS, BLOCK_LABELS, type Block } from '../domain/types'
import { Donut, MonthChart } from './dashboard/Charts'
import { monthLabel, plainAmount, todayIso } from './tracking/format'

const pct = (x: number) => `${Math.round(x * 100)}%`

export default function DashboardPage() {
  const settings = useLiveQuery(() => getSettings(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const realTransactions = useLiveQuery(() => db.transactions.toArray(), [])
  const cells = useLiveQuery(() => db.budgetCells.toArray(), [])
  const labEntries = useLiveQuery(() => db.labEntries.toArray(), [])
  const [scope, setScope] = useState<Scope>(DEFAULT_SCOPE)
  const [chartBlock, setChartBlock] = useState<Block>('expenses')
  const navigate = useNavigate()
  if (!settings || !categories || !realTransactions || !cells || !labEntries) return null

  const today = todayIso()
  // With the playground on, its pretend amounts from today on are added as a forecast.
  const pretend = settings.dashPlayground
    ? pretendTransactions(labEntries, categories, realTransactions, { columns: settings.labColumns, weekStart: settings.labWeekStart }, today, settings)
    : []
  const transactions = pretend.length > 0 ? [...realTransactions, ...pretend] : realTransactions
  const thisMonth = today.slice(0, 7)
  const months = scopeMonths(scope, thisMonth)
  const year = Number(months[0]!.slice(0, 4))
  const single = months.length === 1 ? months[0]! : null
  const scopeName = single ? monthLabel(single) : String(year)
  const years = [
    ...new Set([settings.startingYear, Number(thisMonth.slice(0, 4)), ...transactions.map((t) => Number(countsFor(t, settings).slice(0, 4)))]),
  ].sort((x, y) => y - x)

  const tracked = trackedTotals(transactions, months, settings)
  const pretendTotals = trackedTotals(pretend, months, settings)
  const planTotals = computePlan(categories, cells, settings, year).totals.filter((t) => months.includes(t.month))
  const planned = Object.fromEntries(BLOCKS.map((b) => [b, planTotals.reduce((sum, t) => sum + t[b], 0)])) as Record<Block, number>
  const completion = periodCompletion(months, today, settings)
  const balance = tracked.income - tracked.expenses - tracked.savings
  const rate = savingsRate(tracked, settings.savingsRateMode)
  const progress = categoryProgress(categories, cells, transactions, settings, months)
  const uncategorised = Object.fromEntries(BLOCKS.map((b) => [b, 0])) as Record<Block, number>
  for (const t of transactions) {
    if (t.categoryId === null && months.includes(countsFor(t, settings))) uncategorised[t.block] += t.cents
  }
  const bars = monthBars(categories, cells, transactions, settings, year)
  const pretendBars = Object.fromEntries(bars.map((b) => [b.month, trackedTotals(pretend, b.month, settings)]))

  return (
    <section className={`page wide dashboard${settings.dashPlayground ? ' pretend-on' : ''}`}>
      <div className="page-head">
        <h1>
          Dashboard{' '}
          <Info>
            Your tracked money against the plan for the period picked on the right: a month, or the whole year. Amounts
            count for the month they belong to, after the late-income shift. The switch next to Year adds the
            playground's pretend amounts from today on, as a forecast.
          </Info>
        </h1>
        {settings.dashPlayground && (
          <p className="forecast-note small" role="note">
            <span aria-hidden="true">⚠</span> Not your actual tracking: includes pretend {LAB_TITLE.toLowerCase()} amounts (striped
            <span className="stripe-swatch" aria-hidden="true" />)
            {pretend.length === 0 && `, but there are none yet`}
          </p>
        )}
        <div className="head-tools">
          <div className="mode-switch">
            <span className={`mode-icon${settings.dashPlayground ? '' : ' active'}`} title="Real tracking" aria-hidden="true">
              <ChartIcon />
            </span>
            <button
              type="button"
              role="switch"
              className="slide-toggle"
              aria-checked={settings.dashPlayground}
              aria-label={`Add the ${LAB_TITLE.toLowerCase()}'s pretend amounts`}
              title={
                settings.dashPlayground
                  ? `Showing real tracking plus the ${LAB_TITLE.toLowerCase()}'s pretend amounts from today on. Slide left for real tracking only.`
                  : `Showing real tracking only. Slide right to add the ${LAB_TITLE.toLowerCase()}'s pretend amounts from today on, as a forecast.`
              }
              onClick={() => void updateSettings({ dashPlayground: !settings.dashPlayground })}
            >
              <span className="slide-knob" aria-hidden="true" />
            </button>
            <span className={`mode-icon pretend${settings.dashPlayground ? ' active' : ''}`} title={LAB_TITLE} aria-hidden="true">
              <FlaskIcon />
            </span>
          </div>
          <ScopePickers scope={scope} onChange={setScope} years={years} settings={settings} year={year} />
        </div>
      </div>

      <SafetyNetCard net={safetyNet(categories, cells, realTransactions, settings, today)} onChoose={() => navigate('/categories')} />

      <div className="dash-kpis">
        <div className="kpi">
          <span className="kpi-label">
            Period passed{' '}
            <Info>Days passed ÷ days in {scopeName}. Compare it with how much of each budget is used.</Info>
          </span>
          <strong>{pct(completion)}</strong>
          <span className="bar" aria-hidden="true">
            <span style={{ width: pct(completion) }} />
          </span>
        </div>
        {BLOCKS.map((block) => (
          <div key={block} className={`kpi block-${block}`}>
            <span className="kpi-label">{BLOCK_LABELS[block]}</span>
            <strong>{plainAmount(tracked[block])}</strong>
            <span className="muted small">
              of {plainAmount(planned[block])} planned{planned[block] > 0 && ` · ${pct(tracked[block] / planned[block])}`}
            </span>
            <KpiProgress tracked={tracked[block]} pretend={pretendTotals[block]} planned={planned[block]} />
          </div>
        ))}
        <div className={`kpi${balance < 0 ? ' negative' : ''}`}>
          <span className="kpi-label">
            Balance <Info>Income − expenses − savings tracked in {scopeName}: what is left without a place yet.</Info>
          </span>
          <strong>{balance < 0 ? `−${plainAmount(-balance)}` : plainAmount(balance)}</strong>
          <span className="muted small">{balance < 0 ? 'more out than in' : 'not yet given a place'}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">
            Savings rate{' '}
            <Info>
              {settings.savingsRateMode === 'allocated'
                ? 'Active: what you put into savings ÷ income. Change it in Settings, under Savings.'
                : 'Passive: (income − expenses) ÷ income. Change it in Settings, under Savings.'}
            </Info>
          </span>
          <strong>{rate === null ? '–' : pct(rate)}</strong>
          <span className="muted small">{settings.savingsRateMode === 'allocated' ? 'active' : 'passive'}</span>
        </div>
      </div>

      <div className="dash-charts">
        {BLOCKS.map((block) => (
          <Donut key={block} block={block} slices={topSlices(progress[block], uncategorised[block])} planned={planned[block]} />
        ))}
      </div>

      <section className="dash-panel">
        <div className="dash-panel-head">
          <h2>
            Planned vs Tracked per month in {year}{' '}
            <Info>Light bars are planned, solid bars are tracked. The month you picked is highlighted; click a month to open it.</Info>
          </h2>
          <div className="view-tabs" role="tablist" aria-label="Block">
            {BLOCKS.map((b) => (
              <button
                key={b}
                type="button"
                role="tab"
                className={`view-tab block-${b}`}
                aria-selected={chartBlock === b}
                onClick={() => setChartBlock(b)}
              >
                {BLOCK_LABELS[b]}
              </button>
            ))}
          </div>
        </div>
        <MonthChart
          bars={bars}
          pretend={pretendBars}
          block={chartBlock}
          picked={single ? [single] : []}
          onPick={(m) => setScope({ ...scope, period: Number(m.slice(5)) })}
        />
      </section>

      <section className="dash-panel">
        <h2>Categories in {scopeName}</h2>
        <CategoryTable rows={progress} completion={completion} />
      </section>
    </section>
  )
}

/** Tracked, budget, % completed, remaining and excess per category, like the spreadsheet's dashboard. */
function CategoryTable({ rows, completion }: { rows: Record<Block, CategoryProgress[]>; completion: number }) {
  if (BLOCKS.every((b) => rows[b].length === 0)) return <p className="muted small">Nothing planned or tracked yet.</p>
  return (
    <div className="grid-scroll">
      <table className="progress-table dash-table">
        <thead>
          <tr>
            <th>Category</th>
            <th className="num">Tracked</th>
            <th className="num">Budget</th>
            <th>Completed</th>
            <th className="num">Remaining</th>
            <th className="num">Excess</th>
          </tr>
        </thead>
        {BLOCKS.filter((b) => rows[b].length > 0).map((block) => (
          <tbody key={block} className={`block-${block}`}>
            <tr className="block-row block-head">
              <th colSpan={6}>{BLOCK_LABELS[block]}</th>
            </tr>
            {rows[block].map((r, i) => {
              const parent = (rows[block][i + 1]?.depth ?? -1) > r.depth
              const done = r.planned > 0 ? r.tracked / r.planned : null
              // Spending faster than the period passes is worth a look; for income and savings, more is fine.
              const ahead = block === 'expenses' && done !== null && done > completion + 0.1
              return (
                <tr key={r.other ? `${r.category.id}:other` : r.category.id} className={[r.left < 0 && block === 'expenses' ? 'over' : '', parent ? 'parent' : '', r.other ? 'other-row' : ''].join(' ').trim() || undefined}>
                  <td style={{ paddingLeft: `${0.5 + r.depth * 1.2}rem` }}>{r.other ? otherLabel(r.category.name) : r.category.name}</td>
                  <td className="num">{plainAmount(r.tracked)}</td>
                  <td className="num">{plainAmount(r.planned)}</td>
                  <td className="done-cell">
                    <span className="bar" aria-hidden="true">
                      <span style={{ width: `${Math.round(Math.min(1, done ?? 1) * 100)}%` }} />
                      <i className="pace" style={{ left: `${Math.round(completion * 100)}%` }} />
                    </span>
                    <span className={`small${ahead ? ' ahead' : ''}`} title={ahead ? 'Used faster than the period is passing' : undefined}>
                      {done === null ? '–' : pct(done)}
                    </span>
                  </td>
                  <td className="num">{plainAmount(Math.max(0, r.left))}</td>
                  <td className={`num${r.left < 0 ? ' excess' : ''}`}>{r.left < 0 ? plainAmount(-r.left) : '–'}</td>
                </tr>
              )
            })}
          </tbody>
        ))}
      </table>
    </div>
  )
}

/** Tracked against planned; the share that comes from the playground is striped. */
function KpiProgress({ tracked, pretend, planned }: { tracked: number; pretend: number; planned: number }) {
  const whole = Math.max(planned, tracked)
  const real = tracked - pretend
  const share = (cents: number) => (whole > 0 ? `${(cents / whole) * 100}%` : '0%')
  const tip = [
    `${plainAmount(real)} tracked`,
    pretend > 0 && `${plainAmount(pretend)} pretend from the ${LAB_TITLE.toLowerCase()} (${pct(pretend / tracked)})`,
    `${plainAmount(planned)} planned`,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <span className={`kpi-progress${tracked > planned ? ' over' : ''}`} title={tip} role="img" aria-label={tip}>
      <span className="real" style={{ width: share(real) }} />
      {pretend > 0 && <span className="pretend" style={{ width: share(pretend) }} />}
      {tracked > planned && planned > 0 && <span className="plan-mark" style={{ left: share(planned) }} />}
    </span>
  )
}

/** How many months the safety net covers the spending you can't avoid. Always as of today, whatever period is picked. */
function SafetyNetCard({ net, onChoose }: { net: ReturnType<typeof safetyNet>; onChoose: () => void }) {
  const level = safetyLevel(net.months)
  const months = net.months === null ? null : net.months >= 10 ? Math.round(net.months).toString() : net.months.toFixed(1)
  return (
    <section className={`safety-net ${level}`} aria-label="Safety net">
      <div className="safety-main">
        <span className="kpi-label">
          Safety net{' '}
          <Info>
            If your income stopped today, how long the money set aside would cover the spending you can't avoid. The net is
            the Main Pot plus {net.funds.length > 0 ? net.funds.join(', ') : 'your safety-net savings'}, as planned to the end
            of this month. Essential spending is {net.essentials.length > 0 ? net.essentials.join(', ') : 'nothing yet'},{' '}
            {net.basis === 'tracked' ? `as tracked on average over the last ${net.trackedMonths} months` : 'as planned this year, until you have tracked two months'}.
            Under 1 month is red, up to 3 amber, and 6 or more green.
          </Info>
        </span>
        {months === null ? (
          <p className="safety-text">Tick the categories you can't do without to see how long your savings would last.</p>
        ) : (
          <p className="safety-text">
            Your safety net covers <strong>{months} {months === '1.0' ? 'month' : 'months'}</strong> of essential spending.
          </p>
        )}
        <span className="muted small">
          {formatMoney(net.netCents)}
          {net.monthlyCents > 0 && ` ÷ ${formatMoney(net.monthlyCents)} a month`}
        </span>
      </div>
      <button type="button" onClick={onChoose} title="Pick which categories are essential, and which savings are your safety net, in Settings → Categories">
        Choose categories
      </button>
    </section>
  )
}
