import { jsPDF } from 'jspdf'
import { autoTable, type RowInput } from 'jspdf-autotable'

/** A group of rows under a coloured heading row, like Own and Owe. */
export interface PdfGroup {
  label?: string
  tone?: 'own' | 'owe'
  rows: string[][]
}

export interface PdfSection {
  title: string
  /** A note instead of a table, or the text shown when there's nothing to list. */
  text?: string
  head?: string[]
  groups?: PdfGroup[]
  /** Columns aligned right, like amounts. */
  right?: number[]
  /** Column widths as parts of the page width, e.g. [0.24, 0.16]; the rest share what's left. */
  widths?: number[]
}

const NAVY: [number, number, number] = [27, 36, 82]
const MUTED: [number, number, number] = [110, 116, 135]
const TONES = { own: [226, 236, 251], owe: [253, 228, 240] } as const

/** The emergency sheet as a PDF with real text, so it can be saved anywhere, printed or searched. */
export function sheetPdf(title: string, subtitle: string, sections: PdfSection[], footer: string): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 40
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const width = pageWidth - margin * 2
  let y = margin

  const room = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage()
      y = margin
    }
  }

  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...NAVY)
  doc.text(title, margin, y + 14)
  y += 30
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED)
  doc.text(subtitle, margin, y)
  y += 22

  for (const s of sections) {
    // A heading never sits alone at the bottom of a page.
    room(60)
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...NAVY)
    doc.text(s.title, margin, y)
    y += 8
    if (!s.groups || s.groups.every((g) => g.rows.length === 0)) {
      const lines: string[] = doc.splitTextToSize(s.text ?? '', width)
      doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(40, 40, 40)
      for (const line of lines) {
        room(14)
        y += 13
        doc.text(line, margin, y)
      }
      y += 22
      continue
    }
    const cols = s.head?.length ?? 1
    const body: RowInput[] = []
    for (const g of s.groups) {
      if (g.label) {
        const fill = g.tone ? [...TONES[g.tone]] : [240, 242, 247]
        body.push([{ content: g.label, colSpan: cols, styles: { fontStyle: 'bold', fillColor: fill as [number, number, number], textColor: NAVY } }])
      }
      body.push(...g.rows)
    }
    const columnStyles: Record<number, { halign?: 'right'; cellWidth?: number }> = {}
    s.widths?.forEach((w, i) => (columnStyles[i] = { cellWidth: w * width }))
    s.right?.forEach((i) => (columnStyles[i] = { ...columnStyles[i], halign: 'right' }))
    autoTable(doc, {
      startY: y + 4,
      margin: { left: margin, right: margin },
      head: s.head ? [s.head] : undefined,
      body,
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 4, right: 4 }, textColor: [30, 30, 30], lineColor: [225, 228, 236], lineWidth: { bottom: 0.5 } },
      headStyles: { fontStyle: 'bold', fontSize: 7.5, textColor: MUTED },
      columnStyles,
      rowPageBreak: 'avoid',
      didParseCell: (data) => {
        if (data.section === 'head' && s.right?.includes(data.column.index)) data.cell.styles.halign = 'right'
      },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24
  }

  room(20)
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED)
  doc.text(footer, margin, y)
  return doc.output('blob')
}
