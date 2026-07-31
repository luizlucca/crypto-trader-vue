import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = dirname(fileURLToPath(import.meta.url))

// Vitest does not read electron.vite.config.ts, so the module boundary aliases
// are declared again here. Keep both files in sync.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(root, 'shared'),
      '@': resolve(root, 'src'),
    },
  },
  test: {
    include: ['{src,shared,electron}/**/*.test.ts'],
  },
})
