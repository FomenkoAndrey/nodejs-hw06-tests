import { join } from 'path';
import { compressFile, decompressFile } from '../main';
import { describe, beforeEach, test, expect, vi, afterEach } from 'vitest';
import { vol } from 'memfs';
import { Readable, Writable, Transform } from 'stream';

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
      access: vi.fn((filePath, mode) => {
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
      readFile: vi.fn((filePath) => {
        return new Promise((resolve, reject) => {
          if (!vol.existsSync(filePath)) {
            const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`);
            error.code = 'ENOENT';
            reject(error);
          } else {
            resolve(vol.readFileSync(filePath));
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
    })
  };
});

// Мокуємо zlib
vi.mock('zlib', () => {
  return {
    createGzip: vi.fn(() => {
      const transform = new Transform();
      transform._transform = (chunk, encoding, callback) => {
        callback(null, Buffer.from('compressed:' + chunk));
      };
      return transform;
    }),
    createGunzip: vi.fn(() => {
      const transform = new Transform();
      transform._transform = (chunk, encoding, callback) => {
        const content = chunk.toString().replace('compressed:', '');
        callback(null, Buffer.from(content));
      };
      return transform;
    })
  };
});

// Мокуємо util
vi.mock('util', () => {
  return {
    promisify: vi.fn((fn) => {
      return (...args) => {
        const [source, transform, destination] = args;
        return new Promise((resolve, reject) => {
          source.on('error', reject);
          transform.on('error', reject);
          destination.on('error', reject);
          source.pipe(transform).pipe(destination);
          destination.on('finish', resolve);
        });
      };
    })
  };
});

describe('File Content Comparison', () => {
  const baseDir = join(__dirname, '..', 'files');
  const originalFilePath = join(baseDir, 'source.txt');
  const compressedFilePath = join(baseDir, 'source.txt.gz');
  const decompressedFilePath = join(baseDir, 'source_decompressed.txt');
  const originalContent = 'This is the original content of the file';

  beforeEach(() => {
    vol.reset(); // Очищення віртуальної файлової системи
    vol.fromJSON({
      [originalFilePath]: Buffer.from(originalContent, 'utf-8')
    });
  });

  test('original and decompressed files should have the same content', async () => {
    // Створюємо стиснений файл
    await compressFile(originalFilePath);
    // Розпаковуємо файл
    await decompressFile(compressedFilePath, decompressedFilePath);

    // Асинхронно читаємо вміст
    const fsPromises = (await import('fs')).promises;
    const originalContentRead = await fsPromises.readFile(originalFilePath, 'utf8');
    const decompressedContent = await fsPromises.readFile(decompressedFilePath, 'utf8');

    expect(decompressedContent).toEqual(originalContentRead);
  });

  test('should handle missing files gracefully', async () => {
    vol.reset(); // Жодних файлів
    const fsPromises = (await import('fs')).promises;
    await expect(fsPromises.readFile(originalFilePath, 'utf8')).rejects.toThrow('ENOENT');
    await expect(fsPromises.readFile(decompressedFilePath, 'utf8')).rejects.toThrow('ENOENT');
  });

  afterEach(() => {
    vol.reset();
    vi.restoreAllMocks();
  });
});
