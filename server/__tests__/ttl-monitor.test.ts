import { describe, it, expect } from 'vitest'
import {
  readTtl,
  WARN_LEDGERS,
  CRIT_LEDGERS,
  MAX_ENTRY_TTL,
} from '../ttl-monitor/ledger'
import { buildExtendTtlTx, clampExtendTo } from '../ttl-monitor/extend'
import { scanTtl, keysNeedingExtend } from '../ttl-monitor/monitor'
import { readConfigs, executableCodeKey, dueForExtend, formatMetrics } from '../ttl-monitor/index'
import { xdr, Address, Account, Networks, StrKey } from '@stellar/stellar-sdk'
import { CONTRACTS, INCLUSION_FEE_STROOPS, STELLAR_RPC_FALLBACK } from '../../src/config/contracts'

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
          // C omitted, so archived
        ],
      }),
    }
    const out = await scanTtl(keys, reader)
    expect(out.latestLedger).toBe(1_000_000)
    const byKey = Object.fromEntries(out.statuses.map((s) => [s.keyXdr, s.reading.level]))
    expect(byKey).toEqual({ A: 'ok', B: 'crit', C: 'archived' })
  })

  it('keysNeedingExtend takes every key inside 15 days, never an archived one', async () => {
    const statuses = [
      { keyXdr: 'A', reading: readTtl(1_000_000 + 259_201, 1_000_000) }, // just outside
      { keyXdr: 'B', reading: readTtl(1_000_010, 1_000_000) }, // last day
      { keyXdr: 'C', reading: readTtl(undefined, 1_000_000) }, // archived
      { keyXdr: 'D', reading: readTtl(1_000_000 + 259_200, 1_000_000) }, // 15 days to the ledger
    ]
    expect(keysNeedingExtend(statuses).map((s) => s.keyXdr)).toEqual(['B', 'D'])
  })
})

describe('buildExtendTtlTx', () => {
  it('bids the shared inclusion ceiling and leaves the rent to the simulation', () => {
    const key = xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.alloc(32, 1) }))
    const tx = buildExtendTtlTx(new Account(StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 3)), '1'), key, 518_400, Networks.PUBLIC)
    expect(tx.fee).toBe(INCLUSION_FEE_STROOPS)
    expect(tx.operations).toEqual([expect.objectContaining({ type: 'extendFootprintTtl', extendTo: 518_400 })])
  })
})

describe('dueForExtend', () => {
  const day = 24 * 3600 * 1000
  const due = ['A', 'B', 'C'].map((keyXdr) => ({ keyXdr, reading: readTtl(1_000_010, 1_000_000) }))

  it('holds a key back for a day after its extend landed', () => {
    const now = 100 * day
    const extendedAt = new Map([
      ['A', now - 3600 * 1000], // an hour ago
      ['B', now - day], // a day ago
    ])
    expect(dueForExtend(due, extendedAt, now).map((s) => s.keyXdr)).toEqual(['B', 'C'])
    expect(dueForExtend(due, new Map(), now)).toHaveLength(3)
  })
})

describe('formatMetrics', () => {
  it('says whether the network extends its own entries', () => {
    const scan = { latestLedger: 5, statuses: [] }
    expect(formatMetrics(scan, 'mainnet', true)).toContain('lobster_ttl_auto_extend{network="mainnet"} 1')
    expect(formatMetrics(scan, 'testnet')).toContain('lobster_ttl_auto_extend{network="testnet"} 0')
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

  it('caps an extend at 20 XLM unless told otherwise', () => {
    expect(readConfigs({ TTL_MONITOR_NETWORK: 'mainnet' })[0].feeCapStroops).toBe(200_000_000n)
    expect(readConfigs({ TTL_EXTEND_FEE_CAP_XLM: '12.5' })[0].feeCapStroops).toBe(125_000_000n)
    for (const bad of ['lots', '-5', '0', '1e400']) {
      expect(readConfigs({ TTL_EXTEND_FEE_CAP_XLM: bad })[0].feeCapStroops).toBe(200_000_000n)
    }
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
