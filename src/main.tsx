// polyfills first, the sdk needs Buffer before anything else imports it
import './polyfills'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'
import { wagmiConfig } from './integrations/evm/config'
import { WalletProvider } from './contexts/WalletContext'
import { NetworkProvider } from './contexts/NetworkContext'
import { CustodyProvider } from './contexts/CustodyContext'
import { ToastProvider } from './contexts/ToastContext'
import App from './App'
import { watchForNewBuild } from './utils/new-build'
import { refreshBalancesOnLanded } from './integrations/stellar/landed'
import './index.css'

// a tab open across a deploy reloads instead of failing on a chunk it never fetched
watchForNewBuild()

const walletWindowTheme = lightTheme({ accentColor: 'var(--color-primary)', accentColorForeground: 'white', borderRadius: 'large' })
walletWindowTheme.fonts.body = 'inherit'

// RainbowKit otherwise moves a wallet on an unlisted chain to Ethereum mainnet, even on
// testnet, and a decline leaves it unconnected. wagmi connectors read 0 as no chain.
const NO_CHAIN_ON_CONNECT = 0

// RPC blips would spam errors otherwise
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// a confirmed transaction refreshes the balances it changed, on whatever screen is open
refreshBalancesOnLanded(queryClient)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {/* the site is in English; left alone, the window follows the browser's language */}
          <RainbowKitProvider
            theme={walletWindowTheme}
            modalSize="compact"
            locale="en-US"
            appInfo={{ appName: 'Lobster Protocol' }}
            initialChain={NO_CHAIN_ON_CONNECT}
          >
            <NetworkProvider>
              <ToastProvider>
                <WalletProvider>
                  <CustodyProvider>
                    <App />
                  </CustodyProvider>
                </WalletProvider>
              </ToastProvider>
            </NetworkProvider>
          </RainbowKitProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
