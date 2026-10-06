import { describe, expect, it } from 'vitest'
import { evalAmount, isSum } from './money'

describe('evalAmount', () => {
  it.each([
    ['350+300', 65000],
    ['=-350-300-370', -102000],
    ['45*4', 18000],
    ['45 x 4', 18000],
    ['100/4', 2500],
    ['1.200,50 - 20', 118050],
    ['10 + -2', 800],
    ['12.5', 1250],
    ['-12', -1200],
    ['2+3*4', 1400],
  ])('%s', (input, cents) => expect(evalAmount(input)).toBe(cents))

  it.each(['', '3+', '+', 'abc', '3++4x', '5/0'])('rejects %s', (input) => expect(evalAmount(input)).toBeNull())

  it('tells sums from plain amounts', () => {
    expect(isSum('350+300')).toBe(true)
    expect(isSum('-350-300')).toBe(true)
    expect(isSum('-350')).toBe(false)
    expect(isSum('1.200,50')).toBe(false)
  })
})
