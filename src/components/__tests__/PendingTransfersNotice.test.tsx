import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../contexts/NetworkContext', () => ({ useNetwork: () => ({ network: 'testnet' }) }))

import PendingTransfersNotice from '../PendingTransfersNotice'
import { saveIntent, trackTransfer, type TrackedTransfer } from '../../integrations/cctp/transfers'

const RECIPIENT = 'GAMNA2Q6NTZSUBLMEXLTIXYORE7OXJJBMEGIX7T2OXDAKIA7CCKN4RJV'

function transfer(over: Partial<TrackedTransfer> = {}): TrackedTransfer {
  return {
    id: `0x${'aa'.repeat(32)}`,
    network: 'testnet',
    chainKey: 'ARB',
    chainName: 'Arbitrum Sepolia',
    sourceDomain: 3,
    amount: '6.82',
    recipient: RECIPIENT,
    finality: 'fast',
    createdAt: 1,
    stage: 'burned',
    ...over,
  }
}

function at(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PendingTransfersNotice />
    </MemoryRouter>,
  )
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('PendingTransfersNotice', () => {
  it('renders nothing with no transfer pending', () => {
    const { container } = at('/')
    expect(container).toBeEmptyDOMElement()
  })

  it('links a signed transfer straight to finishing it', () => {
    trackTransfer(transfer({ attestedAt: 2 }))
    at('/')
    expect(screen.getByRole('heading', { name: 'A bridge transfer is on its way' })).toBeInTheDocument()
    expect(screen.getByText(/6\.82 USDC from Arbitrum Sepolia: signed by Circle, one signature on Stellar delivers it/)).toBeInTheDocument()
    expect(screen.getByText(/for GAMNA2\.\.\.4RJV/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Finish' })).toHaveAttribute('href', `/bridges?finish=${transfer().id}`)
  })

  it('links to Bridges while Circle signs', () => {
    trackTransfer(transfer())
    at('/performance')
    expect(screen.getByText(/Circle is signing it/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See it' })).toHaveAttribute('href', '/bridges')
  })

  it('renders nothing on /bridges', () => {
    trackTransfer(transfer({ attestedAt: 2 }))
    const { container } = at('/bridges')
    expect(container).toBeEmptyDOMElement()
  })

  it('counts orphan burn intents but not delivered transfers', () => {
    trackTransfer(transfer({ id: 'done', stage: 'delivered' }))
    saveIntent({
      id: 'intent-a',
      network: 'testnet',
      chainKey: 'BASE',
      chainName: 'Base Sepolia',
      amount: '5',
      units: '5000000',
      from: '0xDCD592A255323772f9B1EF5db83D2A0CFcF91a37',
      recipient: RECIPIENT,
      finality: 'fast',
      startedAt: 1,
      session: 'a-page-that-closed',
    })
    trackTransfer(transfer({ attestedAt: 2 }))
    at('/')
    expect(screen.getByRole('heading', { name: '2 bridge transfers are on their way' })).toBeInTheDocument()
    expect(screen.getByText('Looking on Base Sepolia for the 5 USDC burn your wallet was asked to sign before the page closed.')).toBeInTheDocument()
  })
})
