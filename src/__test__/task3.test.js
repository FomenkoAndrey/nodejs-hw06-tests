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
    const compressedPath = await compressFile(originalFilePath);
    expect(compressedPath).toBe(compressedFilePath);
    // Розпаковуємо файл
    const resultPath = await decompressFile(compressedFilePath, decompressedFilePath);
    expect(resultPath).toBe(decompressedFilePath);

    // Асинхронно читаємо вміст
    const fsPromises = (await import('fs')).promises;
    const originalContentRead = await fsPromises.readFile(originalFilePath, 'utf8');
    const decompressedContent = await fsPromises.readFile(decompressedFilePath, 'utf8');

    expect(decompressedContent).toEqual(originalContentRead);

    // Перевіряємо вміст стисненого файлу
    const compressedContent = await fsPromises.readFile(compressedFilePath, 'utf8');
    expect(compressedContent).toContain('compressed:');
  });

  test('should handle unique filenames when compressing and decompressing', async () => {
    // Додаємо існуючий стиснений файл
    vol.fromJSON({
      [originalFilePath]: Buffer.from(originalContent, 'utf-8'),
      [compressedFilePath]: Buffer.from('already compressed', 'utf-8')
    });

    // Перевіряємо створення унікального імені при стисненні
    const uniqueCompressedPath = await compressFile(originalFilePath);
    expect(uniqueCompressedPath).toBe(join(baseDir, 'source_1.txt.gz'));

    // Додаємо існуючий розпакований файл
    vol.fromJSON({
      [decompressedFilePath]: Buffer.from('existing decompressed content', 'utf-8')
    });

    // Перевіряємо створення унікального імені при розпакуванні
    const uniqueDecompressedPath = await decompressFile(uniqueCompressedPath, decompressedFilePath);
    expect(uniqueDecompressedPath).toBe(join(baseDir, 'source_decompressed_1.txt'));

    // Перевіряємо вміст файлів
    const fsPromises = (await import('fs')).promises;
    const originalContentRead = await fsPromises.readFile(originalFilePath, 'utf8');
    const decompressedContent = await fsPromises.readFile(uniqueDecompressedPath, 'utf8');
    expect(decompressedContent).toEqual(originalContentRead);
  });

  test('should handle stream errors during both compression and decompression', async () => {
    const mockedFs = await import('fs');

    // Мокуємо помилку потоку читання при стисненні
    vi.spyOn(mockedFs, 'createReadStream').mockImplementationOnce(() => {
      const readable = new Readable();
      readable._read = () => {};
      process.nextTick(() => {
        readable.emit('error', new Error('Compression stream error'));
      });
      return readable;
    });

    await expect(compressFile(originalFilePath)).rejects.toThrow('Compression stream error');

    // Створюємо стиснений файл для тестування розпакування
    vi.spyOn(mockedFs, 'createReadStream').mockImplementation(() => {
      const content = vol.readFileSync(originalFilePath);
      const readable = new Readable();
      readable._read = () => {};
      readable.push(Buffer.from('compressed:' + content));
      readable.push(null);
      return readable;
    });
    await compressFile(originalFilePath);

    // Мокуємо помилку потоку читання при розпакуванні
    vi.spyOn(mockedFs, 'createReadStream').mockImplementationOnce(() => {
      const readable = new Readable();
      readable._read = () => {};
      process.nextTick(() => {
        readable.emit('error', new Error('Decompression stream error'));
      });
      return readable;
    });

    await expect(decompressFile(compressedFilePath, decompressedFilePath)).rejects.toThrow('Decompression stream error');
  });

  test('should handle missing files gracefully', async () => {
    vol.reset(); // Жодних файлів
    const fsPromises = (await import('fs')).promises;
    await expect(fsPromises.readFile(originalFilePath, 'utf8')).rejects.toThrow('ENOENT');
    await expect(fsPromises.readFile(decompressedFilePath, 'utf8')).rejects.toThrow('ENOENT');
  });

  test('should handle zlib errors during decompression', async () => {
    const mockedZlib = await import('zlib');
    vi.spyOn(mockedZlib, 'createGunzip').mockImplementationOnce(() => {
      const transform = new Transform();
      transform._transform = (chunk, encoding, callback) => {
        callback(new Error('Invalid Gzip data'));
      };
      return transform;
    });

    await compressFile(originalFilePath);
    await expect(decompressFile(compressedFilePath, decompressedFilePath)).rejects.toThrow('Invalid Gzip data');
  });

  afterEach(() => {
    vol.reset();
    vi.restoreAllMocks();
  });
});
