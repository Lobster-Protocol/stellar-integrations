import { AllbridgeCoreSdk, ChainSymbol, type NodeRpcUrls } from '@allbridge/bridge-core-sdk'

import { EVM_RPC_FALLBACK, STELLAR_RPC_FALLBACK } from '../../src/config/contracts'

let sdk: AllbridgeCoreSdk | null = null

// Allbridge Core ships mainnet config only: the core api, the soroban passphrase
// and every chain symbol are mainnet, and there is no testnet core api to serve
// testnet bridge contracts. So this always targets mainnet. The point of holding
// it server-side is to have the whole integration (quote, raw tx build, transfer
// status) ready for a future deployment without the browser bundle carrying the
// sdk and its evm/solana deps.
function nodeUrls(): NodeRpcUrls {
  const e = process.env
  return {
    [ChainSymbol.SRB]: e.SOROBAN_RPC_MAINNET || STELLAR_RPC_FALLBACK.mainnet.soroban,
    [ChainSymbol.STLR]: e.HORIZON_MAINNET || STELLAR_RPC_FALLBACK.mainnet.horizon,
    [ChainSymbol.ETH]: e.ETH_RPC || EVM_RPC_FALLBACK.ETH,
    [ChainSymbol.ARB]: e.ARB_RPC || EVM_RPC_FALLBACK.ARB,
    [ChainSymbol.BSC]: e.BSC_RPC || EVM_RPC_FALLBACK.BSC,
  }
}

export function getAllbridgeSdk(): AllbridgeCoreSdk {
  if (!sdk) sdk = new AllbridgeCoreSdk(nodeUrls())
  return sdk
}
