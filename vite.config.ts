import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
      // package main is lib/index.js but the bundle is lib/stellarbroker.js.
      // point to the esm source until upstream fixes the main path.
      '@stellar-broker/client': '@stellar-broker/client/src/index.js',
    },
  },
  optimizeDeps: {
    exclude: ['@stellar-broker/client'],
  },
  build: {
    rollupOptions: {
      output: {
        // the big vendor libs get their own chunks, so a deploy that only
        // touches app code leaves them in the browser cache
        manualChunks(id) {
          if (id.includes('node_modules/@stellar/stellar-sdk')) {
            return 'stellar-sdk'
          }
          if (id.includes('node_modules/recharts')) {
            return 'recharts'
          }
          if (id.includes('node_modules/@creit-tech/')) {
            return 'wallets-kit'
          }
          return undefined
        },
      },
    },
  },
})
