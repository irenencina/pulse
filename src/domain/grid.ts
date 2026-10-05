import { formatCellInput, parseCellInput, type CellValue } from './budget'

/** A cell position in the planner grid: row = editable category row, col = month index. */
export interface Pos {
  row: number
  col: number
}

export interface Rect {
  top: number
  bottom: number
  left: number
  right: number
}

/** A value to write into one grid cell; null clears it. */
export interface CellWrite extends Pos {
  value: CellValue | null
}

export type Matrix = Array<Array<CellValue | null>>

export function rectOf(a: Pos, b: Pos): Rect {
  return {
    top: Math.min(a.row, b.row),
    bottom: Math.max(a.row, b.row),
    left: Math.min(a.col, b.col),
    right: Math.max(a.col, b.col),
  }
}

export const inRect = (r: Rect, p: Pos) => p.row >= r.top && p.row <= r.bottom && p.col >= r.left && p.col <= r.right
export const rectSize = (r: Rect) => (r.bottom - r.top + 1) * (r.right - r.left + 1)

const positions = (r: Rect): Pos[] => {
  const out: Pos[] = []
  for (let row = r.top; row <= r.bottom; row++) for (let col = r.left; col <= r.right; col++) out.push({ row, col })
  return out
}

/** Each row's first selected month is copied into the rest of the selection. */
export function fillRight(r: Rect, get: (p: Pos) => CellValue | null): CellWrite[] {
  return positions(r)
    .filter((p) => p.col !== r.left)
    .map((p) => ({ ...p, value: get({ row: p.row, col: r.left }) }))
}

/** Each column's top selected row is copied into the rows below it. */
export function fillDown(r: Rect, get: (p: Pos) => CellValue | null): CellWrite[] {
  return positions(r)
    .filter((p) => p.row !== r.top)
    .map((p) => ({ ...p, value: get({ row: r.top, col: p.col }) }))
}

export function clear(r: Rect): CellWrite[] {
  return positions(r).map((p) => ({ ...p, value: null }))
}

export function copy(r: Rect, get: (p: Pos) => CellValue | null): Matrix {
  const rows: Matrix = []
  for (let row = r.top; row <= r.bottom; row++) {
    const line: Array<CellValue | null> = []
    for (let col = r.left; col <= r.right; col++) line.push(get({ row, col }))
    rows.push(line)
  }
  return rows
}

/**
 * Pastes at the selection. When the selection is bigger than what was copied, the copy is
 * repeated to fill it (one row copied into five selected rows fills all five), like a
 * spreadsheet. Otherwise it's pasted once from the selection's top-left, cut off at the grid edges.
 */
export function paste(r: Rect, matrix: Matrix, size: { rows: number; cols: number }): CellWrite[] {
  if (matrix.length === 0 || matrix[0]!.length === 0) return []
  const height = matrix.length
  const width = Math.max(...matrix.map((line) => line.length))
  const rows = Math.max(height, r.bottom - r.top + 1)
  const cols = Math.max(width, r.right - r.left + 1)
  const out: CellWrite[] = []
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const row = r.top + i
      const col = r.left + j
      const value = matrix[i % height]![j % width]
      if (row < size.rows && col < size.cols && value !== undefined) out.push({ row, col, value })
    }
  }
  return out
}

/** The cells a fill-handle drag from `source` to `to` covers: the source stretched down, up, left or right. */
export function fillTarget(source: Rect, to: Pos): Rect {
  const down = Math.max(0, to.row - source.bottom)
  const up = Math.max(0, source.top - to.row)
  const right = Math.max(0, to.col - source.right)
  const left = Math.max(0, source.left - to.col)
  // Like a spreadsheet, a fill goes one way: whichever way the mouse went furthest.
  if (Math.max(down, up) >= Math.max(right, left)) {
    return { ...source, top: source.top - up, bottom: source.bottom + down }
  }
  return { ...source, left: source.left - left, right: source.right + right }
}

/** Repeats the source cells over the rest of the target, the way dragging the fill handle does. */
export function fillTo(source: Rect, target: Rect, get: (p: Pos) => CellValue | null): CellWrite[] {
  const h = source.bottom - source.top + 1
  const w = source.right - source.left + 1
  const wrap = (n: number, m: number) => ((n % m) + m) % m
  return positions(target)
    .filter((p) => !inRect(source, p))
    .map((p) => ({ ...p, value: get({ row: source.top + wrap(p.row - source.top, h), col: source.left + wrap(p.col - source.left, w) }) }))
}

/** Tab-separated text, the format spreadsheets put on the clipboard. */
export function toTsv(matrix: Matrix): string {
  return matrix.map((line) => line.map((v) => formatCellInput(v ?? undefined)).join('\t')).join('\n')
}

/** Reads tab-separated text (e.g. copied from Excel). Returns null if any cell isn't a number or percentage. */
export function fromTsv(text: string): Matrix | null {
  const lines = text.replace(/\r/g, '').replace(/\n+$/, '').split('\n')
  const matrix: Matrix = []
  for (const line of lines) {
    const row: Array<CellValue | null> = []
    for (const raw of line.split('\t')) {
      const value = parseCellInput(raw === '-' || raw === '–' ? '' : raw)
      if (value === undefined) return null
      row.push(value)
    }
    matrix.push(row)
  }
  return matrix
}
