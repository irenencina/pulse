import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import AmountInput from '../components/AmountInput'
import NumberStepper from '../components/NumberStepper'
import Info from '../components/Info'
import { getSettings, togglePocketCategory, updateSettings } from '../db/actions'
import { db } from '../db/db'
import { setLabWeekStart, updateLabLayout } from '../db/lab'
import { LAB_COLUMN_LABELS, LAB_TITLE, weekStartOf, type LabColumns } from '../domain/lab'
import BackupPanel, { StoredData } from './settings/BackupPanel'
import PluginsPanel from './settings/PluginsPanel'
import Section from './settings/Section'
import ShopCategories from './settings/ShopCategories'
import TagSettings from './settings/TagSettings'
import PocketLinks from './tracking/PocketLinks'
import type { CarryOverMode, SavingsRateMode, Settings } from '../domain/types'

export type SettingsTab = 'general' | 'savings' | 'tags' | 'bank' | 'plugins' | 'data'

/** The parts of a tab: groups of fields shown by SettingsFields. */
type FieldGroup = 'general' | 'months' | 'saving' | 'dashboard' | 'lab' | 'pockets'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'savings', label: 'Savings' },
  { id: 'tags', label: 'Tags' },
  { id: 'bank', label: 'Bank imports' },
  { id: 'plugins', label: 'Plug-ins' },
  { id: 'data', label: 'Your data' },
]

/** Settings in a pop-up over the page, with a tab per topic on the left. Esc or a click outside closes it. */
export default function SettingsDialog({ initialTab = 'general', onClose }: { initialTab?: SettingsTab; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  const panel = useRef<HTMLDivElement>(null)
  // Each tab starts at its top.
  useEffect(() => {
    if (panel.current) panel.current.scrollTop = 0
  }, [tab])
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
          <div className="settings-panel" ref={panel}>
            {/* Every tab stays loaded and only the picked one shows, so switching never flashes a half-loaded tab. */}
            {TABS.map((t) => (
              <div key={t.id} role="tabpanel" aria-label={t.label} hidden={t.id !== tab}>
                <SettingsTabPanel tab={t.id} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </dialog>
  )
}

/** Every tab has the same shape: one or more sections, each a title with an ⓘ and then its rows. */
function SettingsTabPanel({ tab }: { tab: SettingsTab }) {
  switch (tab) {
    case 'general':
      return (
        <>
          <Section title="General" about="When your budget starts, and the currency it's in.">
            <SettingsFields tab="general" />
          </Section>
          <Section
            title="Late income"
            about="If your salary arrives near the end of the month and pays for the next one, it can count for that next month."
          >
            <SettingsFields tab="months" />
          </Section>
        </>
      )
    case 'savings':
      return (
        <Section title="Savings" about="What happens to money that isn't planned or spent, and how the Dashboard counts your savings rate.">
          <SettingsFields tab="saving" />
          <SettingsFields tab="dashboard" />
        </Section>
      )
    case 'tags':
      return <TagSettings />
    case 'bank':
      return (
        <>
          <Section
            title="Pockets"
            about="The categories each pocket's money is for. Imported payments from a pocket linked to one category get that category; with several, they are offered first. For now pockets come from Revolut statements."
          >
            <SettingsFields tab="pockets" />
          </Section>
          <Section
            title="Category rules"
            about="When you import a statement, Pulse offers a category for each row. It learns the one you pick for each shop, and you can fix a shop's category, write your own rules, or block a shop so it is never suggested. Deleting a rule never changes the categories your transactions already have."
          >
            <ShopCategories />
          </Section>
        </>
      )
    case 'plugins':
      return <PluginsPanel />
    case 'data':
      return (
        <>
          <BackupPanel />
          <StoredData />
        </>
      )
  }
}

/** The fields of one group; the Playground's ('lab') are shown inside Plug-ins. */
export function SettingsFields({ tab }: { tab: FieldGroup }) {
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
            <Toggle label="Shift late income" checked={settings.shiftLateIncome} onChange={(v) => set({ shiftLateIncome: v })} />
          </Field>
          <Field label="Starting on day" help="Income on this day of the month or later is shifted.">
            <NumberStepper
              label="Starting on day"
              disabled={!settings.shiftLateIncome}
              value={settings.lateIncomeDay}
              min={1}
              max={31}
              onChange={(day) => set({ lateIncomeDay: day })}
            />
          </Field>
          <Field
            label="Shift whole months in tracking"
            help={`Not only income: everything from day ${settings.lateIncomeDay} on counts for the next month in tracking, so a month runs from day ${settings.lateIncomeDay} to day ${settings.lateIncomeDay - 1 || 1} of the next. With day 24, October runs from 24 September to 23 October.`}
          >
            <Toggle
              label="Shift whole months in tracking"
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
            <Toggle label="Save non-allocated" checked={settings.saveNonAllocated} onChange={(v) => set({ saveNonAllocated: v })} />
          </Field>
          <Field label="Allow dissaving" help="Let the Main Pot cover months where expenses are bigger than income.">
            <Toggle label="Allow dissaving" checked={settings.allowDissaving} onChange={(v) => set({ allowDissaving: v })} />
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
          <Field
            label="Columns"
            help="What one column covers. Changing it moves your pretend amounts into the new columns; amounts that land in the same cell are added up."
          >
            <select aria-label="Columns" value={settings.labColumns} onChange={(e) => void updateLabLayout({ labColumns: e.target.value as LabColumns })}>
              {(Object.keys(LAB_COLUMN_LABELS) as LabColumns[]).map((c) => (
                <option key={c} value={c}>
                  {LAB_COLUMN_LABELS[c]}
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
                onChange={(e) => void updateLabLayout({ labFirstWeek: e.target.value ? weekStartOf(e.target.value, settings.labWeekStart) : null })}
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
          <p className="muted small">No pockets yet. They show up here after you import a bank statement.</p>
        ) : (
          <PocketLinks
            full
            names={pocketNames}
            pockets={pockets}
            categories={categories}
            onToggle={(name, id, linked) => void togglePocketCategory(name, id, linked)}
          />
        ))}
    </>
  )
}

// 2026-10-04 was a Sunday, so day i of that week has getDay() === i.
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => new Date(2026, 9, 4 + i).toLocaleString(undefined, { weekday: 'long' }))

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

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  // The same slide switch as the plug-ins, so every on/off in Settings looks alike.
  return (
    <label className="switch">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden="true" />
    </label>
  )
}
