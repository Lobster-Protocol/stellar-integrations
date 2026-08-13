import { describe, it, expect } from 'vitest'
import { StrKey } from '@stellar/stellar-sdk'
import { swapTokensFor, CONTRACTS } from '../contracts'
import { brokerAssetToSac } from '../../integrations/broker/asset-mapping'

describe('swapTokensFor', () => {
  it('lists XLM, USDC and the extra tokens on testnet', () => {
    const codes = swapTokensFor('testnet').map((t) => t.code)
    expect(codes).toEqual(['XLM', 'USDC', 'EURC', 'XTAR', 'XRP'])
  })

  it('lists only XLM and USDC on mainnet', () => {
    const codes = swapTokensFor('mainnet').map((t) => t.code)
    expect(codes).toEqual(['XLM', 'USDC'])
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

  it('offers no duplicate codes', () => {
    const codes = swapTokensFor('testnet').map((t) => t.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  // every token the selector offers must resolve to a real SAC through the
  // routing layer, or it would render as a dead pair.
  it('every testnet token resolves to a valid SAC via the routing mapping', () => {
    for (const t of swapTokensFor('testnet')) {
      const sac = brokerAssetToSac(t.asset, 'testnet')
      expect(sac, `${t.code} must map to a SAC`).not.toBeNull()
      expect(StrKey.isValidContract(sac!)).toBe(true)
    }
  })
})
