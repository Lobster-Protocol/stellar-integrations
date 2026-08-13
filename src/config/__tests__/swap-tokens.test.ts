import { describe, it, expect } from 'vitest'
import { StrKey } from '@stellar/stellar-sdk'
import { swapTokensFor, CONTRACTS } from '../contracts'
import { brokerAssetToSac } from '../../integrations/broker/asset-mapping'

describe('swapTokensFor', () => {
  it('lists XLM, USDC and the extra tokens on testnet', () => {
    const codes = swapTokensFor('testnet').map((t) => t.code)
    expect(codes).toEqual(['XLM', 'USDC', 'EURC', 'XTAR', 'XRP'])
  })

  it('lists XLM, USDC and the higher-cap tokens on mainnet', () => {
    const codes = swapTokensFor('mainnet').map((t) => t.code)
    expect(codes).toEqual(['XLM', 'USDC', 'EURC', 'AQUA', 'SHX', 'BLND', 'KALE'])
  })

  it('maps XLM to the native broker id on both networks', () => {
    for (const network of ['testnet', 'mainnet'] as const) {
      const xlm = swapTokensFor(network).find((t) => t.code === 'XLM')
      expect(xlm?.asset).toBe('xlm')
    }
  })

  it('uses the soroban USDC on testnet and the classic asset on mainnet', () => {
    const testnetUsdc = swapTokensFor('testnet').find((t) => t.code === 'USDC')
    expect(testnetUsdc?.asset).toBe(CONTRACTS.testnet.tokens.usdcSac)

    const mainnetUsdc = swapTokensFor('mainnet').find((t) => t.code === 'USDC')
    expect(mainnetUsdc?.asset).toBe(`USDC-${CONTRACTS.mainnet.tokens.usdcIssuer}`)
  })

  it('offers no duplicate codes on either network', () => {
    for (const network of ['testnet', 'mainnet'] as const) {
      const codes = swapTokensFor(network).map((t) => t.code)
      expect(new Set(codes).size).toBe(codes.length)
    }
  })

  // every token the selector offers must resolve to a real SAC through the
  // routing layer, or it would render as a dead pair.
  it('every token resolves to a valid SAC via the routing mapping', () => {
    for (const network of ['testnet', 'mainnet'] as const) {
      for (const t of swapTokensFor(network)) {
        const sac = brokerAssetToSac(t.asset, network)
        expect(sac, `${t.code} on ${network} must map to a SAC`).not.toBeNull()
        expect(StrKey.isValidContract(sac!)).toBe(true)
      }
    }
  })

  // the CODE-ISSUER derivation must reproduce the canonical mainnet USDC SAC,
  // proving the generic path is behaviour-preserving for the one we hardcode.
  it('derives the mainnet USDC SAC from its CODE-ISSUER form', () => {
    const usdc = swapTokensFor('mainnet').find((t) => t.code === 'USDC')!
    expect(brokerAssetToSac(usdc.asset, 'mainnet')).toBe(CONTRACTS.mainnet.tokens.usdcSac)
  })
})
