import { expect, it } from 'vitest'
import { learnedMerchants, patternRules, spendingCalendar } from './insights'
import type { Transaction } from './transactions'

let n = 0
const tx = (date: string, cents: number, details: string, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${n}`,
  date,
  block: 'expenses',
  categoryId: 'food',
  cents,
  details,
  tagIds: [],
  source: 'revolut',
  createdAt: n++,
  ...extra,
})

it('lists what was learned per merchant, with rules winning', () => {
  const list = [
    tx('2026-09-01', 100, 'MERCADONA 12'),
    tx('2026-09-02', 100, 'Mercadona', { categoryId: 'home' }),
    tx('2026-09-03', 100, 'Basic Fit', { categoryId: null }),
  ]
  const learned = learnedMerchants(list, [])
  expect(learned[0]).toMatchObject({ merchant: 'mercadona', name: 'Mercadona', categoryId: 'home', count: 2, differing: 1, rule: false })
  expect(learned[1]).toMatchObject({ merchant: 'basic fit', categoryId: null, differing: 0 })
  expect(learnedMerchants(list, [{ merchant: 'mercadona', categoryId: 'food' }])[0]).toMatchObject({ categoryId: 'food', rule: true, differing: 1 })
})

it('lays out a month in weeks from Monday with spending per day', () => {
  const settings = { shiftLateIncome: true, lateIncomeDay: 24 }
  const weeks = spendingCalendar([tx('2026-10-01', 500, 'a'), tx('2026-10-01', 250, 'b'), tx('2026-10-02', 100, 'c', { block: 'income' })], '2026-10', settings)
  // 1 October 2026 is a Thursday.
  expect(weeks[0]!.slice(0, 3)).toEqual([null, null, null])
  expect(weeks[0]![3]).toEqual({ date: '2026-10-01', total: 750, count: 2 })
  expect(weeks[0]![4]).toEqual({ date: '2026-10-02', total: 0, count: 0 })
  // Another block counts only its own transactions.
  const income = spendingCalendar([tx('2026-10-01', 500, 'a'), tx('2026-10-02', 100, 'c', { block: 'income' })], '2026-10', settings, 'income')
  expect(income[0]![3]!.total).toBe(0)
  expect(income[0]![4]).toEqual({ date: '2026-10-02', total: 100, count: 1 })
  expect(weeks.flat().filter(Boolean)).toHaveLength(31)
  // With whole months shifted, October runs from 24 September.
  const shifted = spendingCalendar([], '2026-10', { ...settings, shiftWholeMonth: true })
  expect(shifted.flat().find(Boolean)!.date).toBe('2026-09-24')
  expect(shifted.flat().filter(Boolean)).toHaveLength(30)
})

it('forgets a deleted rule until the shop is categorised again', async () => {
  const { suggestCategory } = await import('./transactions')
  const old = tx('2026-09-01', 100, 'Lidl', { createdAt: 10 })
  const forgotten = [{ merchant: 'lidl', forgottenAt: 20 }]
  expect(learnedMerchants([old], forgotten)).toEqual([])
  expect(suggestCategory('Lidl', null, [old], [], forgotten)).toBeNull()
  const fresh = tx('2026-10-01', 100, 'Lidl', { createdAt: 30, categoryId: 'home' })
  expect(learnedMerchants([old, fresh], forgotten)[0]).toMatchObject({ categoryId: 'home', count: 1 })
  expect(suggestCategory('Lidl', null, [old, fresh], [], forgotten)).toMatchObject({ categoryId: 'home' })
})

it('tells a shop waiting for more uses apart from a blocked one', () => {
  const list = [tx('2026-09-01', 100, 'Lidl'), tx('2026-09-02', 100, 'Aldi'), tx('2026-09-03', 100, 'Spotify P12')]
  const rules = [
    { merchant: 'aldi', blocked: true as const },
    { merchant: 'contains:spotify', contains: 'spotify', categoryId: 'music' },
  ]
  const byName = Object.fromEntries(learnedMerchants(list, rules, 2).map((m) => [m.name, m]))
  expect(byName['Lidl']).toMatchObject({ status: 'tooFew', categoryId: 'food' })
  expect(byName['Aldi']).toMatchObject({ status: 'blocked', categoryId: null })
  expect(byName['Spotify P12']).toMatchObject({ status: 'pattern', categoryId: 'music', pattern: 'spotify' })
  expect(learnedMerchants(list, [], 1).every((m) => m.status === 'learned')).toBe(true)
  expect(patternRules(list, rules)).toEqual([{ key: 'contains:spotify', text: 'spotify', categoryId: 'music', matches: 1 }])
})
