import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'electron-vite'

const root = dirname(fileURLToPath(import.meta.url))

// Desktop processes resolve only the process-neutral contract. Renderer
// packages receive their own aliases without leaking them into main/preload.
const sharedAlias = {
  '@shared': resolve(root, 'shared'),
}

const rendererAlias = {
  ...sharedAlias,
  '@': resolve(root, 'src'),
  '@app': resolve(root, 'src/app'),
  '@chart': resolve(root, 'src/features/chart'),
  '@desktop': resolve(root, 'src/platform/desktop'),
  '@drawings': resolve(root, 'src/features/drawings'),
  '@indicators': resolve(root, 'src/features/indicators'),
  '@market': resolve(root, 'src/features/market'),
  '@orderbook': resolve(root, 'src/features/orderbook'),
  '@positions': resolve(root, 'src/features/positions'),
  '@renderer-shared': resolve(root, 'src/shared'),
  '@security': resolve(root, 'src/features/security'),
  '@settings': resolve(root, 'src/features/settings'),
  '@trading': resolve(root, 'src/features/trading'),
  '@workspace': resolve(root, 'src/features/workspace'),
}

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
    build: {
      rollupOptions: {
        input: {
          index: resolve(root, 'electron/main/index.ts'),
          'market-data': resolve(root, 'electron/utility/market-data/index.ts'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
          chunkFileNames: 'chunks/[name]-[hash].cjs',
        },
      },
    },
  },
  preload: {
    resolve: { alias: sharedAlias },
    build: {
      rollupOptions: {
        input: {
          index: resolve(root, 'electron/preload/index.ts'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
          chunkFileNames: 'chunks/[name]-[hash].cjs',
        },
      },
    },
  },
  renderer: {
    root,
    resolve: { alias: rendererAlias },
    plugins: [vue()],
    build: {
      rollupOptions: {
        input: resolve(root, 'index.html'),
      },
    },
  },
})
