/**
 * Upcoming as a calendar file (.ics) that Google Calendar, Outlook or a phone can import: each
 * line becomes an all-day event, monthly and yearly ones repeat. Importing a newer file again
 * updates the same events instead of adding them twice, since each keeps its id.
 */
import { formatMoney } from './money'
import type { UpcomingEvent } from './upcoming'

/** The groups you can choose to put in the calendar. */
export type CalendarGroup = 'payments' | 'cancel' | 'warranties' | 'topUps' | 'wishlist' | 'resale'

export const CALENDAR_GROUPS: Array<[CalendarGroup, string]> = [
  ['payments', 'Payments'],
  ['cancel', 'Last days to cancel'],
  ['warranties', 'Warranties ending'],
  ['topUps', 'Pocket top-ups'],
  ['wishlist', 'Wishlist'],
  ['resale', 'Resale'],
]

export function calendarGroup(e: UpcomingEvent): CalendarGroup {
  if (e.kind === 'cancelBy') return 'cancel'
  if (e.kind === 'warranty') return 'warranties'
  if (e.kind === 'topUp') return 'topUps'
  if (e.kind === 'wishReady') return 'wishlist'
  if (e.kind === 'resaleNudge') return 'resale'
  return 'payments'
}

/** What the event is called in the calendar. */
export function calendarTitle(e: UpcomingEvent): string {
  const cost = e.cents !== null ? ` ${formatMoney(e.cents)}` : ''
  if (e.kind === 'cancelBy') return `Last day to cancel ${e.name}`
  if (e.kind === 'warranty') return `${e.name} warranty ends`
  if (e.kind === 'topUp') return `Top up ${e.name}${cost}`
  if (e.kind === 'wishReady') return `Ready to buy: ${e.name}`
  if (e.kind === 'resaleNudge') return e.nudge === 'pickup' ? `Pick-up: ${e.name}` : e.nudge === 'post' ? `Post ${e.name} for sale` : `Lower the price of ${e.name}?`
  return `${e.name}${cost}${e.monthOnly ? ' (this month)' : ''}`
}

/** Text in an .ics line: commas, semicolons and line breaks escaped. */
const text = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const day = (iso: string) => iso.replaceAll('-', '')
const nextDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

/** Long lines are folded at 75 characters, as the format asks. */
const fold = (line: string) => line.match(/.{1,74}/g)!.join('\r\n ')

export function upcomingCalendar(events: UpcomingEvent[], stamp: string): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pulse//Upcoming//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Pulse']
  const seen = new Set<string>()
  for (const e of events) {
    // A repeating line is one event that repeats, not one per month.
    const id = e.repeat === 'once' ? e.key : `${e.sourceKey}:${e.kind}`
    if (seen.has(id)) continue
    seen.add(id)
    lines.push(
      'BEGIN:VEVENT',
      `UID:${id.replace(/[^\w:.-]/g, '-')}@pulse`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day(e.date)}`,
      `DTEND;VALUE=DATE:${day(nextDay(e.date))}`,
      `SUMMARY:${text(calendarTitle(e))}`,
      ...(e.note ? [`DESCRIPTION:${text(e.note)}`] : []),
      ...(e.repeat === 'month' && e.kind !== 'cancelBy' ? ['RRULE:FREQ=MONTHLY'] : e.repeat === 'year' && e.kind !== 'cancelBy' ? ['RRULE:FREQ=YEARLY'] : []),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
