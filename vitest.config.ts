import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const root = dirname(fileURLToPath(import.meta.url))

// Vitest does not read electron.vite.config.ts, so the module boundary aliases
// are declared again here. Keep both files in sync.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@shared': resolve(root, 'shared'),
      '@': resolve(root, 'src'),
      '@app': resolve(root, 'src/app'),
      '@chart': resolve(root, 'src/features/chart'),
      '@desktop': resolve(root, 'src/platform/desktop'),
      '@drawings': resolve(root, 'src/features/drawings'),
      '@indicators': resolve(root, 'src/features/indicators'),
      '@market': resolve(root, 'src/features/market'),
      '@orderbook': resolve(root, 'src/features/orderbook'),
      '@positions': resolve(root, 'src/features/positions'),
      '@providers': resolve(root, 'src/features/providers'),
      '@renderer-shared': resolve(root, 'src/shared'),
      '@security': resolve(root, 'src/features/security'),
      '@settings': resolve(root, 'src/features/settings'),
      '@trading': resolve(root, 'src/features/trading'),
      '@workspace': resolve(root, 'src/features/workspace'),
    },
  },
  test: {
    include: ['{src,shared,electron}/**/*.test.ts'],
  },
})
