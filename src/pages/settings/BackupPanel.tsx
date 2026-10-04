import { useRef, useState } from 'react'
import ConfirmButton from '../../components/ConfirmButton'
import Info from '../../components/Info'
import { useErrorMessage } from '../../components/useErrorMessage'
import { backupFileName, createBackup, parseBackup, restoreBackup, type Backup } from '../../db/backup'
import { dayLabel, todayIso } from '../tracking/format'

const LAST_BACKUP = 'pulse.lastBackup'

function readLastBackup(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP)
  } catch {
    return null
  }
}

/** Saves everything to a file, and loads such a file back. */
export default function BackupPanel() {
  const [last, setLast] = useState(readLastBackup)
  const [pending, setPending] = useState<{ backup: Backup; name: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { error, run } = useErrorMessage()
  const fileInput = useRef<HTMLInputElement>(null)

  const download = () =>
    run(async () => {
      const blob = new Blob([JSON.stringify(await createBackup(), null, 1)], { type: 'application/json' })
      if (!(await saveFile(backupFileName(), blob))) return
      const today = todayIso()
      try {
        localStorage.setItem(LAST_BACKUP, today)
      } catch {
        // Only a reminder; nothing is lost without it.
      }
      setLast(today)
      setNotice(null)
    })

  return (
    <fieldset>
      <legend>
        Backup{' '}
        <Info>
          Pulse keeps your data only in this browser. Clearing the browser's site data or changing computer loses it,
          so download a backup now and then and keep the file somewhere safe (a cloud drive is fine). Restoring a
          backup replaces everything in Pulse with what the file holds.
        </Info>
      </legend>
      <div className="field">
        <span className="field-label">
          {last ? `Last backup on ${dayLabel(last)}` : 'No backup from this browser yet'}
        </span>
        <span className="field-control toolbar">
          <button type="button" className="primary" onClick={() => void download()}>
            Download backup
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
    </fieldset>
  )
}

type Saver = { save: (request: { filename: string; data: Blob }) => Promise<unknown> }
type Host = { use?: (name: 'downloads') => Promise<Saver | null> }

/**
 * Saves a file. Inside the claude.ai preview, downloads go through the viewer (which asks first);
 * everywhere else, through a normal browser download. Returns false when the person declined.
 */
async function saveFile(filename: string, blob: Blob): Promise<boolean> {
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
