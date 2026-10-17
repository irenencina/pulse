import { expect, it } from 'vitest'
import { sheetPdf } from './emergencyPdf'

it('makes a PDF of the sheet, tables and notes alike', async () => {
  const blob = sheetPdf('Emergency sheet', 'Not checked yet', [
    { title: 'Who to call', text: 'No one yet.', head: ['Name', 'Phone'], groups: [{ rows: [] }] },
    { title: 'Where things are', text: 'Blue folder.\nKeys with my sister.' },
    { title: 'Accounts', head: ['Account', 'Balance'], right: [1], groups: [{ label: 'Own', tone: 'own', rows: [['Bank', '€1,234.00']] }] },
  ], 'Printed from Pulse.')
  const text = new TextDecoder().decode(await blob.arrayBuffer())
  expect(text.startsWith('%PDF')).toBe(true)
  expect(text).toContain('Keys with my sister.')
})
