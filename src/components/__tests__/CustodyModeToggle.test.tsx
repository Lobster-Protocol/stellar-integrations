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
  it('renders both wallet kit and DFNS MPC options', () => {
    wrap(<CustodyModeToggle />)
    expect(screen.getByText('Custody mode')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Wallet kit/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /DFNS MPC/ })).toBeInTheDocument()
  })

  it('writes "dfns" to localStorage when the user picks DFNS MPC', () => {
    localStorage.clear()
    wrap(<CustodyModeToggle />)
    fireEvent.click(screen.getByRole('button', { name: /DFNS MPC/ }))
    expect(localStorage.getItem('lob_custody_mode')).toBe('dfns')
  })

  it('writes "wallet-kit" to localStorage when the user picks Wallet kit', () => {
    localStorage.setItem('lob_custody_mode', 'dfns')
    wrap(<CustodyModeToggle />)
    fireEvent.click(screen.getByRole('button', { name: /Wallet kit/ }))
    expect(localStorage.getItem('lob_custody_mode')).toBe('wallet-kit')
  })
})
