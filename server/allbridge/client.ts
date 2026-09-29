import { AllbridgeCoreSdk, ChainSymbol, mainnet, type NodeRpcUrls } from '@allbridge/bridge-core-sdk'

import { ALLBRIDGE_CORE_API, EVM_RPC_FALLBACK, STELLAR_RPC_FALLBACK } from '../../src/config/contracts'

let sdk: AllbridgeCoreSdk | null = null

// allbridge core ships mainnet config only, with no testnet core api, so this
// always targets mainnet. it runs server-side to keep the sdk and its evm/solana
// deps out of the browser bundle.
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
  if (!sdk) {
    sdk = new AllbridgeCoreSdk(nodeUrls(), {
      ...mainnet,
      coreApiUrl: process.env.ALLBRIDGE_CORE_API || ALLBRIDGE_CORE_API,
    })
  }
  return sdk
}
