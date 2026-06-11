// Separate Vitest config, keeping it out of vite.config.ts means the
// production build (tsc -b + vite build) doesn't need the vitest types at
// compile time. Vitest picks this file up by default.

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
      // see vite.config.ts: @stellar-broker/client main path is broken upstream.
      '@stellar-broker/client': '@stellar-broker/client/src/index.js',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setup-tests.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'server/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', 'tests'],
  },
})
