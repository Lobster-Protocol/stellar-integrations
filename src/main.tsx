// Polyfills MUST stay first — see comment in polyfills.ts.
import './polyfills'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WalletProvider } from './contexts/WalletContext'
import { NetworkProvider } from './contexts/NetworkContext'
import App from './App'
import './index.css'

// Single QueryClient instance, lives for the lifetime of the app.
// Defaults tuned for our use case: indexer queries are read-mostly, RPC
// state changes every ~5 s (one ledger), and we don't want exponential
// retry storms during a Stellar RPC blip.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <NetworkProvider>
          <WalletProvider>
            <App />
          </WalletProvider>
        </NetworkProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
