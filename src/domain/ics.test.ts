import { expect, it } from 'vitest'
import { upcomingCalendar } from './ics'
import type { UpcomingEvent } from './upcoming'

const line = (extra: Partial<UpcomingEvent>): UpcomingEvent => ({ key: 'k', sourceKey: 's', source: 'own', kind: 'payment', name: 'Gym', cents: 3500, date: '2026-10-20', repeat: 'month', categoryId: null, ...extra })

it('writes all-day events, repeating monthly lines once, with commas escaped', () => {
  const ics = upcomingCalendar(
    [
      line({ key: 'a1' }),
      line({ key: 'a2', date: '2026-11-20' }),
      line({ key: 'c', sourceKey: 'net', kind: 'cancelBy', name: 'Streaming, family plan', date: '2026-10-31', repeat: 'year', cents: null }),
    ],
    '20261014T120000Z',
  )
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
  expect(ics).toContain('DTSTART;VALUE=DATE:20261020\r\nDTEND;VALUE=DATE:20261021')
  expect(ics).toContain('RRULE:FREQ=MONTHLY')
  expect(ics).toContain('SUMMARY:Gym €35.00')
  expect(ics).toContain('SUMMARY:Last day to cancel Streaming\\, family plan')
  // A last day to cancel happens once; it doesn't repeat.
  expect(ics.split('BEGIN:VEVENT')[2]).not.toContain('RRULE')
})
