import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import RoutingEngineCard from '../RoutingEngineCard'
import { NetworkProvider } from '../../contexts/NetworkContext'

const ORIG_PARTNER = import.meta.env.VITE_STELLAR_BROKER_PARTNER_KEY

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  Reflect.set(import.meta.env, 'VITE_STELLAR_BROKER_PARTNER_KEY', ORIG_PARTNER)
})

function wrap(node: React.ReactNode) {
  return render(<NetworkProvider>{node}</NetworkProvider>)
}

describe('RoutingEngineCard', () => {
  it('renders the broker endpoint and the protocol chips', () => {
    wrap(<RoutingEngineCard />)
    expect(screen.getByText(/Routing engine/i)).toBeInTheDocument()
    expect(screen.getByText(/api\.stellar\.broker/)).toBeInTheDocument()
    for (const p of ['Stellar Broker', 'Soroswap', 'Aquarius', 'Phoenix', 'Stellar DEX']) {
      expect(screen.getByText(p, { exact: true })).toBeInTheDocument()
    }
  })

  it('calls the broker configured on mainnet, with no partner-key jargon, when the key is unset', () => {
    localStorage.setItem('lob_network', 'mainnet')
    Reflect.set(import.meta.env, 'VITE_STELLAR_BROKER_PARTNER_KEY', '')
    wrap(<RoutingEngineCard />)
    expect(screen.getByText('configured', { exact: true })).toBeInTheDocument()
    expect(screen.queryByText(/partner key/i)).not.toBeInTheDocument()
  })

  it('still reads configured on mainnet when the partner key is set', () => {
    localStorage.setItem('lob_network', 'mainnet')
    Reflect.set(import.meta.env, 'VITE_STELLAR_BROKER_PARTNER_KEY', 'test-key')
    wrap(<RoutingEngineCard />)
    expect(screen.getByText('configured', { exact: true })).toBeInTheDocument()
  })

  it('never claims a state it did not measure', () => {
    localStorage.setItem('lob_network', 'mainnet')
    const { container } = wrap(<RoutingEngineCard />)
    // green is reserved for something actually called, and this card calls nothing
    expect(container.querySelectorAll('.bg-green')).toHaveLength(0)
    expect(screen.getByText(/Neither has been called/i)).toBeInTheDocument()
  })

  it('shows the broker as mainnet only when on testnet', () => {
    localStorage.setItem('lob_network', 'testnet')
    wrap(<RoutingEngineCard />)
    expect(screen.getByText(/mainnet only/i)).toBeInTheDocument()
  })

  it('renders "none yet" when no route entry is in localStorage', () => {
    wrap(<RoutingEngineCard />)
    expect(screen.getByText(/Last route/i)).toBeInTheDocument()
    expect(screen.getByText(/none yet/i)).toBeInTheDocument()
  })

  it('renders the most recent route entry when localStorage has one', () => {
    localStorage.setItem(
      'lob_routing_log',
      JSON.stringify([
        {
          ts: Date.now(),
          path: 'broker',
          sellingAsset: 'xlm',
          buyingAsset: 'USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
          sellingAmount: '100',
          buyingAmount: '23.45',
          network: 'mainnet',
        },
      ]),
    )
    wrap(<RoutingEngineCard />)
    expect(screen.getByText(/100 XLM/)).toBeInTheDocument()
    expect(screen.getByText(/23.45 USDC/)).toBeInTheDocument()
    expect(screen.getByText('broker')).toBeInTheDocument()
  })
})
