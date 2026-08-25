// @vitest-environment node
import { describe, it, expect } from 'vitest'

import { QuoteSchema, SendSchema, ApproveSchema } from '../allbridge/types'

const EVM = '0x1111111111111111111111111111111111111111'
const STELLAR = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'

describe('allbridge request schemas', () => {
  it('quote accepts a valid usdc amount on a wired chain', () => {
    expect(QuoteSchema.safeParse({ sourceChain: 'ETH', amount: '100' }).success).toBe(true)
    expect(QuoteSchema.safeParse({ sourceChain: 'ARB', amount: '100.5' }).success).toBe(true)
  })

  it('quote rejects bsc (18-decimal, gated), zero and over-precise amounts', () => {
    expect(QuoteSchema.safeParse({ sourceChain: 'BSC', amount: '100' }).success).toBe(false)
    expect(QuoteSchema.safeParse({ sourceChain: 'ETH', amount: '0' }).success).toBe(false)
    expect(QuoteSchema.safeParse({ sourceChain: 'ETH', amount: '1.1234567' }).success).toBe(false)
  })

  it('send needs a valid evm from and a valid stellar to', () => {
    expect(SendSchema.safeParse({ sourceChain: 'ETH', amount: '1', fromAddress: EVM, toAddress: STELLAR }).success).toBe(true)
    expect(SendSchema.safeParse({ sourceChain: 'ETH', amount: '1', fromAddress: '0xbad', toAddress: STELLAR }).success).toBe(false)
    expect(SendSchema.safeParse({ sourceChain: 'ETH', amount: '1', fromAddress: EVM, toAddress: 'not-a-g-address' }).success).toBe(false)
  })

  it('approve needs a valid evm owner', () => {
    expect(ApproveSchema.safeParse({ sourceChain: 'ARB', amount: '1', owner: EVM }).success).toBe(true)
    expect(ApproveSchema.safeParse({ sourceChain: 'ARB', amount: '1', owner: 'nope' }).success).toBe(false)
  })
})
