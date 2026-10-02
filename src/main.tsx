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
import './index.css'

// the EVM wallet window in the site's colour and type, taken from the stylesheet
const walletWindowTheme = lightTheme({ accentColor: 'var(--color-primary)', accentColorForeground: 'white', borderRadius: 'large' })
walletWindowTheme.fonts.body = 'inherit'

// A wallet connects on whatever chain it is on, and the bridge asks for its source chain
// when it sends. RainbowKit otherwise moves a wallet sitting on a chain this page does not
// carry (Polygon, Optimism...) to Ethereum mainnet, testnet included, and a person who
// declines that is left unconnected. Every wagmi connector reads chain 0 as none asked.
const NO_CHAIN_ON_CONNECT = 0

// retry once, 30s stale - RPC blips spam otherwise
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
