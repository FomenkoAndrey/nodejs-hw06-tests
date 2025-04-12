// vitest.setup.js
import { vi } from 'vitest';
import { Transform } from 'stream';

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
