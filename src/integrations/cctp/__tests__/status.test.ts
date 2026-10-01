import { describe, it, expect } from 'vitest'

import { elapsed, expectedDuration, statusLine, statusOf } from '../status'
import type { IrisAttestation } from '../iris'
import type { TrackedTransfer } from '../transfers'

function transfer(over: Partial<TrackedTransfer> = {}): TrackedTransfer {
  return {
    id: `0x${'aa'.repeat(32)}`,
    network: 'testnet',
    chainKey: 'BASE',
    chainName: 'Base Sepolia',
    sourceDomain: 6,
    amount: '5',
    recipient: 'GAMNA2Q6NTZSUBLMEXLTIXYORE7OXJJBMEGIX7T2OXDAKIA7CCKN4RJV',
    finality: 'fast',
    createdAt: 1,
    stage: 'burned',
    ...over,
  }
}

const out = (over: Partial<TrackedTransfer> = {}) =>
  transfer({ id: 'ab'.repeat(32), direction: 'from-stellar', sourceDomain: 27, recipient: `0x${'11'.repeat(20)}`, finality: 'standard', ...over })

const signed = (over: Partial<Extract<IrisAttestation, { state: 'complete' }>> = {}): IrisAttestation => ({
  state: 'complete',
  message: '0x00',
  attestation: '0x00',
  eventNonce: '0x1',
  forwardState: null,
  forwardTxHash: null,
  ...over,
})

describe('where a transfer stands', () => {
  it('waits on Circle until it has signed, and passes on why it holds one', () => {
    expect(statusOf(transfer(), undefined)).toEqual({ kind: 'waiting-circle', delayReason: null })
    expect(statusOf(transfer(), { state: 'pending', delayReason: 'insufficient_fee' })).toEqual({
      kind: 'waiting-circle',
      delayReason: 'insufficient_fee',
    })
  })

  it('on the way in, hands over to the Stellar wallet once signed', () => {
    expect(statusOf(transfer(), signed()).kind).toBe('ready-deliver')
  })

  it('on the way out, lets Circle mint when asked to, and calls it arrived when Circle has', () => {
    expect(statusOf(out({ forwarded: true }), signed({ forwardState: 'PENDING' })).kind).toBe('circle-minting')
    expect(statusOf(out({ forwarded: true }), signed({ forwardState: 'COMPLETE' })).kind).toBe('delivered')
  })

  it("counts Circle's mint as arrived once Circle says it is confirmed, not only complete", () => {
    expect(statusOf(out({ forwarded: true }), signed({ forwardState: 'SENT' })).kind).toBe('circle-minting')
    expect(statusOf(out({ forwarded: true }), signed({ forwardState: 'CONFIRMED' })).kind).toBe('delivered')
  })

  it('hands a failed mint of Circle to the EVM wallet', () => {
    expect(statusOf(out({ forwarded: true }), signed({ forwardState: 'FAILED' }))).toEqual({
      kind: 'ready-receive',
      circleFailed: true,
    })
  })

  it('without forwarding, the EVM wallet receives it once signed', () => {
    expect(statusOf(out(), signed())).toEqual({ kind: 'ready-receive', circleFailed: false })
  })

  it('takes a delivered transfer as delivered, whatever Circle says', () => {
    expect(statusOf(transfer({ stage: 'delivered' }), undefined).kind).toBe('delivered')
  })

  it('says whose move it is in the list', () => {
    expect(statusLine(transfer(), { kind: 'ready-deliver' })).toEqual({
      text: 'Signed by Circle: your Stellar wallet delivers it',
      tone: 'act',
    })
    expect(statusLine(out(), { kind: 'circle-minting' }).text).toBe('Circle is minting it on Base Sepolia')
    expect(statusLine(transfer(), { kind: 'waiting-circle', delayReason: 'insufficient_fee' }).tone).toBe('warn')
  })

  it('sets the expected time by direction and speed', () => {
    expect(expectedDuration(transfer())).toMatch(/under a minute/)
    expect(expectedDuration(transfer({ finality: 'standard' }))).toMatch(/15 to 30 minutes/)
    expect(expectedDuration(out({ forwarded: true }))).toMatch(/about a minute/)
  })
})

describe('elapsed', () => {
  it('reads like a stopwatch', () => {
    expect(elapsed(0, 42_000)).toBe('42 s')
    expect(elapsed(0, 125_000)).toBe('2 min 05 s')
    expect(elapsed(0, 3_780_000)).toBe('1 h 03 min')
    expect(elapsed(10_000, 0)).toBe('0 s')
  })
})
