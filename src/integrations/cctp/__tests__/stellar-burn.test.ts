import { describe, it, expect } from 'vitest'
import { Address, scValToNative } from '@stellar/stellar-sdk'

import { CONTRACTS, cctpChain } from '../../../config/contracts'
import {
  FORWARD_REQUEST_HOOK,
  burnFromStellar,
  evmAddressToBytes32,
  explainBurnFailure,
  sendableAmount,
  stellarBalanceUnits,
  stellarBurnArgs,
  stellarToEvmUnits,
  toStellarUsdcUnits,
  type StellarBurnRequest,
} from '../stellar-burn'
import type { Signer } from '../../signer/types'

const OWNER = 'GCC5G4MUAFQIGKJSMGBVVXM63KK4PGBCXD4CR4VPYQKBYGPXLDR4HA74'
const EVM = '0xDCD592A255323772f9B1EF5db83D2A0CFcF91a37'

function request(over: Partial<StellarBurnRequest> = {}): StellarBurnRequest {
  return {
    network: 'mainnet',
    owner: OWNER,
    units: 50_000_000n,
    chain: cctpChain('mainnet', 'ARB'),
    evmRecipient: EVM,
    forward: false,
    maxFee: 0n,
    ...over,
  }
}

describe('amounts on the way out', () => {
  it("scales a typed amount to Stellar's 7 decimals", () => {
    expect(toStellarUsdcUnits('5')).toBe(50_000_000n)
    expect(toStellarUsdcUnits('0.123456')).toBe(1_234_560n)
  })

  it('refuses a 7th decimal, which Circle could not carry', () => {
    expect(() => toStellarUsdcUnits('1.1234567')).toThrow(/6 decimals, not 7/)
  })

  it('refuses zero and junk the same way as on the way in', () => {
    expect(() => toStellarUsdcUnits('0')).toThrow(/more than zero/)
    expect(() => toStellarUsdcUnits('1,5')).toThrow(/like 12.5/)
  })

  it('reads a Horizon balance as text, without a float in between', () => {
    expect(stellarBalanceUnits('9.4008776')).toBe(94_008_776n)
    expect(stellarBalanceUnits('0.0000001')).toBe(1n)
    expect(stellarBalanceUnits('12')).toBe(120_000_000n)
  })

  it('offers as Max what can cross, leaving the 7th decimal behind', () => {
    expect(sendableAmount(94_008_776n)).toBe('9.400877')
    expect(stellarToEvmUnits(94_008_776n)).toBe(9_400_877n)
  })
})

describe('the EVM wallet in the burn', () => {
  it('is the low 20 bytes of the mint recipient', () => {
    const raw = evmAddressToBytes32(EVM)
    expect(raw).toHaveLength(32)
    expect([...raw.subarray(0, 12)].every((b) => b === 0)).toBe(true)
    expect(Buffer.from(raw.subarray(12)).toString('hex')).toBe(EVM.slice(2).toLowerCase())
  })

  it('refuses something that is not an EVM address', () => {
    expect(() => evmAddressToBytes32('GCC5G4MU')).toThrow(/not an EVM address/)
  })
})

describe('what the burn asks of Circle', () => {
  it('pays the EVM wallet on the chain picked, with nobody named to mint it', () => {
    const args = stellarBurnArgs(request()).map((a) => scValToNative(a))
    expect(args).toHaveLength(8)
    expect(args[0]).toBe(OWNER)
    expect(args[1]).toBe(50_000_000n)
    expect(args[2]).toBe(3)
    expect(Buffer.from(args[3] as Uint8Array).toString('hex')).toBe('00'.repeat(12) + EVM.slice(2).toLowerCase())
    expect(args[4]).toBe(CONTRACTS.mainnet.cctp.usdcSac)
    expect(Buffer.from(args[5] as Uint8Array).toString('hex')).toBe('00'.repeat(32))
    expect(args[6]).toBe(0n)
    expect(args[7]).toBe(2000)
  })

  it("adds Circle's forwarding request only when Circle is to mint it", () => {
    const args = stellarBurnArgs(request({ forward: true, maxFee: 802_490n }))
    expect(args).toHaveLength(9)
    const hook = Buffer.from(scValToNative(args[8]) as Uint8Array)
    expect(hook.toString('hex')).toBe(Buffer.from(FORWARD_REQUEST_HOOK).toString('hex'))
    expect(hook.subarray(0, 12).toString()).toBe('cctp-forward')
    expect(scValToNative(args[6])).toBe(802_490n)
  })

  it('names the USDC contract of the network it runs on', () => {
    const args = stellarBurnArgs(request({ network: 'testnet', chain: cctpChain('testnet', 'BASE') }))
    expect(Address.fromScVal(args[4]).toString()).toBe(CONTRACTS.testnet.cctp.usdcSac)
    expect(scValToNative(args[2])).toBe(6)
  })

  it('refuses a fee as large as the amount before any wallet is asked', async () => {
    const signer: Signer = { name: 'wallet-kit', signTransaction: async () => ({}) }
    await expect(burnFromStellar({ ...request({ maxFee: 50_000_000n }), signer })).rejects.toThrow(/swallow/)
  })
})

describe("Circle's refusals, in words", () => {
  it('names the ones a person can fix', () => {
    expect(explainBurnFailure('HostError: Error(Contract, #10)')).toMatch(/does not hold that much USDC/)
    expect(explainBurnFailure('HostError: Error(Contract, #9)\nmore')).toMatch(/allowance/)
    expect(explainBurnFailure('Error(Contract, #1000)')).toMatch(/paused/)
    expect(explainBurnFailure('Error(Contract, #7104)')).toMatch(/swallow/)
  })

  it('passes anything else through on one line', () => {
    expect(explainBurnFailure('something odd\nstack')).toBe('something odd')
  })
})
