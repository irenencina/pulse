import { expect, it } from 'vitest'
import { unzipFiles } from './xlsx'
import { dataUrlBytes, zipFiles } from './zip'

it('makes a zip that opens again, with the photos in order', async () => {
  const a = dataUrlBytes(`data:image/jpeg;base64,${btoa('first photo')}`)
  const b = dataUrlBytes('data:image/svg+xml;utf8,%3Csvg%2F%3E')
  const zip = zipFiles([
    { name: 'Winter boots 1.jpg', bytes: a },
    { name: 'Winter boots 2.svg', bytes: b },
  ])
  const files = await unzipFiles(zip, () => true)
  expect(Object.keys(files)).toEqual(['Winter boots 1.jpg', 'Winter boots 2.svg'])
  expect(new TextDecoder().decode(files['Winter boots 1.jpg'])).toBe('first photo')
  expect(new TextDecoder().decode(files['Winter boots 2.svg'])).toBe('<svg/>')
})
