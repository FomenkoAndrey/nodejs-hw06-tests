import { join } from 'path'
import fs, { promises as fsPromises } from 'fs'
import { vol } from 'memfs'
import { decompressFile } from '../main'

jest.mock('fs', () => {
  const realFs = jest.requireActual('fs')
  const memfs = require('memfs').vol
  const unionFs = require('unionfs').ufs
  unionFs.use(memfs).use(realFs)
  unionFs.constants = realFs.constants // Забезпечуємо, що константи доступні
  return unionFs
})

describe('decompressFile function', () => {
  const baseDir = join(__dirname, '..', 'files')
  const originalFilePath = join(baseDir, 'source.txt')
  const compressedFilePath = join(baseDir, 'source.txt.gz')
  const destinationFilePath = join(baseDir, 'source_decompressed.txt')
  const originalContent = 'This is the original content of the file'

  beforeEach(() => {
    vol.reset() // Очищення віртуальної файлової системи перед кожним тестом
    vol.fromJSON({
      [compressedFilePath]: Buffer.from('Compressed content', 'utf-8'), // Припущення, що вміст вже стиснутий
      [originalFilePath]: Buffer.from(originalContent, 'utf-8') // Оригінальний вміст файлу
    })
  })

  test('should create a decompressed file and match the original content', async () => {
    await decompressFile(compressedFilePath, destinationFilePath)
    const fileExists = fs.existsSync(destinationFilePath)
    expect(fileExists).toBe(true)

    const decompressedContent = fs.readFileSync(destinationFilePath, 'utf8')
    const originalFileContent = fs.readFileSync(originalFilePath, 'utf8')
    expect(decompressedContent).toEqual(originalFileContent)
  })

  test('should handle read errors gracefully', async () => {
    jest.spyOn(fsPromises, 'access').mockRejectedValue(new Error('Failed to access file'))
    await expect(decompressFile(compressedFilePath, destinationFilePath)).rejects.toThrow('Failed to access file')
    jest.restoreAllMocks()
  })

  afterEach(() => {
    vol.reset() // Очищення віртуальної файлової системи після кожного тесту
  })
})
