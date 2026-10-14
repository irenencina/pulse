import { expect, it } from 'vitest'
import { matchesResale, resaleNudge, resaleTotals, type ResaleItem } from './resale'
import { upcomingEvents, flagOf } from './upcoming'
import { DEFAULT_SETTINGS } from './types'

const today = '2026-10-14'
const item = (extra: Partial<ResaleItem>): ResaleItem => ({ id: 'r', name: 'Boots', askingCents: 4500, sites: [], tagIds: [], status: 'toPost', addedOn: '2026-10-01', ...extra })

it('nudges to post after a week, and to lower the price after a month posted', () => {
  expect(resaleNudge(item({}), today)).toEqual({ kind: 'post', from: '2026-10-08', days: 13 })
  expect(resaleNudge(item({ status: 'posted', postedOn: '2026-09-01' }), today)).toEqual({ kind: 'lower', from: '2026-10-01', days: 43 })
  // Lowering the price starts the month again.
  expect(resaleNudge(item({ status: 'posted', postedOn: '2026-09-01', loweredOn: '2026-10-10' }), today)).toMatchObject({ from: '2026-11-09', days: 4 })
  expect(resaleNudge(item({ status: 'reserved', postedOn: '2026-09-01' }), today)).toBeNull()
  expect(resaleNudge(item({ status: 'sold' }), today)).toBeNull()
})

it('shows the nudges in Upcoming, from a week before', () => {
  const resale = [
    item({ id: 'a', name: 'Camera' }),
    item({ id: 'b', name: 'Boots', status: 'posted', postedOn: '2026-09-01', sites: ['Vinted'] }),
    item({ id: 'c', name: 'Lamp', status: 'posted', postedOn: '2026-09-18' }),
    item({ id: 'd', name: 'Desk', status: 'posted', postedOn: '2026-10-10' }),
  ]
  const events = upcomingEvents({ categories: [], cells: [], transactions: [], wishes: [], resale, items: [], overrides: [], settings: DEFAULT_SETTINGS }, today).filter((e) => e.source === 'resale')
  expect(events.map((e) => [e.name, e.date, e.nudge, e.note])).toEqual([
    ['Boots', today, 'lower', 'Posted on Vinted 43 days ago'],
    ['Camera', today, 'post', 'Not posted yet, added 13 days ago'],
    ['Lamp', '2026-10-18', 'lower', 'Posted 26 days ago'],
  ])
  expect(events.every((e) => flagOf(e, today) === 'resaleSoon')).toBe(true)
})

it('adds up what is asked and what was earned this year', () => {
  const items = [item({ askingCents: 4500 }), item({ status: 'sold', soldCents: 3000, soldOn: '2026-03-01' }), item({ status: 'sold', soldCents: 1000, soldOn: '2025-12-01' }), item({ status: 'given', askingCents: 999 })]
  expect(resaleTotals(items, today)).toEqual({ askingCents: 4500, earnedThisYearCents: 3000, earnedCents: 4000 })
  expect(matchesResale(item({ sites: ['Vinted'], brand: 'Stride' }), { text: 'stride boo', sites: ['Vinted'] })).toBe(true)
  expect(matchesResale(item({ sites: ['eBay'] }), { sites: ['Vinted'] })).toBe(false)
})
