import { compressFile } from '../main.js'
import fs, { createReadStream, existsSync } from 'fs'
import { resolve } from 'path'
import { vol } from 'memfs'

jest.mock('fs', () => {
  const realFs = jest.requireActual('fs')
  const memfs = require('memfs')
  const unionFs = require('unionfs').ufs
  unionFs.use(realFs).use(memfs.vol)
  return unionFs
})

describe('compressFile function', () => {
  beforeEach(() => {
    vol.reset()
    vol.fromJSON({
      '/test/source.txt': 'This is a test file content'
    })
  })

  test('should compress a file and return the path to the compressed file', async () => {
    const filePath = resolve('/test/source.txt')
    const expectedCompressedPath = resolve('/test/source.txt.gz')
    await expect(compressFile(filePath)).resolves.toBe(expectedCompressedPath)
    expect(existsSync(expectedCompressedPath)).toBeTruthy()
  })

  test('should handle existing compressed files by creating a unique filename', async () => {
    const filePath = resolve('/test/source.txt')
    vol.writeFileSync(resolve('/test/source.txt.gz'), '')
    const expectedNewCompressedPath = resolve('/test/source_1.txt.gz')
    await expect(compressFile(filePath)).resolves.toBe(expectedNewCompressedPath)
    expect(existsSync(expectedNewCompressedPath)).toBeTruthy()
  })

  it('should handle file compression errors', async () => {
    const failingFilePath = resolve('/test/failing.txt')
    jest.spyOn(fs, 'createReadStream').mockImplementationOnce(() => {
      throw new Error(`file "${failingFilePath}" does not exist`)
    })

    // Виправлено текст помилки, щоб він точно відповідав фактичному повідомленню
    await expect(compressFile(failingFilePath)).rejects.toThrow(`file "${failingFilePath}" does not exist`)
  })

  afterEach(() => {
    jest.restoreAllMocks() // Restore all mocks
  })
})
