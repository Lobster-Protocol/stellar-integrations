import { describe, it, expect } from 'vitest'
import {
  readTtl,
  chunk,
  WARN_LEDGERS,
  CRIT_LEDGERS,
  MAX_ENTRY_TTL,
} from '../ttl-monitor/ledger'
import { clampExtendTo } from '../ttl-monitor/extend'
import { scanTtl, keysNeedingExtend } from '../ttl-monitor/monitor'
import { readConfigs, executableCodeKey } from '../ttl-monitor/index'
import { xdr, Address } from '@stellar/stellar-sdk'
import { CONTRACTS, STELLAR_RPC_FALLBACK } from '../../src/config/contracts'

describe('readTtl', () => {
  it('reads runway against the latest ledger of the same response', () => {
    const r = readTtl(1_000_000, 900_000)
    expect(r.remainingLedgers).toBe(100_000)
    expect(r.remainingSeconds).toBe(500_000) // 100000 * 5s
    expect(r.level).toBe('ok')
  })

  it('treats an absent liveUntilLedgerSeq as archived, not as an error', () => {
    const r = readTtl(undefined, 900_000)
    expect(r.level).toBe('archived')
    expect(r.remainingLedgers).toBe(0)
  })

  it('flags warn inside two days and crit inside one day', () => {
    const latest = 1_000_000
    expect(readTtl(latest + WARN_LEDGERS - 1, latest).level).toBe('warn')
    expect(readTtl(latest + CRIT_LEDGERS - 1, latest).level).toBe('crit')
  })

  it('flags archived once the runway is gone', () => {
    expect(readTtl(1_000_000, 1_000_000).level).toBe('archived')
    expect(readTtl(999_999, 1_000_000).level).toBe('archived')
  })
})

describe('chunk', () => {
  it('splits into 200-key batches by default', () => {
    const xs = Array.from({ length: 450 }, (_, i) => i)
    const batches = chunk(xs)
    expect(batches.map((b) => b.length)).toEqual([200, 200, 50])
  })
  it('rejects a non-positive size instead of looping forever', () => {
    expect(() => chunk([1, 2], 0)).toThrow()
  })
})

describe('clampExtendTo', () => {
  it('never asks past the protocol ceiling', () => {
    expect(clampExtendTo(MAX_ENTRY_TTL + 10_000)).toBe(MAX_ENTRY_TTL)
  })
  it('floors a fractional target and never goes negative', () => {
    expect(clampExtendTo(123.9)).toBe(123)
    expect(clampExtendTo(-5)).toBe(0)
  })
})

// a fake key whose base64 we control, matching the toXDR('base64') call in scanTtl
function fakeKey(id: string) {
  return { toXDR: () => id } as never
}

describe('scanTtl', () => {
  it('matches returned entries back to requested keys and archives the missing ones', async () => {
    const keys = [fakeKey('A'), fakeKey('B'), fakeKey('C')]
    const reader = {
      getLedgerEntries: async () => ({
        latestLedger: 1_000_000,
        entries: [
          { key: fakeKey('A'), liveUntilLedgerSeq: 1_100_000 }, // ok
          { key: fakeKey('B'), liveUntilLedgerSeq: 1_000_000 + 10 }, // crit
          // C omitted -> archived
        ],
      }),
    }
    const out = await scanTtl(keys, reader)
    expect(out.latestLedger).toBe(1_000_000)
    const byKey = Object.fromEntries(out.statuses.map((s) => [s.keyXdr, s.reading.level]))
    expect(byKey).toEqual({ A: 'ok', B: 'crit', C: 'archived' })
  })

  it('keysNeedingExtend returns only the crit band, never archived', async () => {
    const statuses = [
      { keyXdr: 'A', reading: readTtl(1_100_000, 1_000_000) },
      { keyXdr: 'B', reading: readTtl(1_000_010, 1_000_000) },
      { keyXdr: 'C', reading: readTtl(undefined, 1_000_000) },
    ]
    expect(keysNeedingExtend(statuses).map((s) => s.keyXdr)).toEqual(['B'])
  })
})

describe('readConfigs', () => {
  it('watches testnet alone when nothing is named', () => {
    expect(readConfigs({}).map((c) => c.network)).toEqual(['testnet'])
  })

  it('keeps a single named network', () => {
    expect(readConfigs({ TTL_MONITOR_NETWORK: 'mainnet' }).map((c) => c.network)).toEqual(['mainnet'])
  })

  it('runs one loop per listed network, each on its own rpc', () => {
    const configs = readConfigs({ TTL_MONITOR_NETWORK: 'testnet, mainnet', SOROBAN_RPC_MAINNET: 'https://rpc.example' })
    expect(configs.map((c) => [c.network, c.rpcUrl])).toEqual([
      ['testnet', STELLAR_RPC_FALLBACK.testnet.soroban],
      ['mainnet', 'https://rpc.example'],
    ])
  })

  it('drops a network it does not know', () => {
    expect(readConfigs({ TTL_MONITOR_NETWORK: 'mainnet,futurenet' }).map((c) => c.network)).toEqual(['mainnet'])
    expect(readConfigs({ TTL_MONITOR_NETWORK: 'futurenet' }).map((c) => c.network)).toEqual(['testnet'])
  })
})

describe('executableCodeKey', () => {
  const instanceEntry = (executable: xdr.ContractExecutable) =>
    xdr.LedgerEntryData.contractData(
      new xdr.ContractDataEntry({
        ext: new xdr.ExtensionPoint(0),
        contract: Address.fromString(CONTRACTS.testnet.lobster.factory).toScAddress(),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent(),
        val: xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({ executable, storage: null })),
      }),
    )

  it('reads the code key a wasm contract runs on', () => {
    const hash = Buffer.alloc(32, 7)
    const key = executableCodeKey(instanceEntry(xdr.ContractExecutable.contractExecutableWasm(hash)))
    expect(key?.contractCode().hash().equals(hash)).toBe(true)
  })

  it('has no code key for a stellar asset contract', () => {
    expect(executableCodeKey(instanceEntry(xdr.ContractExecutable.contractExecutableStellarAsset()))).toBeNull()
  })

  it('returns nothing without an entry', () => {
    expect(executableCodeKey(undefined)).toBeNull()
  })
})
