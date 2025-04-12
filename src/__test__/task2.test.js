import { join } from 'path';
import { decompressFile } from '../main';
import { describe, beforeEach, test, expect, vi, afterEach } from 'vitest';
import { vol } from 'memfs';
import { Readable, Writable } from 'stream';

// Мокуємо fs за допомогою memfs і unionfs
vi.mock('fs', async () => {
  const realFs = await vi.importActual('fs');
  const memfs = require('memfs').fs;
  const unionFs = require('unionfs').ufs;
  unionFs.use(memfs).use(realFs);
  unionFs.constants = realFs.constants;

  const mockedPromises = {
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
    ...memfs.promises
  };

  return {
    default: unionFs,
    promises: mockedPromises,
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

describe('decompressFile function', () => {
  const baseDir = join(__dirname, '..', 'files');
  const originalFilePath = join(baseDir, 'source.txt');
  const compressedFilePath = join(baseDir, 'source.txt.gz');
  const destinationFilePath = join(baseDir, 'source_decompressed.txt');
  const originalContent = 'This is the original content of the file';

  beforeEach(() => {
    vol.reset(); // Очищення віртуальної файлової системи
    vol.fromJSON({
      [originalFilePath]: Buffer.from(originalContent, 'utf-8'),
      [compressedFilePath]: Buffer.from('compressed:' + originalContent, 'utf-8') // Імітуємо стиснений вміст
    });
  });

  test('should create a decompressed file and match the original content', async () => {
    const resultPath = await decompressFile(compressedFilePath, destinationFilePath);
    const fileExists = vol.existsSync(resultPath);
    expect(fileExists).toBe(true);

    const decompressedContent = vol.readFileSync(resultPath, 'utf8');
    expect(decompressedContent).toEqual(originalContent);
  });

  test('should create a unique filename if destination file exists', async () => {
    // Спочатку створюємо файл з таким самим ім'ям як призначення
    vol.fromJSON({
      [destinationFilePath]: Buffer.from('existing content', 'utf-8')
    });

    const expectedUniqueFileName = join(baseDir, 'source_decompressed_1.txt');
    
    const resultPath = await decompressFile(compressedFilePath, destinationFilePath);
    
    expect(resultPath).toBe(expectedUniqueFileName);
    expect(vol.existsSync(resultPath)).toBe(true);
    expect(vol.readFileSync(resultPath, 'utf8')).toEqual(originalContent);
    // Переконаємося, що оригінальний файл залишився незмінним
    expect(vol.readFileSync(destinationFilePath, 'utf8')).toEqual('existing content');
  });

  test('should handle read errors gracefully', async () => {
    const mockedFs = await import('fs'); // Отримуємо замокану версію fs
    vi.spyOn(mockedFs.promises, 'access').mockRejectedValueOnce(new Error('Failed to access file'));
    await expect(decompressFile(compressedFilePath, destinationFilePath)).rejects.toThrow('Failed to access file');
  });

  test('should handle stream errors during decompression', async () => {
    const mockedFs = await import('fs');
    vi.spyOn(mockedFs, 'createReadStream').mockImplementationOnce(() => {
      const readable = new Readable();
      readable._read = () => {};
      process.nextTick(() => {
        readable.emit('error', new Error('Stream error'));
      });
      return readable;
    });

    await expect(decompressFile(compressedFilePath, destinationFilePath)).rejects.toThrow('Stream error');
  });

  afterEach(() => {
    vol.reset(); // Очищення після кожного тесту
    vi.restoreAllMocks();
  });
});
