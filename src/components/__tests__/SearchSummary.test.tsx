import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const { account } = vi.hoisted(() => ({ account: { address: undefined as string | undefined } }))
vi.mock('wagmi', async (importOriginal) => ({ ...(await importOriginal<typeof import('wagmi')>()), useAccount: () => account }))

import { SearchSummary } from '../BridgeTransfers'
import { recordSearch, rememberWallet } from '../../integrations/cctp/transfers'

const STELLAR = 'GAMNA2Q6NTZSUBLMEXLTIXYORE7OXJJBMEGIX7T2OXDAKIA7CCKN4RJV'
const EVM = '0xDCD592A255323772f9B1EF5db83D2A0CFcF91a37'

beforeEach(() => {
  localStorage.clear()
  account.address = undefined
})
afterEach(cleanup)

describe('SearchSummary', () => {
  it('asks for the wallets when none is connected', () => {
    render(<SearchSummary network="testnet" stellar={null} />)
    expect(screen.getByText(/Connect the wallets you bridged with/)).toBeInTheDocument()
  })

  it('splits finished searches from running ones', () => {
    account.address = EVM
    recordSearch('testnet', `stellar:${STELLAR}`, { at: Date.now(), complete: true })
    recordSearch('testnet', `evm:BASE:${EVM.toLowerCase()}`, { at: Date.now(), head: '10', reachedFrom: '1', complete: true })
    render(<SearchSummary network="testnet" stellar={STELLAR} />)
    const text = screen.getByText(/Looked on chain/).textContent ?? ''
    expect(text).toMatch(/for burns out of GAMNA2\.\.\.4RJV over the last 30 days, and for burns from 0xDCD5\.\.\.1a37 on Base Sepolia over about the last day\./)
    expect(text).toMatch(/Reading Arbitrum Sepolia, Ethereum Sepolia for transfers that have not arrived\./)
    expect(text).not.toMatch(/once the EVM wallet that sent it is connected/)
  })

  it('asks for the EVM wallet behind inbound transfers', () => {
    recordSearch('testnet', `stellar:${STELLAR}`, { at: Date.now(), complete: true })
    render(<SearchSummary network="testnet" stellar={STELLAR} />)
    expect(screen.getByText(/A transfer into Stellar shows up once the EVM wallet that sent it is connected\./)).toBeInTheDocument()
  })

  it('lists a remembered wallet that is not connected', () => {
    rememberWallet('testnet', 'evm', EVM)
    recordSearch('testnet', `stellar:${STELLAR}`, { at: Date.now(), complete: true })
    recordSearch('testnet', `evm:BASE:${EVM.toLowerCase()}`, { at: Date.now(), head: '10', reachedFrom: '1', complete: true })
    render(<SearchSummary network="testnet" stellar={STELLAR} />)
    const text = screen.getByText(/Looked on chain/).textContent ?? ''
    expect(text).toMatch(/burns from 0xDCD5\.\.\.1a37 on Base Sepolia/)
    expect(text).toMatch(/A wallet that bridged from this browser is searched even when it is not connected\./)
    expect(text).not.toMatch(/once the EVM wallet that sent it is connected/)
  })
})
