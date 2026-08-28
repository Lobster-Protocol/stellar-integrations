import type { BridgeQuote } from './types'

// Allbridge has no testnet and there is no USDC on Stellar testnet, so a real
// bridge cannot run there. This is a labelled walkthrough of the flow so a
// reviewer can see the steps end to end. No funds move. The UI must badge it as
// a simulation and never present it as a real transfer.

const BRIDGE_FEE = 0.003 // the fee a healthy Allbridge pool charges, ~0.3%

export function simulateBridgeQuote(amount: string): BridgeQuote {
  const n = Number(amount)
  const out = Number.isFinite(n) && n > 0 ? n * (1 - BRIDGE_FEE) : 0
  return {
    amountInFloat: amount,
    amountOutFloat: out.toFixed(6),
    estimatedTimeSeconds: 120,
    trustlineRequired: false,
    gasFeeOptions: { stablecoin: '4.50' },
  }
}
