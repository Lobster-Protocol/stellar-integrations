export type { Network } from '../../config/contracts'

// on-chain LobsterPools struct from the Factory
export interface LobsterPool {
  lobsterAddress: string
  owner: string
  token0: string
  token1: string
}

export interface FactoryInfo {
  admin: string
  wasmHash: string
  poolCount: number
}
