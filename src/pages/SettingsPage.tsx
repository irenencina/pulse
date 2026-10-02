import { useLiveQuery } from 'dexie-react-hooks'
import type { ReactNode } from 'react'
import { getSettings, updateSettings } from '../db/actions'
import type { CarryOverMode, SavingsRateMode, Settings } from '../domain/types'

export default function SettingsPage() {
  const settings = useLiveQuery(() => getSettings(), [])
  if (!settings) return null
  const set = (patch: Partial<Settings>) => void updateSettings(patch)

  return (
    <section className="page narrow">
      <h1>Settings</h1>

      <fieldset>
        <legend>General</legend>
        <Field label="Starting year" help="The first year shown in the planner. Set it once at the beginning.">
          <select value={settings.startingYear} onChange={(e) => set({ startingYear: Number(e.target.value) })}>
            {yearOptions(settings.startingYear).map((year) => (
              <option key={year}>{year}</option>
            ))}
          </select>
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
          help="What happens to unspent budget in an expense category at the end of the month. Each category can override this on the Categories page."
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
    </section>
  )
}

function yearOptions(selected: number): number[] {
  const now = new Date().getFullYear()
  const from = Math.min(selected, now - 10)
  const to = Math.max(selected, now + 5)
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

function Field({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-control">{children}</span>
      <span className="field-help">{help}</span>
    </label>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <span className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {checked ? 'On' : 'Off'}
    </span>
  )
}
