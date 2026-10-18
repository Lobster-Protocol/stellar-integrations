import { describe, it, expect, vi } from 'vitest'
import {
  readTtl,
  WARN_LEDGERS,
  CRIT_LEDGERS,
  MAX_ENTRY_TTL,
} from '../ttl-monitor/ledger'
import { buildExtendTtlTx, clampExtendTo } from '../ttl-monitor/extend'
import { scanTtl, keysNeedingExtend } from '../ttl-monitor/monitor'
import {
  readConfigs, executableCodeKey, storedCodeKey, scanFactoryRecords, dueForExtend, formatMetrics, why,
} from '../ttl-monitor/index'
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

  it('reads liveUntil 0 as archived, not negative', () => {
    expect(readTtl(0, 1_000_000)).toEqual({ remainingLedgers: 0, remainingSeconds: 0, level: 'archived' })
    expect(readTtl(999_000, 1_000_000).remainingLedgers).toBe(0)
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

describe('storedCodeKey', () => {
  const stored = (val: xdr.ScVal) =>
    xdr.LedgerEntryData.contractData(
      new xdr.ContractDataEntry({
        ext: new xdr.ExtensionPoint(0),
        contract: Address.fromString(CONTRACTS.testnet.lobster.factory).toScAddress(),
        key: xdr.ScVal.scvSymbol('lob_hash'),
        durability: xdr.ContractDataDurability.persistent(),
        val,
      }),
    )

  it('reads the vault code the factory deploys from', () => {
    const hash = Buffer.alloc(32, 9)
    expect(storedCodeKey(stored(xdr.ScVal.scvBytes(hash)))?.contractCode().hash().equals(hash)).toBe(true)
  })

  it('wants 32 bytes and nothing else', () => {
    expect(storedCodeKey(stored(xdr.ScVal.scvBytes(Buffer.alloc(31, 9))))).toBeNull()
    expect(storedCodeKey(stored(xdr.ScVal.scvU32(7)))).toBeNull()
    expect(storedCodeKey(undefined)).toBeNull()
  })
})

describe('scanFactoryRecords', () => {
  const FACTORY = StrKey.encodeContract(Buffer.alloc(32, 1))
  const VAULTS = [StrKey.encodeContract(Buffer.alloc(32, 2)), StrKey.encodeContract(Buffer.alloc(32, 3))]
  const OWNER = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 4))
  const [T0, T1] = [StrKey.encodeContract(Buffer.alloc(32, 5)), StrKey.encodeContract(Buffer.alloc(32, 6))]
  const sym = (v: string) => xdr.ScVal.scvSymbol(v)
  const addr = (a: string) => Address.fromString(a).toScVal()
  // built by hand so a change in the scan's key encoding gets caught
  const rec = (key: xdr.ScVal) =>
    xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: Address.fromString(FACTORY).toScAddress(),
        key,
        durability: xdr.ContractDataDurability.persistent(),
      }),
    )
  const pool = (vault: string) =>
    xdr.ScVal.scvMap(
      [['lobster_address', vault], ['owner', OWNER], ['token0', T0], ['token1', T1]].map(
        ([k, v]) => new xdr.ScMapEntry({ key: sym(k), val: addr(v) }),
      ),
    )
  const id = (n: number) => rec(xdr.ScVal.scvVec([sym('lob_pl_id'), xdr.ScVal.scvU64(new xdr.Uint64(BigInt(n)))]))
  const LATEST = 1_000_000

  // two vaults of one owner on one pair; no fee change pending
  function ledger(): { getLedgerEntries: (...keys: xdr.LedgerKey[]) => Promise<never> } {
    const stored: Array<[xdr.LedgerKey, number, xdr.ScVal]> = [
      [rec(sym('admin')), LATEST + 3_000_000, addr(OWNER)],
      [rec(sym('SW_ROUTER')), LATEST + 3_000_000, addr(T0)],
      [rec(sym('lob_count')), LATEST + 3_000_000, xdr.ScVal.scvU64(new xdr.Uint64(2n))],
      [rec(sym('lob_hash')), LATEST + 3_000_000, xdr.ScVal.scvBytes(Buffer.alloc(32, 7))],
      [rec(sym('FEES')), LATEST + 3_000_000, xdr.ScVal.scvU32(1000)],
      [id(1), LATEST + 2_000_000, pool(VAULTS[0])],
      [id(2), LATEST + 2_000_000, pool(VAULTS[1])],
      [rec(xdr.ScVal.scvVec([sym('lob_pl_ad'), addr(VAULTS[0])])), LATEST + 2_000_000, pool(VAULTS[0])],
      [rec(xdr.ScVal.scvVec([sym('lob_pl_ad'), addr(VAULTS[1])])), LATEST + 2_000_000, pool(VAULTS[1])],
      [rec(xdr.ScVal.scvVec([sym('lob_adr'), addr(OWNER)])), LATEST + 1_500_000, xdr.ScVal.scvVec([pool(VAULTS[0]), pool(VAULTS[1])])],
      [rec(xdr.ScVal.scvVec([sym('lob_token'), addr(T0), addr(T1)])), LATEST + 200_000, xdr.ScVal.scvVec([pool(VAULTS[0]), pool(VAULTS[1])])],
    ]
    const byKey = new Map(
      stored.map(([key, live, val]) => [
        key.toXDR('base64'),
        {
          key,
          liveUntilLedgerSeq: live,
          val: xdr.LedgerEntryData.contractData(
            new xdr.ContractDataEntry({
              ext: new xdr.ExtensionPoint(0),
              contract: key.contractData().contract(),
              key: key.contractData().key(),
              durability: xdr.ContractDataDurability.persistent(),
              val,
            }),
          ),
        },
      ]),
    )
    return {
      getLedgerEntries: async (...keys: xdr.LedgerKey[]) =>
        ({ latestLedger: LATEST, entries: keys.flatMap((k) => byKey.get(k.toXDR('base64')) ?? []) }) as never,
    }
  }

  it('covers the settings that exist and each index key once', async () => {
    const scan = await scanFactoryRecords(FACTORY, ledger())
    const count = (kind: string) => scan.statuses.filter((s) => s.kind === kind).length
    // admin, router, count, hash and fee; no PEND_FEE since nothing was announced
    expect(count('factory-settings')).toBe(5)
    // two ids, two vault addresses, the owner's list once, the pair's list once
    expect(count('factory-index')).toBe(6)
    expect(scan.statuses.every((s) => s.reading.level !== 'archived')).toBe(true)
    const pair = rec(xdr.ScVal.scvVec([sym('lob_token'), addr(T0), addr(T1)])).toXDR('base64')
    expect(scan.statuses.find((s) => s.keyXdr === pair)?.reading.remainingLedgers).toBe(200_000)
  })

  it('stops at the vault limit and says so', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const scan = await scanFactoryRecords(FACTORY, ledger(), 1)
      // the first vault's id, its address, the owner's list and the pair's list
      expect(scan.statuses.filter((s) => s.kind === 'factory-index')).toHaveLength(4)
      expect(scan.statuses.some((s) => s.keyXdr === id(2).toXDR('base64'))).toBe(false)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('first 1'))
    } finally {
      warn.mockRestore()
    }
  })

  it('pushes records as one min per kind, without keys', async () => {
    const records = await scanFactoryRecords(FACTORY, ledger())
    const own = { keyXdr: 'FACTORYINSTANCE', kind: 'instance', reading: readTtl(LATEST + 2_500_000, LATEST) }
    const out = formatMetrics({ latestLedger: LATEST, statuses: [own, ...records.statuses] }, 'mainnet', true)
    expect(out).toContain('lobster_ttl_remaining_ledgers{network="mainnet",kind="instance",key="FACTORYINSTANCE"} 2500000')
    expect(out).toContain('lobster_ttl_remaining_ledgers{network="mainnet",kind="factory-index"} 200000')
    expect(out).toContain('lobster_ttl_remaining_ledgers{network="mainnet",kind="factory-settings"} 3000000')
    expect(out.match(/kind="factory-index"/g)).toHaveLength(2)
    for (const s of records.statuses) expect(out).not.toContain(s.keyXdr)
  })
})

describe('why', () => {
  it('keeps only the message of an axios error', () => {
    const http = Object.assign(new Error('timeout of 15000ms exceeded'), { isAxiosError: true, config: { url: 'https://rpc.example' } })
    expect(why(http)).toBe('timeout of 15000ms exceeded')
    const bug = new TypeError('x is undefined')
    expect(why(bug)).toBe(bug)
    expect(why(undefined)).toBeUndefined()
  })
})
