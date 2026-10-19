import { nextMonthDate } from './recurring'

/** Upcoming's backup reminder opens Settings → Your data at this address. */
export const BACKUP_PATH = '/backup'

/** How often Pulse saves a backup by itself, or reminds you to. */
export type BackupEvery = 'off' | '3days' | 'week' | '2weeks' | 'month'

export const BACKUP_EVERY: Array<{ id: BackupEvery; label: string }> = [
  { id: '3days', label: 'Every 3 days' },
  { id: 'week', label: 'Every week' },
  { id: '2weeks', label: 'Every 2 weeks' },
  { id: 'month', label: 'Every month' },
  { id: 'off', label: 'Never' },
]

/** Unset (data from before this setting) means every 2 weeks: a backup matters before anyone thinks of it. */
export const backupEvery = (every: BackupEvery | undefined): BackupEvery => every ?? '2weeks'

const DAYS: Record<Exclude<BackupEvery, 'off' | 'month'>, number> = { '3days': 3, week: 7, '2weeks': 14 }

const addDays = (iso: string, days: number): string => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** The day the next backup is due ("YYYY-MM-DD"): today when there has never been one; null when switched off. */
export function backupDueOn(every: BackupEvery | undefined, last: string | null, today: string): string | null {
  const plan = backupEvery(every)
  if (plan === 'off') return null
  if (!last) return today
  return plan === 'month' ? nextMonthDate(last) : addDays(last, DAYS[plan])
}

export const backupDue = (every: BackupEvery | undefined, last: string | null, today: string): boolean => {
  const due = backupDueOn(every, last, today)
  return due !== null && due <= today
}
