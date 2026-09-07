import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import CustodyModeToggle from '../CustodyModeToggle'
import { CustodyProvider } from '../../contexts/CustodyContext'
import { NetworkProvider } from '../../contexts/NetworkContext'

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <NetworkProvider>
        <CustodyProvider>{node}</CustodyProvider>
      </NetworkProvider>
    </QueryClientProvider>,
  )
}

// The old "Browser wallet vs DFNS (Lobster demo)" mode toggle was removed: you sign with whatever
// wallet you connect at the top right, and this panel is only about connecting DFNS custody.
describe('CustodyModeToggle (DFNS custody panel)', () => {
  it('is titled DFNS custody and leads with connecting your own DFNS', () => {
    wrap(<CustodyModeToggle />)
    expect(screen.getByText('DFNS custody')).toBeInTheDocument()
    expect(screen.getByText(/Connect your own DFNS organization/)).toBeInTheDocument()
  })

  it('no longer shows the browser-wallet-vs-DFNS mode toggle', () => {
    wrap(<CustodyModeToggle />)
    expect(screen.queryByRole('button', { name: /^Browser wallet/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /DFNS \(Lobster demo\)/ })).not.toBeInTheDocument()
  })

  it('offers the Lobster testnet demo as a sandbox row', () => {
    wrap(<CustodyModeToggle />)
    expect(screen.getByText('Testnet sandbox')).toBeInTheDocument()
  })

  it('reveals the connect-a-relay form', () => {
    wrap(<CustodyModeToggle />)
    fireEvent.click(screen.getByRole('button', { name: /Connect a DFNS relay/ }))
    expect(screen.getByText(/Enter only a relay you run/)).toBeInTheDocument()
  })
})
