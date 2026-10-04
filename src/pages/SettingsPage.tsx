import { useLiveQuery } from 'dexie-react-hooks'
import type { ReactNode } from 'react'
import Info from '../components/Info'
import { getSettings, togglePocketCategory, updateSettings } from '../db/actions'
import { db } from '../db/db'
import PocketLinks from './tracking/PocketLinks'
import type { CarryOverMode, SavingsRateMode, Settings } from '../domain/types'

export default function SettingsPage() {
  const settings = useLiveQuery(() => getSettings(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const pockets = useLiveQuery(() => db.pockets.toArray(), [])
  const usedPockets = useLiveQuery(async () => {
    const names = new Set<string>()
    await db.transactions.each((t) => t.pocket && names.add(t.pocket))
    return [...names]
  }, [])
  if (!settings || !categories || !pockets || !usedPockets) return null
  const pocketNames = [...new Set([...pockets.map((p) => p.name), ...usedPockets])].sort()
  const set = (patch: Partial<Settings>) => void updateSettings(patch)

  return (
    <section className="page narrow">
      <h1>Settings</h1>

      <fieldset>
        <legend>General</legend>
        <Field
          label="Budget starts in"
          help="The month and year you start budgeting. Months before it are greyed out in the planner and count as zero, and the Main Pot and savings totals start counting from here."
        >
          <span className="field-pair">
            <select
              aria-label="Starting month"
              value={settings.startingMonth}
              onChange={(e) => set({ startingMonth: Number(e.target.value) })}
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label="Starting year"
              value={settings.startingYear}
              onChange={(e) => set({ startingYear: Number(e.target.value) })}
            >
              {yearOptions(settings.startingYear).map((year) => (
                <option key={year}>{year}</option>
              ))}
            </select>
          </span>
        </Field>
        <Field label="Currency" help="Only euro for now. More currencies can be added later.">
          <select value={settings.currency} disabled>
            <option value="EUR">Euro (€)</option>
          </select>
        </Field>
      </fieldset>

      <fieldset>
        <legend>Late monthly income</legend>
        <Field
          label="Shift late income"
          help="Income received on or after a certain day counts for the next month. Useful if your salary arrives near the end of the month and pays for the next one."
        >
          <Toggle checked={settings.shiftLateIncome} onChange={(v) => set({ shiftLateIncome: v })} />
        </Field>
        <Field label="Starting on day" help="Income on this day of the month or later is shifted.">
          <select
            disabled={!settings.shiftLateIncome}
            value={settings.lateIncomeDay}
            onChange={(e) => set({ lateIncomeDay: Number(e.target.value) })}
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <option key={day}>{day}</option>
            ))}
          </select>
        </Field>
      </fieldset>

      <fieldset>
        <legend>Saving and dissaving</legend>
        <Field label="Save non-allocated" help="Whatever is left of your income after expenses and savings goes to the Main Pot automatically.">
          <Toggle checked={settings.saveNonAllocated} onChange={(v) => set({ saveNonAllocated: v })} />
        </Field>
        <Field label="Allow dissaving" help="Let the Main Pot cover months where expenses are bigger than income.">
          <Toggle checked={settings.allowDissaving} onChange={(v) => set({ allowDissaving: v })} />
        </Field>
        <Field
          label="Leftover expense budget"
          help="What happens to unspent budget in an expense category at the end of the month. Each expense category can choose its own on the Categories page; Default there means this setting."
        >
          <select
            value={settings.carryOverDefault}
            onChange={(e) => set({ carryOverDefault: e.target.value as CarryOverMode })}
          >
            <option value="carry">Stays in the category (save up inside it)</option>
            <option value="toMainPot">Goes to the Main Pot</option>
          </select>
        </Field>
      </fieldset>

      <fieldset>
        <legend>Dashboard</legend>
        <Field
          label="Savings rate"
          help="Active: what you put into savings ÷ income. Passive: (income − expenses) ÷ income, so everything not spent counts as saved."
        >
          <select
            value={settings.savingsRateMode}
            onChange={(e) => set({ savingsRateMode: e.target.value as SavingsRateMode })}
          >
            <option value="allocated">Active: % allocated to savings</option>
            <option value="notSpent">Passive: % not spent on expenses</option>
          </select>
        </Field>
      </fieldset>

      {pocketNames.length > 0 && (
        <fieldset>
          <legend>
            Revolut pockets{' '}
            <Info>
              The categories each pocket's money is for. Imported payments from a pocket linked to one category get
              that category; with several, they are offered first.
            </Info>
          </legend>
          <PocketLinks
            names={pocketNames}
            pockets={pockets}
            categories={categories}
            onToggle={(name, id, linked) => void togglePocketCategory(name, id, linked)}
          />
        </fieldset>
      )}
    </section>
  )
}

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString(undefined, { month: 'long' }))

function yearOptions(selected: number): number[] {
  const now = new Date().getFullYear()
  const from = Math.min(selected, now - 10)
  const to = Math.max(selected, now + 5)
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

function Field({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return (
    <div className="field">
      <span className="field-label">
        {label} <Info>{help}</Info>
      </span>
      <span className="field-control">{children}</span>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {checked ? 'On' : 'Off'}
    </label>
  )
}
