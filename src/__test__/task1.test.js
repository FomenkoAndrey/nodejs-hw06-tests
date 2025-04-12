import { join } from 'path';
import { compressFile, performCompressionAndDecompression } from '../main.js';
import { describe, beforeEach, test, expect, vi, afterEach } from 'vitest';
import { vol } from 'memfs';
import { Readable, Writable } from 'stream';

// Мокуємо fs
vi.mock('fs', async () => {
  const realFs = await vi.importActual('fs');
  const memfs = require('memfs').fs;
  const unionFs = require('unionfs').ufs;
  unionFs.use(memfs).use(realFs);
  unionFs.constants = realFs.constants;

  return {
    default: unionFs,
    promises: {
      access: vi.fn((filePath) => {
        return new Promise((resolve, reject) => {
          if (!vol.existsSync(filePath)) {
            const error = new Error(`ENOENT: no such file or directory, access '${filePath}'`);
            error.code = 'ENOENT';
            reject(error);
          } else {
            resolve();
          }
        });
      }),
      ...memfs.promises
    },
    createReadStream: vi.fn((filePath) => {
      if (!vol.existsSync(filePath)) {
        throw new Error(`file "${filePath}" does not exist`);
      }
      const content = vol.readFileSync(filePath);
      const readable = new Readable();
      readable._read = () => {};
      readable.push(content);
      readable.push(null);
      return readable;
    }),
    createWriteStream: vi.fn((filePath) => {
      const writable = new Writable();
      writable._write = (chunk, encoding, callback) => {
        vol.writeFileSync(filePath, chunk);
        callback();
      };
      return writable;
    }),
    existsSync: vi.fn((filePath) => {
      return vol.existsSync(filePath);
    })
  };
});

describe('compressFile function', () => {
  beforeEach(() => {
    vol.reset(); // Очищення віртуальної файлової системи
    vi.clearAllMocks();
  });

  test('should compress a file and return the path to the compressed file', async () => {
    const filePath = '/test/source.txt';
    const fileContent = 'This is a test file content';
    vol.fromJSON({ [filePath]: Buffer.from(fileContent, 'utf-8') });

    const expectedCompressedPath = '/test/source.txt.gz';

    const result = await compressFile(filePath);

    expect(result).toBe(expectedCompressedPath);
    expect(vol.existsSync(expectedCompressedPath)).toBe(true);
    expect(vol.readFileSync(expectedCompressedPath, 'utf8')).toContain('compressed:');
  });

  test('should handle existing compressed files by creating a unique filename', async () => {
    const filePath = '/test/source.txt';
    const fileContent = 'This is a test file content';
    const existingCompressedPath = '/test/source.txt.gz';
    
    vol.fromJSON({
      [filePath]: Buffer.from(fileContent, 'utf-8'),
      [existingCompressedPath]: Buffer.from('already compressed', 'utf-8')
    });

    const expectedNewCompressedPath = '/test/source_1.txt.gz';

    const result = await compressFile(filePath);

    expect(result).toBe(expectedNewCompressedPath);
    expect(vol.existsSync(expectedNewCompressedPath)).toBe(true);
    expect(vol.readFileSync(expectedNewCompressedPath, 'utf8')).toContain('compressed:');
  });

  test('should handle file compression errors', async () => {
    const failingFilePath = '/test/failing.txt';
    await expect(compressFile(failingFilePath)).rejects.toThrow(`file "${failingFilePath}" does not exist`);
  });

  test('should handle stream errors during compression', async () => {
    const filePath = '/test/source.txt';
    vol.fromJSON({ [filePath]: Buffer.from('content', 'utf-8') });

    const mockedFs = await import('fs');
    vi.spyOn(mockedFs, 'createReadStream').mockImplementationOnce(() => {
      const readable = new Readable();
      readable._read = () => {};
      process.nextTick(() => {
        readable.emit('error', new Error('Stream error'));
      });
      return readable;
    });

    await expect(compressFile(filePath)).rejects.toThrow('Stream error');
  });

  test('should perform compression and decompression', async () => {
    const filePath = './files/source.txt';
    const fileContent = 'This is a test file content';
    vol.fromJSON({ [filePath]: Buffer.from(fileContent, 'utf-8') });

    await performCompressionAndDecompression();

    expect(vol.existsSync('./files/source.txt.gz')).toBe(true);
    expect(vol.existsSync('./files/source_decompressed.txt')).toBe(true);
    expect(vol.readFileSync('./files/source_decompressed.txt', 'utf8')).toBe(fileContent);
  });

  afterEach(() => {
    vol.reset();
    vi.restoreAllMocks();
  });
});
