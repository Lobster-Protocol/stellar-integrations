import { describe, it, expect } from 'vitest'

import { burnArgs, toEvmUsdcUnits, EvmBurnError } from '../evm-burn'
import { decodeForwardHook, bytes32ToContract } from '../forward-hook'
import { hexToBytes } from '../message'
import { CONTRACTS, cctpChain, STELLAR_CCTP_DOMAIN, CCTP_FINALITY } from '../../../config/contracts'

const RECIPIENT = 'GAMNA2Q6NTZSUBLMEXLTIXYORE7OXJJBMEGIX7T2OXDAKIA7CCKN4RJV'

describe('toEvmUsdcUnits', () => {
  it('converts to 6-decimal base units', () => {
    expect(toEvmUsdcUnits('1')).toBe(1_000_000n)
    expect(toEvmUsdcUnits('12.5')).toBe(12_500_000n)
    expect(toEvmUsdcUnits('0.000001')).toBe(1n)
  })

  it('refuses a seventh decimal', () => {
    expect(() => toEvmUsdcUnits('1.0000001')).toThrow(/6 decimals/)
  })

  it('refuses zero, negatives, blanks and scientific notation', () => {
    for (const bad of ['0', '0.0', '-1', '', '   ', '1e3', 'abc', '01.5']) {
      expect(() => toEvmUsdcUnits(bad), bad).toThrow(EvmBurnError)
    }
  })
})

describe('burnArgs', () => {
  const chain = cctpChain('testnet', 'BASE')
  const forwarder = CONTRACTS.testnet.cctp.forwarder
  const args = burnArgs({
    chain,
    units: 5_000_000n,
    recipient: RECIPIENT,
    forwarder,
    maxFee: 1_000n,
    finality: 'fast',
  })
  const [amount, domain, mintRecipient, burnToken, destinationCaller, maxFee, finality, hookData] = args

  it('burns the amount asked, toward Stellar', () => {
    expect(amount).toBe(5_000_000n)
    expect(domain).toBe(STELLAR_CCTP_DOMAIN)
  })

  it('mints to the forwarder and never to the user, since a mint recipient is read as a contract', () => {
    expect(bytes32ToContract(hexToBytes(mintRecipient))).toBe(forwarder)
  })

  it('lets only the forwarder consume the message', () => {
    expect(bytes32ToContract(hexToBytes(destinationCaller))).toBe(forwarder)
  })

  it('burns the USDC of the chosen chain', () => {
    expect(burnToken).toBe(chain.usdc)
  })

  it('names the Stellar account to pay in the hook', () => {
    expect(decodeForwardHook(hexToBytes(hookData)).recipient).toBe(RECIPIENT)
  })

  it('carries the fee and the finality that were asked for', () => {
    expect(maxFee).toBe(1_000n)
    expect(finality).toBe(CCTP_FINALITY.fast)
  })

  it('refuses a payout to anything but a Stellar account', () => {
    expect(() =>
      burnArgs({ chain, units: 1n, recipient: forwarder, forwarder, maxFee: 0n, finality: 'standard' }),
    ).toThrow()
  })
})

describe('the source chain registry', () => {
  it('keeps testnet and mainnet chain ids apart', () => {
    const t = new Set(['BASE', 'ARB', 'ETH'].map((k) => cctpChain('testnet', k).chainId))
    const m = new Set(['BASE', 'ARB', 'ETH'].map((k) => cctpChain('mainnet', k).chainId))
    for (const id of t) expect(m.has(id)).toBe(false)
  })

  it('throws on an unknown chain', () => {
    expect(() => cctpChain('testnet', 'BSC')).toThrow(/no CCTP source chain/)
  })
})
