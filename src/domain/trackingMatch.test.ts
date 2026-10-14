import { expect, it } from 'vitest'
import type { Transaction } from './transactions'
import { trackingMatches } from './trackingMatch'

const tx = (id: string, date: string, cents: number, block: Transaction['block'] = 'expenses'): Transaction => ({ id, date, block, cents, categoryId: null, details: id, tagIds: [], source: 'manual', createdAt: 0 })

it('finds the payment it could be: the exact amount first, close ones next, nothing far off or taken', () => {
  const all = [tx('close', '2026-10-06', 25500), tx('off', '2026-10-05', 27900), tx('exact', '2026-10-01', 24900), tx('late', '2026-10-30', 24900), tx('cheap', '2026-10-05', 900), tx('income', '2026-10-05', 24900, 'income'), tx('taken', '2026-10-05', 24900)]
  expect(trackingMatches(all, { block: 'expenses', cents: 24900, date: '2026-10-05' }, new Set(['taken'])).map((t) => t.id)).toEqual(['exact', 'close'])
})
