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
const LOBSTER_FACTORY = CONTRACTS.testnet.lobster.factory
// somebody else's contract, to check a named allowlist replaces the fallback
const NOT_OUR_CONTRACT = CONTRACTS.mainnet.soroswap.factory

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

  it('leaves the destination alone when handed an empty whitelist', () => {
    // readSignGuardConfig never produces one, it falls back to the treasury.
    // this pins the primitive so the fallback stays the only thing standing
    // between a permissive deploy and an arbitrary destination.
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

  it('rejects a tx whose fee is over the ceiling', () => {
    // a dust payment under every other check, but a 2 XLM fee that would drain
    // xlm the amount cap never sees
    const src = new Account(TREASURY, '1')
    const tx = new TransactionBuilder(src, { fee: '20000000', networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.payment({ destination: OTHER, asset: Asset.native(), amount: '1' }))
      .setTimeout(60)
      .build()
    expect(() => inspectSignXdr(tx, baseCfg)).toThrow(/fee.*over the/i)
  })

  it('rejects an invokeHostFunction even when sourced by the treasury', () => {
    // the exact drain scenario the allowlist comment describes: transfer() on
    // the real usdc sac, straight from contracts.ts
    const usdcSac = CONTRACTS.mainnet.tokens.usdcSac
    const tx = buildSorobanTransfer(usdcSac, OTHER, 1_000_000n)
    // still refused: the default config lists no view contract at all
    expect(() => inspectSignXdr(tx, baseCfg)).toThrow(/not enabled/i)
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

  it('starts a permissive relay without a whitelist or a cap, but not without bounds', () => {
    process.env.DFNS_TREASURY_ADDRESS = TREASURY
    process.env.DFNS_GUARD_PERMISSIVE = '1'
    try {
      const cfg = readSignGuardConfig()
      expect(cfg).not.toBeNull()
      // the treasury paying itself is the only destination left, and the cap is
      // real. a permissive deploy used to hand back [] and 0n, which turned both
      // checks off on a route the public bundle token can reach.
      expect(cfg!.destinationWhitelist).toEqual([TREASURY])
      expect(cfg!.maxAmountStroops).toBeGreaterThan(0n)
    } finally {
      delete process.env.DFNS_TREASURY_ADDRESS
      delete process.env.DFNS_GUARD_PERMISSIVE
    }
  })

  it('keeps the operator whitelist and cap when both are set', () => {
    process.env.DFNS_TREASURY_ADDRESS = TREASURY
    process.env.DFNS_GUARD_PERMISSIVE = '1'
    process.env.DFNS_DESTINATION_WHITELIST = OTHER
    process.env.DFNS_MAX_AMOUNT_STROOPS = '77'
    try {
      const cfg = readSignGuardConfig()
      expect(cfg!.destinationWhitelist).toEqual([OTHER])
      expect(cfg!.maxAmountStroops).toBe(77n)
    } finally {
      delete process.env.DFNS_TREASURY_ADDRESS
      delete process.env.DFNS_GUARD_PERMISSIVE
      delete process.env.DFNS_DESTINATION_WHITELIST
      delete process.env.DFNS_MAX_AMOUNT_STROOPS
    }
  })

  it('admits our own factory as a view target when the operator names none', () => {
    process.env.DFNS_TREASURY_ADDRESS = TREASURY
    process.env.DFNS_GUARD_PERMISSIVE = '1'
    delete process.env.DFNS_SOROBAN_VIEW_CONTRACTS
    try {
      const cfg = readSignGuardConfig()
      expect(cfg!.sorobanViewContracts).toContain(LOBSTER_FACTORY)
    } finally {
      delete process.env.DFNS_TREASURY_ADDRESS
      delete process.env.DFNS_GUARD_PERMISSIVE
    }
  })

  it('lets a named view allowlist replace the fallback', () => {
    process.env.DFNS_TREASURY_ADDRESS = TREASURY
    process.env.DFNS_GUARD_PERMISSIVE = '1'
    process.env.DFNS_SOROBAN_VIEW_CONTRACTS = NOT_OUR_CONTRACT
    try {
      const cfg = readSignGuardConfig()
      expect(cfg!.sorobanViewContracts).toEqual([NOT_OUR_CONTRACT])
    } finally {
      delete process.env.DFNS_TREASURY_ADDRESS
      delete process.env.DFNS_GUARD_PERMISSIVE
      delete process.env.DFNS_SOROBAN_VIEW_CONTRACTS
    }
  })
})

// A soroban view is the one invocation the treasury signer admits, and only
// because a view returns a value and carries no authorization to move anything.
describe('soroban views', () => {
  const FACTORY = CONTRACTS.testnet.lobster.factory
  const noViews = { treasuryAddress: TREASURY, destinationWhitelist: [], maxAmountStroops: 0n }
  const viewCfg = { ...noViews, sorobanViewContracts: [FACTORY] }

  function buildView(contractId: string, fn: string, args: xdr.ScVal[] = []) {
    const hostFn = xdr.HostFunction.hostFunctionTypeInvokeContract(
      new xdr.InvokeContractArgs({
        contractAddress: Address.fromString(contractId).toScAddress(),
        functionName: fn,
        args,
      }),
    )
    return new TransactionBuilder(new Account(TREASURY, '1'), {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.invokeHostFunction({ func: hostFn, auth: [] }))
      .setTimeout(60)
      .build()
  }

  it('admits a named view on a listed contract', () => {
    expect(() => inspectSignXdr(buildView(FACTORY, 'get_admin'), viewCfg)).not.toThrow()
  })

  it('refuses a contract that was never listed', () => {
    const other = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'
    expect(() => inspectSignXdr(buildView(other, 'get_admin'), viewCfg)).toThrow(/not in the view allowlist/i)
  })

  it('refuses a method that is not a view, on a listed contract', () => {
    expect(() => inspectSignXdr(buildView(FACTORY, 'create_pool'), viewCfg)).toThrow(/not a read-only method/i)
  })

  it('refuses a transfer even on a listed contract', () => {
    const tx = buildSorobanTransfer(FACTORY, OTHER, 1_000_000n)
    expect(() => inspectSignXdr(tx, viewCfg)).toThrow(/not a read-only method/i)
  })

  it('refuses a view that carries arguments', () => {
    const withArg = buildView(FACTORY, 'get_admin', [Address.fromString(TREASURY).toScVal()])
    expect(() => inspectSignXdr(withArg, viewCfg)).toThrow(/takes no arguments/i)
  })

  it('refuses an invocation carrying authorization entries', () => {
    const tx = buildView(FACTORY, 'get_admin')
    // an auth entry is what lets an invocation move a token, so its presence
    // alone disqualifies the call however harmless the method looks
    const op = tx.operations[0] as unknown as { auth: unknown[] }
    op.auth = [{}]
    expect(() => inspectSignXdr(tx, viewCfg)).toThrow(/authorization entries/i)
  })

  it('signs nothing soroban when no contract is listed', () => {
    expect(() => inspectSignXdr(buildView(FACTORY, 'get_admin'), noViews)).toThrow(/not enabled/i)
  })

  it('still refuses a wasm upload on a configured signer', () => {
    const upload = xdr.HostFunction.hostFunctionTypeUploadContractWasm(Buffer.from([1, 2, 3]))
    const tx = new TransactionBuilder(new Account(TREASURY, '1'), {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.invokeHostFunction({ func: upload, auth: [] }))
      .setTimeout(60)
      .build()
    expect(() => inspectSignXdr(tx, viewCfg)).toThrow(/not an upload or a deploy/i)
  })
})
