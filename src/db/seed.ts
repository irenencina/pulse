import type { Block } from '../domain/types'

/**
 * Starter categories for a new budget, taken from the original myBudgeting spreadsheet.
 * The spreadsheet's "Future" savings line is not here: in Pulse it is the Main Pot, which
 * is calculated rather than budgeted.
 */
export const STARTER_CATEGORIES: Record<Block, string[]> = {
  income: ['Job (Net)', 'Other'],
  expenses: [
    'Rent',
    'Health Insurance',
    'Education',
    'Groceries',
    'Sports & Gym',
    'Transportation',
    'Shopping & Presents',
    'Medicine & Body Care',
    'Subscriptions',
    'Fun & Leisure',
    'Travel & Vacation',
    'Clothing',
    'Buffer',
    'Utilities',
  ],
  savings: ['Emergency Fund', 'ETF Investing', 'Pension Investing', 'Travel Fund'],
}
