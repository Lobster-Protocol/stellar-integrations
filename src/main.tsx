import { Buffer } from 'buffer'
window.Buffer = Buffer

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { WalletProvider } from './contexts/WalletContext'
import { NetworkProvider } from './contexts/NetworkContext'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <NetworkProvider>
        <WalletProvider>
          <App />
        </WalletProvider>
      </NetworkProvider>
    </BrowserRouter>
  </StrictMode>,
)
