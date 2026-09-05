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

describe('CustodyModeToggle', () => {
  it('renders the browser wallet and the DFNS demo options', () => {
    wrap(<CustodyModeToggle />)
    expect(screen.getByText('Custody mode')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Browser wallet/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /DFNS \(Lobster demo\)/ })).toBeInTheDocument()
  })

  it('names the DFNS option a shared testnet sandbox, not the user own custody', () => {
    wrap(<CustodyModeToggle />)
    expect(screen.getByText(/not your own DFNS org/)).toBeInTheDocument()
    expect(screen.getByText('Testnet sandbox')).toBeInTheDocument()
  })

  it('explains that connecting your own DFNS never pastes a key', () => {
    wrap(<CustodyModeToggle />)
    fireEvent.click(screen.getByRole('button', { name: /Connect your own DFNS/ }))
    expect(screen.getByText(/no key to paste here/)).toBeInTheDocument()
  })

  it('writes "dfns" to localStorage when the user picks the DFNS demo', () => {
    localStorage.clear()
    wrap(<CustodyModeToggle />)
    fireEvent.click(screen.getByRole('button', { name: /DFNS \(Lobster demo\)/ }))
    expect(localStorage.getItem('lob_custody_mode')).toBe('dfns')
  })

  it('writes "wallet-kit" to localStorage when the user picks the browser wallet', () => {
    localStorage.setItem('lob_custody_mode', 'dfns')
    wrap(<CustodyModeToggle />)
    fireEvent.click(screen.getByRole('button', { name: /Browser wallet/ }))
    expect(localStorage.getItem('lob_custody_mode')).toBe('wallet-kit')
  })
})
