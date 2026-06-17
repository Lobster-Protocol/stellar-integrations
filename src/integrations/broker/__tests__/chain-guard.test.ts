import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromXDRMock, fromScAddressMock } = vi.hoisted(() => ({
  fromXDRMock: vi.fn(),
  fromScAddressMock: vi.fn(),
}))

vi.mock('@stellar/stellar-sdk', async (orig) => {
  const actual = await orig<typeof import('@stellar/stellar-sdk')>()
  return {
    ...actual,
    TransactionBuilder: { fromXDR: fromXDRMock },
    FeeBumpTransaction: actual.FeeBumpTransaction,
    Address: { ...actual.Address, fromScAddress: fromScAddressMock },
  }
})

import { inspectBrokerTx, BrokerTxRejected } from '../chain-guard'

const ACCOUNT = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'
const OTHER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
const PASSPHRASE = 'Public Global Stellar Network ; September 2015'
const SOROSWAP_ROUTER_MAINNET = 'CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH'
const USDC_SAC_MAINNET = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75'
const HOSTILE_CONTRACT = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYS9'

function invokeContractOp(contractId: string, source?: string) {
  return {
    type: 'invokeHostFunction',
    source,
    func: {
      switch: () => ({ name: 'hostFunctionTypeInvokeContract' }),
      invokeContract: () => ({ contractAddress: () => contractId }),
    },
  }
}

beforeEach(() => {
  fromXDRMock.mockReset()
  fromScAddressMock.mockReset()
  // each test that uses invokeHostFunction stubs fromScAddress.toString()
  // to return the contract id we pre-baked into the op mock.
  fromScAddressMock.mockImplementation((cid: string) => ({ toString: () => cid }))
})

