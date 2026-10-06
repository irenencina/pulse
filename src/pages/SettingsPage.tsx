import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import Info from '../components/Info'
import { getSettings, togglePocketCategory, updateSettings } from '../db/actions'
import { db } from '../db/db'
import { setLabWeekStart } from '../db/lab'
import { LAB_TITLE, weekStartOf } from '../domain/lab'
import { evalAmount } from '../domain/money'
import BackupPanel from './settings/BackupPanel'
import ShopCategories from './settings/ShopCategories'
import TagSettings from './settings/TagSettings'
import PocketLinks from './tracking/PocketLinks'
import type { CarryOverMode, SavingsRateMode, Settings } from '../domain/types'

export type SettingsTab = 'general' | 'months' | 'saving' | 'dashboard' | 'tags' | 'pockets' | 'shops' | 'lab' | 'backup'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'months', label: 'Late income' },
  { id: 'saving', label: 'Saving' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'tags', label: 'Tags' },
  { id: 'pockets', label: 'Revolut pockets' },
  { id: 'shops', label: 'Shop categories' },
  { id: 'lab', label: LAB_TITLE },
  { id: 'backup', label: 'Backup' },
]

/** Settings in a pop-up over the page, with a tab per topic on the left. Esc or a click outside closes it. */
export default function SettingsDialog({ initialTab = 'general', onClose }: { initialTab?: SettingsTab; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  useEffect(() => {
    const d = dialog.current
    if (d && !d.open) d.showModal()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="settings-dialog"
      aria-label="Settings"
      onClose={onClose}
      onClick={(e) => {
        // A click on the dimmed backdrop lands on the dialog itself.
        if (e.target === dialog.current) dialog.current.close()
      }}
    >
      <div className="settings-frame">
        <div className="settings-head">
          <h1>Settings</h1>
          <button
            type="button"
            className="icon-button"
            aria-label="Close settings"
            title="Close"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </div>
        <div className="settings-body">
          <div className="settings-tabs" role="tablist" aria-label="Settings" aria-orientation="vertical">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className="settings-tab"
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="settings-panel" role="tabpanel" aria-label={TABS.find((t) => t.id === tab)!.label}>
            {tab === 'tags' ? <TagSettings /> : tab === 'shops' ? <ShopCategories /> : tab === 'backup' ? <BackupPanel /> : <SettingsFields tab={tab} />}
          </div>
        </div>
      </div>
    </dialog>
  )
}

function SettingsFields({ tab }: { tab: SettingsTab }) {
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
    <>
      {tab === 'general' && (
        <>
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
        </>
      )}
      {tab === 'months' && (
        <>
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
          <Field
            label="Shift whole months in tracking"
            help={`Not only income: everything from day ${settings.lateIncomeDay} on counts for the next month in tracking, so a month runs from day ${settings.lateIncomeDay} to day ${settings.lateIncomeDay - 1 || 1} of the next. With day 24, October runs from 24 September to 23 October.`}
          >
            <Toggle
              checked={settings.shiftWholeMonth}
              disabled={!settings.shiftLateIncome}
              onChange={(v) => set({ shiftWholeMonth: v })}
            />
          </Field>
        </>
      )}
      {tab === 'saving' && (
        <>
          <Field
            label="Save non-allocated"
            help="Whatever is left of your income after expenses and savings goes to the Main Pot automatically, once every category of that month is filled in. Type 0 for a category with nothing planned: blank means not planned yet."
          >
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
        </>
      )}
      {tab === 'dashboard' && (
        <>
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
        </>
      )}
      {tab === 'lab' && (
        <>
          <Field label="Weeks start on" help={`The first day of each week column on the ${LAB_TITLE} page, where you try out a week-by-week budget with pretend money.`}>
            <select value={settings.labWeekStart} onChange={(e) => void setLabWeekStart(Number(e.target.value))}>
              {WEEKDAYS.map((name, day) => (
                <option key={name} value={day}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="First week" help="The week the playground starts in. Empty means the current week. The money at the start is typed on the Playground page itself.">
            <span className="field-pair">
              <input
                type="date"
                aria-label="A day in the first week"
                value={settings.labFirstWeek ?? ''}
                onChange={(e) => set({ labFirstWeek: e.target.value ? weekStartOf(e.target.value, settings.labWeekStart) : null })}
              />
            </span>
          </Field>
          <Field label="Red below" help="A week that starts with less than this shows in red.">
            <AmountInput label="Red below" cents={settings.labLow} onSave={(c) => set({ labLow: c })} />
          </Field>
          <Field label="Green above" help="A week that starts with more than this shows in green.">
            <AmountInput label="Green above" cents={settings.labHigh} onSave={(c) => set({ labHigh: c })} />
          </Field>
        </>
      )}
      {tab === 'pockets' &&
        (pocketNames.length === 0 ? (
          <p className="muted small">No pockets yet. They show up here after you import a Revolut statement.</p>
        ) : (
          <>
            <p className="muted small">
              The categories each pocket's money is for. Imported payments from a pocket linked to one category get that category;
              with several, they are offered first.
            </p>
            <PocketLinks
              names={pocketNames}
              pockets={pockets}
              categories={categories}
              onToggle={(name, id, linked) => void togglePocketCategory(name, id, linked)}
            />
          </>
        ))}
    </>
  )
}

// 2026-10-04 was a Sunday, so day i of that week has getDay() === i.
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => new Date(2026, 9, 4 + i).toLocaleString(undefined, { weekday: 'long' }))

/** An amount (or a sum) saved when you leave the box. */
function AmountInput({ label, cents, onSave }: { label: string; cents: number; onSave: (cents: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  return (
    <input
      className={`amount-input${invalid ? ' invalid' : ''}`}
      inputMode="decimal"
      aria-label={label}
      title={invalid ? 'Type an amount like 1000 or a sum like 800+200' : undefined}
      value={draft ?? (cents / 100).toFixed(2).replace(/\.00$/, '')}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => (setDraft(e.target.value), setInvalid(false))}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      onBlur={() => {
        if (draft === null) return
        const value = evalAmount(draft === '' ? '0' : draft)
        if (value === null) return setInvalid(true)
        setDraft(null)
        if (value !== cents) onSave(value)
      }}
    />
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

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {checked ? 'On' : 'Off'}
    </label>
  )
}
