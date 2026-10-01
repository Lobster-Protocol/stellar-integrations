import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { StrKey } from '@stellar/stellar-sdk'

import SharedControl from '../SharedControl'
import type { AccountSigning } from '../../integrations/stellar/multisig'

const { mockWallet, mockSigning } = vi.hoisted(() => ({ mockWallet: vi.fn(), mockSigning: vi.fn() }))

vi.mock('../../contexts/WalletContext', () => ({ useWallet: () => mockWallet() }))
vi.mock('../../contexts/NetworkContext', () => ({ useNetwork: () => ({ network: 'testnet' }) }))
vi.mock('../../integrations/stellar/use-account-signing', () => ({ useAccountSigning: () => mockSigning() }))
vi.mock('../../components/CoSignPanel', () => ({ default: () => null }))

const ACCOUNT = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1))

// a 2-of-3 the way buildSetOptionsTx sets one up: high is the full weight, above med
const twoOfThree: AccountSigning = {
  accountId: ACCOUNT,
  masterWeight: 1,
  signers: [
    { key: ACCOUNT, weight: 1 },
    { key: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 2)), weight: 1 },
    { key: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 3)), weight: 1 },
  ],
  thresholds: { low: 2, med: 2, high: 3 },
}

afterEach(cleanup)

describe('SharedControl', () => {
  it('warns that turning it off may need every signer', () => {
    mockWallet.mockReturnValue({ address: ACCOUNT })
    mockSigning.mockReturnValue({ data: twoOfThree, isLoading: false })
    render(<SharedControl />)
    expect(screen.getByText(/high threshold/)).toHaveTextContent(/every signer/)
    expect(screen.queryByText(/same quorum/)).not.toBeInTheDocument()
  })
})
