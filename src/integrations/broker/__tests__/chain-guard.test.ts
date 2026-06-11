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
      operations: [{ type: 'pathPaymentStrictSend' }, { type: 'pathPaymentStrictReceive' }],
    })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).not.toThrow()
  })

  it('passes manage offer ops', () => {
    fromXDRMock.mockReturnValueOnce({
      source: ACCOUNT,
      operations: [
        { type: 'manageSellOffer' },
        { type: 'manageBuyOffer' },
        { type: 'createPassiveSellOffer' },
      ],
    })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).not.toThrow()
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

  it('refuses an invalid xdr', () => {
    fromXDRMock.mockImplementationOnce(() => {
      throw new Error('bad envelope')
    })
    expect(() => inspectBrokerTx('X', ACCOUNT, PASSPHRASE)).toThrow(/invalid xdr/i)
  })
})
