import { describe, it, expect } from 'vitest'

import {
  DfnsEventKindSchema,
  DfnsWebhookEventSchema,
  DfnsStellarNetworkSchema,
  DfnsSignatureSchema,
} from '../dfns/types'

describe('DfnsEventKindSchema', () => {
  it('rejects an undocumented kind', () => {
    expect(() => DfnsEventKindSchema.parse('wallet.minted')).toThrow()
    expect(DfnsEventKindSchema.parse('policy.approval.pending')).toBe('policy.approval.pending')
  })
})

describe('DfnsStellarNetworkSchema', () => {
  it('accepts Stellar and StellarTestnet', () => {
    expect(DfnsStellarNetworkSchema.parse('Stellar')).toBe('Stellar')
    expect(DfnsStellarNetworkSchema.parse('StellarTestnet')).toBe('StellarTestnet')
  })

  it('rejects other network strings', () => {
    expect(() => DfnsStellarNetworkSchema.parse('stellar')).toThrow()
    expect(() => DfnsStellarNetworkSchema.parse('EVM')).toThrow()
  })
})

describe('DfnsWebhookEventSchema', () => {
  it('parses a minimal well-formed event', () => {
    expect(() =>
      DfnsWebhookEventSchema.parse({
        id: 'evt-1',
        kind: 'wallet.signature.signed',
        timestampSent: 1717320000,
      }),
    ).not.toThrow()
  })

  it('rejects an event missing the kind field', () => {
    expect(() =>
      DfnsWebhookEventSchema.parse({ id: 'evt-1', timestampSent: 1717320000 }),
    ).toThrow()
  })
})

describe('DfnsSignatureSchema', () => {
  it('rejects an unknown status', () => {
    expect(() => DfnsSignatureSchema.parse({ id: 'sig-1', status: 'Queued' })).toThrow()
  })
})
