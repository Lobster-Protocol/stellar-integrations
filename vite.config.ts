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
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy third-party libs into their own chunks so they can
        // be cached across page navigations and across deploys (assuming
        // the lib version itself doesn't change).
        manualChunks(id) {
          if (id.includes('node_modules/@stellar/stellar-sdk')) {
            return 'stellar-sdk'
          }
          if (id.includes('node_modules/@allbridge/')) {
            return 'allbridge-sdk'
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
