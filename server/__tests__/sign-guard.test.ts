// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  TransactionBuilder,
  Networks,
  Account,
  BASE_FEE,
  Operation,
  Asset,
  Keypair,
  Address,
  xdr,
} from '@stellar/stellar-sdk'

import { inspectSignXdr, readSignGuardConfig, SignGuardRejected } from '../dfns/sign-guard'
import { CONTRACTS } from '../../src/config/contracts'

const TREASURY = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'
const OTHER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'

function buildPayment(opts: {
  source?: string
  destination: string
  amount: string
  opSource?: string
}) {
  const src = new Account(opts.source ?? TREASURY, '1')
  const builder = new TransactionBuilder(src, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  }).addOperation(
    Operation.payment({
      source: opts.opSource,
      destination: opts.destination,
      asset: Asset.native(),
      amount: opts.amount,
    }),
  )
  return builder.setTimeout(60).build()
}

function buildAccountMerge() {
  const src = new Account(TREASURY, '1')
  return new TransactionBuilder(src, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.accountMerge({ destination: OTHER }))
    .setTimeout(60)
    .build()
}

function buildSetOptions() {
  const src = new Account(TREASURY, '1')
  return new TransactionBuilder(src, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(
      Operation.setOptions({ signer: { ed25519PublicKey: Keypair.random().publicKey(), weight: 1 } }),
    )
    .setTimeout(60)
    .build()
}

function buildSorobanTransfer(contractId: string, to: string, amountStroops: bigint) {
  const src = new Account(TREASURY, '1')
  const args = [
    Address.fromString(TREASURY).toScVal(),
    Address.fromString(to).toScVal(),
    xdr.ScVal.scvI128(
      new xdr.Int128Parts({ hi: xdr.Int64.fromString('0'), lo: xdr.Uint64.fromString(amountStroops.toString()) }),
    ),
  ]
  const hostFn = xdr.HostFunction.hostFunctionTypeInvokeContract(
    new xdr.InvokeContractArgs({
      contractAddress: Address.fromString(contractId).toScAddress(),
      functionName: 'transfer',
      args,
    }),
  )
  return new TransactionBuilder(src, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.invokeHostFunction({ func: hostFn, auth: [] }))
    .setTimeout(60)
    .build()
}

describe('inspectSignXdr', () => {
  const baseCfg = { treasuryAddress: TREASURY, destinationWhitelist: [], maxAmountStroops: 0n }

  it('accepts a payment from the treasury to an arbitrary destination when no whitelist is set', () => {
    const tx = buildPayment({ destination: OTHER, amount: '10' })
    expect(() => inspectSignXdr(tx, baseCfg)).not.toThrow()
  })

  it('rejects a tx whose source is not the treasury', () => {
    const wrongSource = Keypair.random().publicKey()
    const tx = buildPayment({ source: wrongSource, destination: OTHER, amount: '10' })
    expect(() => inspectSignXdr(tx, baseCfg)).toThrow(SignGuardRejected)
    expect(() => inspectSignXdr(tx, baseCfg)).toThrow(/source.*does not match treasury/i)
  })

  it('rejects an op sourced by another account', () => {
    const tx = buildPayment({ destination: OTHER, amount: '10', opSource: Keypair.random().publicKey() })
    expect(() => inspectSignXdr(tx, baseCfg)).toThrow(/not the treasury/i)
  })

  it('rejects an accountMerge op even when sourced by the treasury', () => {
    const tx = buildAccountMerge()
    expect(() => inspectSignXdr(tx, baseCfg)).toThrow(/not allowed/i)
  })

  it('rejects a setOptions op even when sourced by the treasury', () => {
    const tx = buildSetOptions()
    expect(() => inspectSignXdr(tx, baseCfg)).toThrow(/not allowed/i)
  })

  it('enforces the destination whitelist when set', () => {
    const cfg = { ...baseCfg, destinationWhitelist: [TREASURY] }
    const tx = buildPayment({ destination: OTHER, amount: '10' })
    expect(() => inspectSignXdr(tx, cfg)).toThrow(/not in whitelist/i)
  })

  it('accepts a whitelisted destination', () => {
    const cfg = { ...baseCfg, destinationWhitelist: [OTHER] }
    const tx = buildPayment({ destination: OTHER, amount: '10' })
    expect(() => inspectSignXdr(tx, cfg)).not.toThrow()
  })

  it('enforces the max amount cap when set', () => {
    const cfg = { ...baseCfg, maxAmountStroops: 5_0000000n } // 5 XLM
    const tx = buildPayment({ destination: OTHER, amount: '10' })
    expect(() => inspectSignXdr(tx, cfg)).toThrow(/exceeds cap/i)
  })

  it('accepts an amount under the cap', () => {
    const cfg = { ...baseCfg, maxAmountStroops: 100_0000000n }
    const tx = buildPayment({ destination: OTHER, amount: '10' })
    expect(() => inspectSignXdr(tx, cfg)).not.toThrow()
  })

  it('rejects an invokeHostFunction even when sourced by the treasury', () => {
    // the exact drain scenario the allowlist comment describes: transfer() on
    // the real usdc sac, straight from contracts.ts
    const usdcSac = CONTRACTS.mainnet.tokens.usdcSac
    const tx = buildSorobanTransfer(usdcSac, OTHER, 1_000_000n)
    expect(() => inspectSignXdr(tx, baseCfg)).toThrow(/not allowed/i)
  })
})

describe('readSignGuardConfig', () => {
  it('returns null when DFNS_TREASURY_ADDRESS is unset', () => {
    delete process.env.DFNS_TREASURY_ADDRESS
    expect(readSignGuardConfig()).toBeNull()
  })

  it('reads the treasury address, whitelist and cap from env', () => {
    process.env.DFNS_TREASURY_ADDRESS = TREASURY
    process.env.DFNS_DESTINATION_WHITELIST = `${OTHER},${TREASURY}`
    process.env.DFNS_MAX_AMOUNT_STROOPS = '500000000'
    try {
      const cfg = readSignGuardConfig()
      expect(cfg).not.toBeNull()
      expect(cfg!.treasuryAddress).toBe(TREASURY)
      expect(cfg!.destinationWhitelist).toEqual([OTHER, TREASURY])
      expect(cfg!.maxAmountStroops).toBe(500000000n)
    } finally {
      delete process.env.DFNS_TREASURY_ADDRESS
      delete process.env.DFNS_DESTINATION_WHITELIST
      delete process.env.DFNS_MAX_AMOUNT_STROOPS
    }
  })

  it('returns null when whitelist is empty and DFNS_GUARD_PERMISSIVE is unset', () => {
    process.env.DFNS_TREASURY_ADDRESS = TREASURY
    process.env.DFNS_MAX_AMOUNT_STROOPS = '500000000'
    try {
      expect(readSignGuardConfig()).toBeNull()
    } finally {
      delete process.env.DFNS_TREASURY_ADDRESS
      delete process.env.DFNS_MAX_AMOUNT_STROOPS
    }
  })

  it('returns null when amount cap is missing and DFNS_GUARD_PERMISSIVE is unset', () => {
    process.env.DFNS_TREASURY_ADDRESS = TREASURY
    process.env.DFNS_DESTINATION_WHITELIST = OTHER
    try {
      expect(readSignGuardConfig()).toBeNull()
    } finally {
      delete process.env.DFNS_TREASURY_ADDRESS
      delete process.env.DFNS_DESTINATION_WHITELIST
    }
  })

  it('accepts an empty whitelist and zero cap when DFNS_GUARD_PERMISSIVE=1', () => {
    process.env.DFNS_TREASURY_ADDRESS = TREASURY
    process.env.DFNS_GUARD_PERMISSIVE = '1'
    try {
      const cfg = readSignGuardConfig()
      expect(cfg).not.toBeNull()
      expect(cfg!.destinationWhitelist).toEqual([])
      expect(cfg!.maxAmountStroops).toBe(0n)
    } finally {
      delete process.env.DFNS_TREASURY_ADDRESS
      delete process.env.DFNS_GUARD_PERMISSIVE
    }
  })
})
