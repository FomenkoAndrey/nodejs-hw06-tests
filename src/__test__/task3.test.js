import { join } from 'path'
import fs from 'fs'

describe('File Content Comparison', () => {
  const baseDir = join(__dirname, '..', 'files') // Припускаючи, що __dirname вказує на src/__test__
  const originalFilePath = join(baseDir, 'source.txt')
  const decompressedFilePath = join(baseDir, 'source_decompressed.txt')

  test('original and decompressed files should have the same content', () => {
    const originalContent = fs.readFileSync(originalFilePath, 'utf8')
    const decompressedContent = fs.readFileSync(decompressedFilePath, 'utf8')

    expect(decompressedContent).toEqual(originalContent)
  })
})
