import { join } from 'path';
import { decompressFile } from '../main';
import { describe, beforeEach, test, expect, vi, afterEach } from 'vitest';
import { vol } from 'memfs';
import { Readable, Writable, Transform } from 'stream';

// Мокуємо path
vi.mock('path', () => {
  return {
    parse: vi.fn((filePath) => {
      const baseName = filePath.split('/').pop();
      const lastDotIndex = baseName.lastIndexOf('.');
      
      let name, ext;
      if (lastDotIndex === -1) {
        name = baseName;
        ext = '';
      } else {
        name = baseName.substring(0, lastDotIndex);
        ext = baseName.substring(lastDotIndex);
      }
      
      const dir = filePath.substring(0, filePath.length - baseName.length - 1) || './files';
      
      return {
        dir,
        name,
        ext
      };
    }),
    join: vi.fn((dir, filename) => {
      if (dir.endsWith('/')) {
        return dir + filename;
      }
      return dir + '/' + filename;
    })
  };
});

// Мокуємо fs за допомогою memfs і unionfs
vi.mock('fs', async () => {
  const realFs = await vi.importActual('fs');
  const memfs = require('memfs').fs; // Використовуємо memfs.fs
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
    ...memfs.promises // Додаємо інші методи promises з memfs
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

// Мокуємо zlib
vi.mock('zlib', () => {
  return {
    createGunzip: vi.fn(() => {
      const transform = new Transform();
      transform._transform = (chunk, encoding, callback) => {
        // Імітуємо розпакування: повертаємо оригінальний вміст без префікса "compressed:"
        const content = chunk.toString().replace('compressed:', '');
        callback(null, Buffer.from(content));
      };
      return transform;
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
    }, true); // true для додавання до існуючої віртуальної ФС

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
