import { describe, it, expect } from 'vitest'

import { buildMcaRecords, McaRecordSchema, toEsmaJson, verifyChain } from '../mica-export'
import type { StellarTxSnapshot, ExportContext } from '../mica-export'
import { CONTRACTS } from '../../src/config/contracts'

const TX: StellarTxSnapshot = {
  hash: 'a'.repeat(64),
  ledgerCloseTime: '2026-06-02T10:00:00Z',
  sourceAccount: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
  operations: [
    {
      type: 'payment',
      sourceAccount: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
      destination: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      assetCode: 'USDC',
      assetIssuer: CONTRACTS.mainnet.tokens.usdcIssuer,
      amount: '100.5',
    },
  ],
}

const CTX: ExportContext = {
  caspLei: '529900T8BM49AURSDO55',
  resolveDti: (asset) => (asset.code === 'USDC' ? 'X9QKMSXC9' : null),
  resolveVenue: () => 'STELLAR_PAYMENT',
}

describe('buildMcaRecords', () => {
  it('maps a payment op to a valid mca record', () => {
    const records = buildMcaRecords(TX, CTX)
    expect(records).toHaveLength(1)
    const r = records[0]
    expect(() => McaRecordSchema.parse(r)).not.toThrow()
    expect(r.transactionReference).toBe(TX.hash)
    expect(r.executingEntityLei).toBe(CTX.caspLei)
    expect(r.instrumentDti).toBe('X9QKMSXC9')
    expect(r.transactionType).toBe('payment')
    expect(r.quantity).toBe('100.5')
  })

  it('falls back to UNKNOWN dti when the resolver returns null', () => {
    const records = buildMcaRecords(TX, { ...CTX, resolveDti: () => null })
    expect(records[0].instrumentDti).toBe('UNKNOWN')
  })

  it('maps multiple ops in source order', () => {
    const multi: StellarTxSnapshot = {
      ...TX,
      operations: [
        TX.operations[0],
        { ...TX.operations[0], type: 'path_payment_strict_send', amount: '50' },
      ],
    }
    const records = buildMcaRecords(multi, CTX)
    expect(records).toHaveLength(2)
    expect(records[1].transactionType).toBe('path_payment_strict_send')
    expect(records[1].quantity).toBe('50')
  })
})

describe('toEsmaJson', () => {
  it('emits a pretty-printed records envelope', () => {
    const records = buildMcaRecords(TX, CTX)
    const json = toEsmaJson(records)
    const parsed = JSON.parse(json) as { records: unknown[] }
    expect(parsed.records).toHaveLength(1)
  })
})

describe('record chain header', () => {
  const multi: StellarTxSnapshot = {
    ...TX,
    operations: [
      TX.operations[0],
      { ...TX.operations[0], type: 'path_payment_strict_send', amount: '50' },
      { ...TX.operations[0], type: 'invoke_host_function', amount: '0' },
    ],
  }

  it('emits a sha256 recordHash on every record', () => {
    const records = buildMcaRecords(multi, CTX)
    for (const r of records) expect(r.recordHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('sets prevRecordHash to null on the first record only', () => {
    const records = buildMcaRecords(multi, CTX)
    expect(records[0].prevRecordHash).toBeNull()
    expect(records[1].prevRecordHash).toBe(records[0].recordHash)
    expect(records[2].prevRecordHash).toBe(records[1].recordHash)
  })

  it('verifyChain returns -1 on a clean chain', () => {
    const records = buildMcaRecords(multi, CTX)
    expect(verifyChain(records)).toBe(-1)
  })

  it('verifyChain points at the first broken record when a body is tampered', () => {
    const records = buildMcaRecords(multi, CTX)
    const tampered = [...records]
    tampered[1] = { ...records[1], quantity: '999999' }
    expect(verifyChain(tampered)).toBe(1)
  })

  it('verifyChain detects reordered records via prev hash mismatch', () => {
    const records = buildMcaRecords(multi, CTX)
    const swapped = [records[1], records[0], records[2]]
    expect(verifyChain(swapped)).toBe(0)
  })
})

describe('extension blocks (dfns / decision / execution / side)', () => {
  const enriched: StellarTxSnapshot = {
    ...TX,
    ledgerSequence: 62843470,
    feePaidStroops: '100',
    operations: [{ ...TX.operations[0], side: 'sell' }],
    dfns: { walletId: 'wa-1', signatureId: 'sig-1', status: 'Confirmed' },
    decision: { policyId: 'pol-1', value: 'AutoApproved' },
  }

  it('forwards the side field to each record when set on the op', () => {
    const records = buildMcaRecords(enriched, CTX)
    expect(records[0].side).toBe('sell')
  })

  it('attaches the dfns block to every record built from the tx', () => {
    const records = buildMcaRecords(enriched, CTX)
    expect(records[0].dfns).toEqual({ walletId: 'wa-1', signatureId: 'sig-1', status: 'Confirmed' })
  })

  it('attaches the decision block to every record built from the tx', () => {
    const records = buildMcaRecords(enriched, CTX)
    expect(records[0].decision).toEqual({ policyId: 'pol-1', value: 'AutoApproved' })
  })

  it('attaches the execution block including ledger sequence and fee', () => {
    const records = buildMcaRecords(enriched, CTX)
    expect(records[0].execution?.ledgerSequence).toBe(62843470)
    expect(records[0].execution?.feePaidStroops).toBe('100')
    expect(records[0].execution?.txHash).toBe(enriched.hash)
  })

  it('threads one continuous chain across transactions for a multi-tx export', () => {
    const tx1 = buildMcaRecords({ ...TX, hash: 'a'.repeat(64) }, CTX)
    const tx2 = buildMcaRecords(
      { ...TX, hash: 'b'.repeat(64) },
      CTX,
      tx1[tx1.length - 1].recordHash,
    )
    const exportRecords = [...tx1, ...tx2]
    expect(tx2[0].prevRecordHash).toBe(tx1[tx1.length - 1].recordHash)
    expect(verifyChain(exportRecords)).toBe(-1)
  })

  it('verifyChain catches tampering inside the execution block', () => {
    const records = buildMcaRecords(enriched, CTX)
    const tampered = [
      { ...records[0], execution: { ...records[0].execution!, txHash: 'b'.repeat(64) } },
    ]
    expect(verifyChain(tampered)).toBe(0)
  })
})
