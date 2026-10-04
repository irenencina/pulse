import { expect, it } from 'vitest'
import { localSuggester } from './autoCategory'
import type { Transaction } from './transactions'
import type { Category } from './types'

const cat = (id: string, name: string, block: Category['block'] = 'expenses'): Category => ({
  id,
  block,
  parentId: null,
  name,
  order: 0,
  archived: false,
})
const categories = [
  cat('job', 'Job (Net)', 'income'),
  cat('other', 'Other', 'income'),
  cat('rent', 'Rent'),
  cat('groceries', 'Groceries'),
  cat('sports', 'Sports & Gym'),
  cat('transport', 'Transportation'),
  cat('fun', 'Fun & Leisure'),
  cat('travel', 'Travel Fund', 'savings'),
]
const row = (description: string, cents = -1000, pocket: string | null = null) => ({ description, cents, pocket })
const past = (details: string, categoryId: string, extra: Partial<Transaction> = {}): Transaction => ({
  id: details,
  date: '2026-09-01',
  block: categories.find((c) => c.id === categoryId)!.block,
  categoryId,
  cents: 1000,
  details,
  tagIds: [],
  source: 'revolut',
  createdAt: 1,
  ...extra,
})

it('knows common shops from the start, matched to category names', async () => {
  const [ah, gym, train, salary, interest] = await localSuggester(
    [row('Albert Heijn'), row('Basic Fit Nederland B.V.'), row('Voetbalvereniging Drienerlo'), row('Payment from ACME BV', 300000), row('Interest on Savings', 100)],
    categories,
    [],
    [],
  )
  expect(ah?.categoryId).toBe('groceries')
  expect(gym?.categoryId).toBe('sports')
  // "Transportation" must not count as sport.
  expect(train?.categoryId).toBe('sports')
  expect(salary?.categoryId).toBe('job')
  expect(interest?.categoryId).toBe('other')
})

it('learns from what you categorised before, including people and new words', async () => {
  const history = [past('To Johan E. Kirchner', 'rent'), past('To Johan E. Kirchner', 'rent'), past('Arque Klimcentrum', 'fun')]
  const [landlord, climbing] = await localSuggester([row('To Johan E Kirchner'), row('Arque Klimcentrum Enschede')], categories, history, [])
  expect(landlord?.categoryId).toBe('rent')
  expect(climbing?.categoryId).toBe('fun')
})

it('stays quiet when it has nothing to go on, and never puts spending into income', async () => {
  const [unknown, spent] = await localSuggester([row('Wteu6lh8x4jx'), row('Payment from ACME BV', -500)], categories, [], [])
  expect(unknown).toBeNull()
  expect(spent?.categoryId).not.toBe('job')
})
