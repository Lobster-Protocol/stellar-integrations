import { describe, it, expect } from 'vitest'
import { Address, xdr } from '@stellar/stellar-sdk'

import { matchesQuery, groupOf, toActivityEvent, type ActivityEvent } from '../activity'
import { CONTRACTS } from '../../../config/contracts'

function event(over: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: '1000-1',
    kind: 'swap',
    at: '2026-08-20T10:30:00Z',
    txHash: '2e0163ba9c',
    ok: true,
    moves: [],
    ...over,
  }
}

describe('matchesQuery', () => {
  const swap = event({
    fn: 'swap_exact_tokens_for_tokens',
    contractId: 'CSOROSWAP',
    swapPath: ['CXLM', 'CUSDC'],
    moves: [{ code: 'USDC', amount: '225.5', direction: 'in', counterparty: 'GPOOL' }],
  })

  it('keeps everything when nothing was typed', () => {
    expect(matchesQuery(swap, '')).toBe(true)
    expect(matchesQuery(swap, '   ')).toBe(true)
  })

  it('finds a row by the label the reader sees', () => {
    expect(matchesQuery(swap, 'swap')).toBe(true)
    expect(matchesQuery(swap, 'SWAP')).toBe(true)
  })

  it('finds a row by asset, amount, counterparty or hash', () => {
    expect(matchesQuery(swap, 'usdc')).toBe(true)
    expect(matchesQuery(swap, '225.5')).toBe(true)
    expect(matchesQuery(swap, 'GPOOL')).toBe(true)
    expect(matchesQuery(swap, '2e0163')).toBe(true)
  })

  it('says no when nothing on the row holds the text', () => {
    expect(matchesQuery(swap, 'phoenix')).toBe(false)
  })

  it('does not match a row on a field it has no value for', () => {
    expect(matchesQuery(event({ kind: 'trustline' }), 'usdc')).toBe(false)
  })
})

describe('groupOf', () => {
  it('sorts each kind into the tab that offers it', () => {
    expect(groupOf('swap')).toBe('trading')
    expect(groupOf('sent')).toBe('moves')
    expect(groupOf('liquidity-add')).toBe('liquidity')
    expect(groupOf('storage-rent')).toBe('housekeeping')
  })
})

describe('toActivityEvent, bridge deliveries', () => {
  const ACCOUNT = 'GCC5G4MUAFQIGKJSMGBVVXM63KK4PGBCXD4CR4VPYQKBYGPXLDR4HA74'
  const OTHER = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'
  const { forwarder: FORWARDER, usdcIssuer: ISSUER } = CONTRACTS.testnet.cctp

  function delivery(to: string) {
    return {
      id: '1',
      type: 'invoke_host_function',
      created_at: '2026-09-28T09:08:00Z',
      transaction_hash: '6bfd4667',
      transaction_successful: true,
      parameters: [
        { type: 'Address', value: new Address(FORWARDER).toScVal().toXDR('base64') },
        { type: 'Sym', value: xdr.ScVal.scvSymbol('mint_and_forward').toXDR('base64') },
      ],
      asset_balance_changes: [
        { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: ISSUER, type: 'transfer', from: FORWARDER, to, amount: '0.9998700' },
      ],
    } as never
  }

  it('reads USDC paid out to this account as received', () => {
    const e = toActivityEvent(delivery(ACCOUNT), ACCOUNT)
    expect(e.kind).toBe('received')
    expect(e.moves).toEqual([
      { code: 'USDC', issuer: ISSUER, amount: '0.9998700', direction: 'in', counterparty: FORWARDER },
    ])
  })

  it('stays a contract call when this account only paid to deliver someone else', () => {
    expect(toActivityEvent(delivery(OTHER), ACCOUNT).kind).toBe('contract-call')
  })
})
