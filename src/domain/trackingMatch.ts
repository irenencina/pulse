import type { Block } from './types'
import type { Transaction } from './transactions'

/** How many days either side of a purchase or sale to look for its payment in Tracking. */
export const MATCH_DAYS = 14

const daysApart = (a: string, b: string) => Math.abs(Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000))

/**
 * Payments already in Tracking that could be this purchase or sale: the same block, within two
 * weeks, the exact amount first and then the closest ones. Payments already linked to something
 * else are left out.
 */
export function trackingMatches(
  transactions: Transaction[],
  wanted: { block: Block; cents: number | null; date: string },
  taken: Set<string> = new Set(),
  max = 5,
): Transaction[] {
  return transactions
    .filter((t) => t.block === wanted.block && !t.pretend && !taken.has(t.id) && daysApart(t.date, wanted.date) <= MATCH_DAYS)
    .map((t) => ({ t, off: wanted.cents === null ? 0 : Math.abs(t.cents - wanted.cents), gap: daysApart(t.date, wanted.date) }))
    // The same amount, or only a little off (a bank fee, a price that changed): not another purchase.
    .filter(({ off }) => wanted.cents === null || off <= Math.max(50, wanted.cents * 0.05))
    .sort((a, b) => a.off - b.off || a.gap - b.gap)
    .slice(0, max)
    .map(({ t }) => t)
}
