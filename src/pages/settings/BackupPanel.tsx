import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import ConfirmButton from '../../components/ConfirmButton'
import Section from './Section'
import Info from '../../components/Info'
import { useErrorMessage } from '../../components/useErrorMessage'
import { db } from '../../db/db'
import { loadDemo } from '../../db/demo'
import { backupFileName, createBackup, parseBackup, restoreBackup, type Backup } from '../../db/backup'
import { dayLabel, todayIso } from '../tracking/format'
import { getSettings, updateSettings } from '../../db/actions'
import { canUseFolder, chooseBackupFolder, forgetBackupFolder, noteBackup, saveToFolder, useBackupFolder, useLastBackup } from '../../db/autoBackup'
import { BACKUP_EVERY, backupEvery, type BackupEvery } from '../../domain/backupPlan'
import { canInstall, dataKept, install, keepData, onInstallChange, runsAsApp } from '../../installApp'

/** Saves everything to a file (by itself, when a folder is chosen), and loads such a file back. */
export default function BackupPanel() {
  const settings = useLiveQuery(() => getSettings(), [])
  const last = useLastBackup()
  const folder = useBackupFolder()
  const [pending, setPending] = useState<{ backup: Backup; name: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { error, run } = useErrorMessage()
  const fileInput = useRef<HTMLInputElement>(null)
  const folderOk = canUseFolder()

  const saveNow = () =>
    run(async () => {
      setNotice(null)
      if (folder && (await saveToFolder(true))) {
        setNotice(`Saved in ${folder}.`)
        return
      }
      const blob = new Blob([JSON.stringify(await createBackup(), null, 1)], { type: 'application/json' })
      if (await saveFile(backupFileName(), blob)) noteBackup(todayIso())
    })

  return (
    <Section
      title="Backup"
      about="Pulse keeps your data only in this browser. Clearing the browser's site data or changing computer loses it, so keep a backup file somewhere safe (a cloud drive is fine). Restoring a backup replaces everything in Pulse with what the file holds. To move Pulse to another device, save a backup here and restore it there."
    >
      <div className="field">
        <span className="field-label">{last ? `Last backup on ${dayLabel(last)}` : 'No backup yet'}</span>
        <span className="field-control toolbar">
          <button type="button" className="primary" onClick={() => void saveNow()}>
            {folder ? 'Save now' : 'Download'}
          </button>
          <button type="button" onClick={() => fileInput.current?.click()}>
            Restore…
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              setNotice(null)
              if (file) void run(async () => setPending({ backup: parseBackup(await file.text()), name: file.name }))
            }}
          />
        </span>
      </div>
      <div className="field">
        <span className="field-label">
          Repeat{' '}
          <Info>
            {folderOk
              ? 'When one is due, Pulse saves it into your folder by itself while it is open. Without a folder, or when the browser wants your OK first, Upcoming reminds you instead.'
              : 'When one is due, Upcoming reminds you to save it. This browser cannot save into a folder by itself; Chrome or Edge on a computer can.'}
          </Info>
        </span>
        <span className="field-control">
          <select aria-label="How often" value={backupEvery(settings?.backupEvery)} onChange={(e) => void updateSettings({ backupEvery: e.target.value as BackupEvery })}>
            {BACKUP_EVERY.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </span>
      </div>
      {folderOk && (
        <div className="field">
          <span className="field-label">
            Folder{' '}
            <Info>
              Pick a folder once, for example inside OneDrive, and each backup lands there as a dated file. If the browser asks whether Pulse may edit the folder, choose to allow it on every visit so it never has to ask again.
            </Info>
          </span>
          <span className="field-control toolbar">
            <span className={folder ? undefined : 'muted'}>{folder ?? 'Not chosen'}</span>
            <button
              type="button"
              onClick={() =>
                void run(async () => {
                  const name = await chooseBackupFolder()
                  if (name && (await saveToFolder(true))) setNotice(`Saved in ${name}.`)
                })
              }
            >
              {folder ? 'Change…' : 'Choose…'}
            </button>
            {folder && (
              <button type="button" onClick={() => void run(forgetBackupFolder)}>
                Forget
              </button>
            )}
          </span>
        </div>
      )}
      {pending && (
        <div className="restore-confirm">
          <p>
            <strong>{pending.name}</strong> holds {count(pending.backup, 'transactions', 'transaction')} and{' '}
            {count(pending.backup, 'categories', 'category', 'categories')}
            {pending.backup.exportedAt && `, saved on ${dayLabel(pending.backup.exportedAt.slice(0, 10))}`}. Restoring
            it replaces everything in Pulse now.
          </p>
          <div className="toolbar">
            <button type="button" onClick={() => setPending(null)}>
              Cancel
            </button>
            <ConfirmButton
              label="Replace my data"
              confirmLabel="Sure? Click again"
              onConfirm={() =>
                void run(async () => {
                  await restoreBackup(pending.backup)
                  setPending(null)
                  setNotice(`Restored ${pending.name}.`)
                })
              }
            />
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
    </Section>
  )
}

/** Pulse as an app on this device, and whether the browser keeps its data. */
export function AppPanel() {
  const [, redraw] = useState(0)
  const [kept, setKept] = useState<boolean | null>(null)
  useEffect(() => onInstallChange(() => redraw((n) => n + 1)), [])
  useEffect(() => void dataKept().then(setKept), [])
  const installed = runsAsApp()
  return (
    <Section
      title="App"
      about="Installed, Pulse opens in its own window with its own icon, works without internet and updates itself when a new version is out. Your data stays the same: it lives in the browser either way."
    >
      <div className="field">
        <span className="field-label">
          On this device{' '}
          {!installed && !canInstall() && (
            <Info>
              Open irenencina.github.io/pulse in Chrome or Edge and click the install icon at the right end of the address bar. On a phone, use the browser menu's Add to Home screen.
            </Info>
          )}
        </span>
        <span className="field-control toolbar">
          {installed ? (
            <span>Installed</span>
          ) : canInstall() ? (
            <button type="button" className="primary" onClick={() => void install()}>
              Install
            </button>
          ) : (
            <span className="muted">From the browser</span>
          )}
        </span>
      </div>
      {kept !== null && (
        <div className="field">
          <span className="field-label">
            Storage{' '}
            <Info>
              Browsers may clear a site's data on their own when the disk runs low. Pulse asks the browser not to; installing it usually makes the browser agree.
            </Info>
          </span>
          <span className="field-control toolbar">
            {kept ? (
              <span>Kept until you delete it</span>
            ) : (
              <>
                <span className="muted">May be cleared when space runs low</span>
                <button type="button" onClick={() => void keepData().then(setKept)}>
                  Ask again
                </button>
              </>
            )}
          </span>
        </div>
      )}
    </Section>
  )
}

type Saver = { save: (request: { filename: string; data: Blob }) => Promise<unknown> }
type Host = { use?: (name: 'downloads') => Promise<Saver | null> }

/**
 * Saves a file. Inside the claude.ai preview, downloads go through the viewer (which asks first);
 * everywhere else, through a normal browser download. Returns false when the person declined.
 */
export async function saveFile(filename: string, blob: Blob): Promise<boolean> {
  const host = (window as unknown as { claude?: Host }).claude
  const downloads = host?.use ? await host.use('downloads').catch(() => null) : null
  if (downloads) {
    try {
      await downloads.save({ filename, data: blob })
      return true
    } catch (e) {
      if ((e as { code?: string }).code === 'declined') return false
      throw new Error('The backup could not be saved here.')
    }
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

function count(backup: Backup, table: keyof Backup['tables'], one: string, many = `${one}s`): string {
  const n = backup.tables[table]?.length ?? 0
  return `${n} ${n === 1 ? one : many}`
}

/** What Pulse holds in this browser, so it's clear what a backup carries. */
export function StoredData() {
  const counts = useLiveQuery(
    async () => ({
      transactions: await db.transactions.count(),
      categories: await db.categories.count(),
      tags: await db.tags.count(),
      wishes: await db.wishItems.count(),
    }),
    [],
  )
  const [used, setUsed] = useState<number | null>(null)
  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then((e) => setUsed(e.usage ?? null))
      .catch(() => setUsed(null))
  }, [counts])
  if (!counts) return null
  const n = (value: number, one: string, many = `${one}s`) => `${value.toLocaleString()} ${value === 1 ? one : many}`
  return (
    <Section title="Stored here" about="Everything Pulse keeps, all of it in this browser on this device. Nothing is sent anywhere.">
      <div className="field">
        <span className="field-label">In this browser</span>
        <span className="field-control">
          {[n(counts.transactions, 'transaction'), n(counts.categories, 'category', 'categories'), n(counts.tags, 'tag'), counts.wishes > 0 ? n(counts.wishes, 'wishlist item') : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      {used !== null && (
        <div className="field">
          <span className="field-label">Space used</span>
          <span className="field-control">{used < 1_000_000 ? `${Math.max(1, Math.round(used / 1000))} kB` : `${(used / 1_000_000).toFixed(1)} MB`}</span>
        </div>
      )}
    </Section>
  )
}

/** For trying Pulse out: made-up data that shows every feature. Temporary, while Pulse is being built. */
export function DemoData() {
  const [notice, setNotice] = useState<string | null>(null)
  const { error, run } = useErrorMessage()
  return (
    <Section
      title="Demo data"
      about="Fills Pulse with six months of made-up money, dated around today, so you can see how every page behaves: the plan, tracking, tags, a trip, Upcoming with alerts, the Wishlist and the Playground. It replaces everything in Pulse now, so download a backup first if you want to keep what you have."
    >
      <div className="field">
        <span className="field-label">Made-up data to explore with</span>
        <span className="field-control toolbar">
          <ConfirmButton
            label="Load demo data"
            confirmLabel="Sure? Click again"
            onConfirm={() =>
              void run(async () => {
                await loadDemo(todayIso())
                setNotice('Demo data loaded.')
              })
            }
          />
        </span>
      </div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
    </Section>
  )
}
