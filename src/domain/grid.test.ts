import { describe, expect, it } from 'vitest'
import type { CellValue } from './budget'
import { clear, copy, fillDown, fillRight, fillTarget, fillTo, fromTsv, paste, rectOf, toTsv, type Pos } from './grid'

const eur = (n: number): CellValue => ({ kind: 'fixed', cents: n * 100 })
// 3 rows x 4 months
const grid: Array<Array<CellValue | null>> = [
  [eur(1), eur(2), null, null],
  [eur(5), null, null, null],
  [{ kind: 'percent', basisPoints: 1500 }, null, null, null],
]
const get = (p: Pos) => grid[p.row]![p.col]!

it('normalises a selection dragged in any direction', () => {
  expect(rectOf({ row: 2, col: 3 }, { row: 0, col: 1 })).toEqual({ top: 0, bottom: 2, left: 1, right: 3 })
})

it('fills right from the first selected month, per row', () => {
  const writes = fillRight(rectOf({ row: 0, col: 1 }, { row: 1, col: 3 }), get)
  expect(writes).toEqual([
    { row: 0, col: 2, value: eur(2) },
    { row: 0, col: 3, value: eur(2) },
    { row: 1, col: 2, value: null },
    { row: 1, col: 3, value: null },
  ])
})

it('fills down from the top selected row, per column', () => {
  const writes = fillDown(rectOf({ row: 0, col: 0 }, { row: 2, col: 0 }), get)
  expect(writes).toEqual([
    { row: 1, col: 0, value: eur(1) },
    { row: 2, col: 0, value: eur(1) },
  ])
})

it('clears every selected cell', () => {
  expect(clear(rectOf({ row: 0, col: 0 }, { row: 0, col: 1 }))).toHaveLength(2)
})

describe('copy and paste', () => {
  const size = { rows: 3, cols: 4 }

  it('fills the whole selection with a single copied cell', () => {
    const writes = paste(rectOf({ row: 1, col: 1 }, { row: 2, col: 3 }), [[eur(9)]], size)
    expect(writes).toHaveLength(6)
    expect(writes.every((w) => w.value?.kind === 'fixed' && w.value.cents === 900)).toBe(true)
  })

  it('pastes a block at the top-left and cuts it off at the edge', () => {
    const block = copy(rectOf({ row: 0, col: 0 }, { row: 1, col: 1 }), get)
    const writes = paste(rectOf({ row: 2, col: 3 }, { row: 2, col: 3 }), block, size)
    expect(writes).toEqual([{ row: 2, col: 3, value: eur(1) }])
  })

  it('round-trips through spreadsheet text', () => {
    const block = copy(rectOf({ row: 0, col: 0 }, { row: 2, col: 1 }), get)
    expect(toTsv(block)).toBe('1.00\t2.00\n5.00\t\n15%\t')
    expect(fromTsv(toTsv(block))).toEqual(block)
  })

  it('reads text copied from Excel, and refuses text that is not numbers', () => {
    expect(fromTsv('3,119.22\t3,176.00\r\n')).toEqual([[eur(3119.22), eur(3176)]])
    expect(fromTsv('Rent\t486.50')).toBeNull()
  })
})

describe('pasting into a bigger selection', () => {
  it('repeats a copied row over every selected row', () => {
    const writes = paste(rectOf({ row: 0, col: 0 }, { row: 2, col: 1 }), [[eur(1), eur(2)]], { rows: 3, cols: 4 })
    expect(writes).toHaveLength(6)
    expect(writes.filter((w) => w.col === 1).map((w) => w.value)).toEqual([eur(2), eur(2), eur(2)])
  })
})

describe('fill handle', () => {
  const source = rectOf({ row: 0, col: 0 }, { row: 0, col: 1 })
  it('stretches the selection the way the mouse went furthest', () => {
    expect(fillTarget(source, { row: 2, col: 2 })).toEqual({ top: 0, bottom: 2, left: 0, right: 1 })
    expect(fillTarget(source, { row: 0, col: 3 })).toEqual({ top: 0, bottom: 0, left: 0, right: 3 })
  })
  it('repeats the source over the new cells', () => {
    expect(fillTo(source, { top: 0, bottom: 0, left: 0, right: 3 }, get)).toEqual([
      { row: 0, col: 2, value: eur(1) },
      { row: 0, col: 3, value: eur(2) },
    ])
    expect(fillTo(rectOf({ row: 1, col: 0 }, { row: 1, col: 0 }), { top: 0, bottom: 2, left: 0, right: 0 }, get).map((w) => w.row)).toEqual([0, 2])
  })
})
