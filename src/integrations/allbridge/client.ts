import { AllbridgeCoreSdk, ChainSymbol, type NodeRpcUrls } from '@allbridge/bridge-core-sdk'
import { EVM_RPC_FALLBACK, STELLAR_RPC_FALLBACK } from '../../config/contracts'

let sdkInstance: AllbridgeCoreSdk | null = null

function buildNodeUrls(): NodeRpcUrls {
  const env = import.meta.env
  return {
    [ChainSymbol.SRB]: env.VITE_STELLAR_RPC_MAINNET || STELLAR_RPC_FALLBACK.soroban,
    [ChainSymbol.STLR]: env.VITE_HORIZON_MAINNET || STELLAR_RPC_FALLBACK.horizon,
    [ChainSymbol.ETH]: env.VITE_ETH_RPC || EVM_RPC_FALLBACK.ETH,
    [ChainSymbol.ARB]: env.VITE_ARB_RPC || EVM_RPC_FALLBACK.ARB,
    [ChainSymbol.BSC]: env.VITE_BSC_RPC || EVM_RPC_FALLBACK.BSC,
  }
}

export function getAllbridgeSdk(): AllbridgeCoreSdk {
  if (sdkInstance) return sdkInstance
  sdkInstance = new AllbridgeCoreSdk(buildNodeUrls())
  return sdkInstance
}
