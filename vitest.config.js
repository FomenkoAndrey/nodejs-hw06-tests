import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.js'],
    include: ['**/*.test.js'],
    silent: true,
  },
  server: {
    deps: {
      inline: ['memfs', 'unionfs']
    }
  }
})
