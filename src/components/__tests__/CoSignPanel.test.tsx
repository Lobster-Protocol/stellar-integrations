import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Account, TransactionBuilder, Operation, StrKey, Networks } from '@stellar/stellar-sdk'

// the ed25519 lib rejects jsdom's Uint8Array, so nothing is signed for real here:
// the quorum check reports every signer as signed instead
vi.mock('../../integrations/stellar/multisig', async () => {
  const actual = await vi.importActual<typeof import('../../integrations/stellar/multisig')>(
    '../../integrations/stellar/multisig',
  )
  return {
    ...actual,
    signedBy: (_xdr: string, _network: string, a: AccountSigning) => a.signers.map((s) => s.key),
    accumulatedWeight: (_xdr: string, _network: string, a: AccountSigning) =>
      a.signers.reduce((n, s) => n + s.weight, 0),
  }
})
vi.mock('../../integrations/signer/wallet-kit-signer', () => ({ walletKitSigner: { signTransaction: vi.fn() } }))

import CoSignPanel from '../CoSignPanel'
import type { AccountSigning } from '../../integrations/stellar/multisig'

const ACCOUNT = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1))
const COSIGNER = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 2))

const twoOfTwo: AccountSigning = {
  accountId: ACCOUNT,
  masterWeight: 1,
  signers: [
    { key: ACCOUNT, weight: 1 },
    { key: COSIGNER, weight: 1 },
  ],
  thresholds: { low: 2, med: 2, high: 2 },
}

const USED_SEQUENCE = /already used this account sequence number/

// the change SharedControl sends through horizon to turn shared control off
function revertTx(): string {
  return new TransactionBuilder(new Account(ACCOUNT, '42'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(
      Operation.setOptions({
        signer: { ed25519PublicKey: COSIGNER, weight: 0 },
        masterWeight: 1,
        lowThreshold: 1,
        medThreshold: 1,
        highThreshold: 1,
      }),
    )
    .setTimeout(300)
    .build()
    .toXDR()
}

function submitAndFail(error: Error) {
  render(
    <CoSignPanel
      network="testnet"
      signing={twoOfTwo}
      baseXdr={revertTx()}
      connected={ACCOUNT}
      submit={() => Promise.reject(error)}
      onSubmitted={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
}

// horizon's submitTransaction passes the axios error through as is
function horizonRejection(code: string): Error {
  return Object.assign(new Error('Request failed with status code 400'), {
    response: { status: 400, data: { extras: { result_codes: { transaction: code } } } },
  })
}

afterEach(cleanup)

describe('CoSignPanel', () => {
  it('explains a used sequence number when horizon answers tx_bad_seq', async () => {
    submitAndFail(horizonRejection('tx_bad_seq'))
    expect(await screen.findByText(USED_SEQUENCE)).toBeInTheDocument()
  })

  it('explains a used sequence number when soroban rpc answers txBadSeq', async () => {
    submitAndFail(new Error('sendTransaction rejected: {"result":{"_switch":{"name":"txBadSeq","value":-5}}}'))
    expect(await screen.findByText(USED_SEQUENCE)).toBeInTheDocument()
  })

  it('keeps the plain error for other horizon result codes', async () => {
    submitAndFail(horizonRejection('tx_bad_auth'))
    expect(await screen.findByText('Request failed with status code 400')).toBeInTheDocument()
    expect(screen.queryByText(USED_SEQUENCE)).not.toBeInTheDocument()
  })
})