describe('inspectBrokerTx', () => {
  it('passes path payment ops', () => {
    fromXDRMock.mockReturnValueOnce({
      source: ACCOUNT,
      operations: [
        { type: 'pathPaymentStrictSend', destination: ACCOUNT },
        { type: 'pathPaymentStrictReceive', destination: ACCOUNT },
      ],
    })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).not.toThrow()
  })

  it('refuses manage offer ops (their outflow is not capped)', () => {
    for (const type of ['manageSellOffer', 'manageBuyOffer', 'createPassiveSellOffer']) {
      fromXDRMock.mockReturnValueOnce({ source: ACCOUNT, operations: [{ type }] })
      expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).toThrow(/not allowed in a swap envelope/i)
    }
  })

  it('passes an invokeHostFunction targeting the soroswap router', () => {
    fromXDRMock.mockReturnValueOnce({
      source: ACCOUNT,
      operations: [invokeContractOp(SOROSWAP_ROUTER_MAINNET)],
    })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).not.toThrow()
  })

  it('passes an invokeHostFunction targeting the USDC SAC', () => {
    fromXDRMock.mockReturnValueOnce({
      source: ACCOUNT,
      operations: [invokeContractOp(USDC_SAC_MAINNET)],
    })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).not.toThrow()
  })

  it('refuses a bare payment op even when sourced by the trader', () => {
    fromXDRMock.mockReturnValue({ source: ACCOUNT, operations: [{ type: 'payment' }] })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).toThrow(BrokerTxRejected)
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).toThrow(/not allowed in a swap envelope/i)
  })

  it('refuses an invokeHostFunction targeting an arbitrary contract', () => {
    fromXDRMock.mockReturnValueOnce({
      source: ACCOUNT,
      operations: [invokeContractOp(HOSTILE_CONTRACT)],
    })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).toThrow(/not in the network allowlist/i)
  })

  it('refuses an invokeHostFunction with no contract address', () => {
    fromXDRMock.mockReturnValueOnce({
      source: ACCOUNT,
      operations: [
        {
          type: 'invokeHostFunction',
          func: {
            switch: () => ({ name: 'hostFunctionTypeCreateContract' }),
          },
        },
      ],
    })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).toThrow(/without a contract address/i)
  })

  it('refuses an account merge', () => {
    fromXDRMock.mockReturnValueOnce({ source: ACCOUNT, operations: [{ type: 'accountMerge' }] })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).toThrow(BrokerTxRejected)
  })

  it('refuses a change trust op', () => {
    fromXDRMock.mockReturnValueOnce({ source: ACCOUNT, operations: [{ type: 'changeTrust' }] })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).toThrow(/not allowed in a swap envelope/i)
  })

  it('refuses a set options op', () => {
    fromXDRMock.mockReturnValueOnce({ source: ACCOUNT, operations: [{ type: 'setOptions' }] })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).toThrow(BrokerTxRejected)
  })

  it('refuses when tx source is not the trader', () => {
    fromXDRMock.mockReturnValueOnce({ source: OTHER, operations: [{ type: 'pathPaymentStrictSend' }] })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).toThrow(/does not match trader/i)
  })

  it('refuses when an op source is not the trader', () => {
    fromXDRMock.mockReturnValueOnce({
      source: ACCOUNT,
      operations: [{ type: 'pathPaymentStrictSend', source: OTHER }],
    })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).toThrow(/not the trader/i)
  })

  it('refuses a path payment that credits an account other than the trader', () => {
    fromXDRMock.mockReturnValueOnce({
      source: ACCOUNT,
      operations: [{ type: 'pathPaymentStrictSend', sendAmount: '10', destination: OTHER }],
    })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE, 1_000_000_000n)).toThrow(/not the trader/i)
  })

  it('refuses a path payment with no destination set', () => {
    fromXDRMock.mockReturnValueOnce({
      source: ACCOUNT,
      operations: [{ type: 'pathPaymentStrictReceive', sendMax: '10' }],
    })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).toThrow(/unset destination/i)
  })

  it('refuses a tx whose fee is over the ceiling', () => {
    fromXDRMock.mockReturnValueOnce({
      source: ACCOUNT,
      fee: '20000000', // 2 XLM, over the 1 XLM ceiling
      operations: [{ type: 'pathPaymentStrictSend', sendAmount: '10', destination: ACCOUNT }],
    })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).toThrow(/over the .* ceiling/i)
  })

  it('passes a tx whose fee is within the ceiling', () => {
    fromXDRMock.mockReturnValueOnce({
      source: ACCOUNT,
      fee: '100',
      operations: [{ type: 'pathPaymentStrictSend', sendAmount: '10', destination: ACCOUNT }],
    })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).not.toThrow()
  })

  it('refuses a non-trader destination even with no cap set (keyless path)', () => {
    fromXDRMock.mockReturnValueOnce({
      source: ACCOUNT,
      operations: [{ type: 'pathPaymentStrictSend', sendAmount: '10', destination: OTHER }],
    })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).toThrow(/not the trader/i)
  })

  it('refuses a muxed destination (it never matches the trader G address)', () => {
    const MUXED = 'MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVAAAAAAAAAAAAAJLK'
    fromXDRMock.mockReturnValueOnce({
      source: ACCOUNT,
      operations: [{ type: 'pathPaymentStrictSend', sendAmount: '10', destination: MUXED }],
    })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).toThrow(/not the trader/i)
  })

  it('refuses a fee-bump whose bump fee is over the ceiling and funded by the trader', () => {
    fromXDRMock.mockReturnValueOnce({
      innerTransaction: {
        source: ACCOUNT,
        fee: '100',
        operations: [{ type: 'pathPaymentStrictSend', sendAmount: '10', destination: ACCOUNT }],
      },
      feeSource: ACCOUNT,
      fee: '20000000', // 2 XLM bump, over the ceiling
    })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).toThrow(/fee-bump fee .* ceiling/i)
  })

  it('allows a fee-bump whose bump fee is funded by a third party', () => {
    fromXDRMock.mockReturnValueOnce({
      innerTransaction: {
        source: ACCOUNT,
        fee: '100',
        operations: [{ type: 'pathPaymentStrictSend', sendAmount: '10', destination: ACCOUNT }],
      },
      feeSource: OTHER,
      fee: '99000000', // huge, but not the trader's money
    })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).not.toThrow()
  })

  it('refuses an invalid xdr', () => {
    fromXDRMock.mockImplementationOnce(() => {
      throw new Error('bad envelope')
    })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).toThrow(/invalid xdr/i)
  })

  it('passes a swap whose outflow is within the agreed cap', () => {
    fromXDRMock.mockReturnValueOnce({
      source: ACCOUNT,
      operations: [{ type: 'pathPaymentStrictSend', sendAmount: '90', destination: ACCOUNT }],
    })
    // cap 100 XLM = 1_000_000_000 stroops; a 90 XLM send is fine
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE, 1_000_000_000n)).not.toThrow()
  })

  it('rejects an invokeHostFunction when a spend cap is set (cap cannot bound it)', () => {
    fromXDRMock.mockReturnValueOnce({
      source: ACCOUNT,
      operations: [invokeContractOp(SOROSWAP_ROUTER_MAINNET)],
    })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE, 1_000_000_000n)).toThrow(/not bound by the spend cap/i)
  })

  it('rejects a swap that spends more than the agreed cap', () => {
    fromXDRMock.mockReturnValueOnce({
      source: ACCOUNT,
      operations: [{ type: 'pathPaymentStrictSend', sendAmount: '150', destination: ACCOUNT }],
    })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE, 1_000_000_000n)).toThrow(/over the agreed cap/i)
  })

  it('sums outflow across legs and rejects the total over cap', () => {
    fromXDRMock.mockReturnValueOnce({
      source: ACCOUNT,
      operations: [
        { type: 'pathPaymentStrictSend', sendAmount: '60', destination: ACCOUNT },
        { type: 'pathPaymentStrictReceive', sendMax: '60', destination: ACCOUNT },
      ],
    })
    // 60 + 60 = 120 XLM over a 100 XLM cap
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE, 1_000_000_000n)).toThrow(/over the agreed cap/i)
  })
})
