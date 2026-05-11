export type { Network } from '../../config/contracts'

// Mirrors the on-chain LobsterPools struct returned by the Factory.
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
