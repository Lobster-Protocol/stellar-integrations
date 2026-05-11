import { AllbridgeCoreSdk, ChainSymbol, type NodeRpcUrls } from '@allbridge/bridge-core-sdk'

let sdkInstance: AllbridgeCoreSdk | null = null

function buildNodeUrls(): NodeRpcUrls {
  const env = import.meta.env
  return {
    [ChainSymbol.SRB]: env.VITE_STELLAR_RPC_MAINNET || 'https://mainnet.sorobanrpc.com',
    [ChainSymbol.STLR]: env.VITE_HORIZON_MAINNET || 'https://horizon.stellar.org',
    [ChainSymbol.ETH]: env.VITE_ETH_RPC || 'https://rpc.ankr.com/eth',
    [ChainSymbol.ARB]: env.VITE_ARB_RPC || 'https://rpc.ankr.com/arbitrum',
    [ChainSymbol.BSC]: env.VITE_BSC_RPC || 'https://rpc.ankr.com/bsc',
  }
}

export function getAllbridgeSdk(): AllbridgeCoreSdk {
  if (sdkInstance) return sdkInstance
  sdkInstance = new AllbridgeCoreSdk(buildNodeUrls())
  return sdkInstance
}

// test-only
export function _resetAllbridgeSdkForTests(): void {
  sdkInstance = null
}
