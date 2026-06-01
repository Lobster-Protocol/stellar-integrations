import type { Address } from 'viem'
import { erc20Abi, parseUnits } from 'viem'
import {
  getAccount,
  sendTransaction,
  switchChain,
  waitForTransactionReceipt,
  readContract,
} from 'wagmi/actions'
import { wagmiConfig, EVM_CHAIN_ID, type EvmChainSymbol } from './config'

// shape of EssentialWeb3Transaction from the allbridge sdk, redeclared
// to avoid importing from a deep path
export interface RawEvmTx {
  from?: string
  to?: string
  value?: string
  data?: string
}

export interface EvmTxResult {
  hash: `0x${string}`
  blockNumber: bigint
}

export class EvmTxValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EvmTxValidationError'
  }
}

export class EvmTxSubmitError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'EvmTxSubmitError'
  }
}

type WagmiChainId = (typeof EVM_CHAIN_ID)[EvmChainSymbol]

export function toViemTxArgs(raw: RawEvmTx, chainId: WagmiChainId) {
  if (!raw.to) throw new EvmTxValidationError('raw evm tx missing `to`')
  return {
    chainId,
    to: raw.to as Address,
    data: (raw.data ?? '0x') as `0x${string}`,
    value: raw.value ? BigInt(raw.value) : 0n,
  }
}

async function ensureChain(target: EvmChainSymbol): Promise<WagmiChainId> {
  const account = getAccount(wagmiConfig)
  if (!account.address) throw new EvmTxValidationError('connect an evm wallet first')
  const targetId = EVM_CHAIN_ID[target]
  if (account.chainId !== targetId) {
    await switchChain(wagmiConfig, { chainId: targetId })
  }
  return targetId
}

export async function sendAllbridgeEvmTx(
  raw: RawEvmTx,
  chainSymbol: EvmChainSymbol,
): Promise<EvmTxResult> {
  const chainId = await ensureChain(chainSymbol)
  const args = toViemTxArgs(raw, chainId)
  try {
    const hash = await sendTransaction(wagmiConfig, args)
    const receipt = await waitForTransactionReceipt(wagmiConfig, { hash })
    return { hash, blockNumber: receipt.blockNumber }
  } catch (err) {
    if (err instanceof EvmTxValidationError) throw err
    const msg = err instanceof Error ? err.message : String(err)
    throw new EvmTxSubmitError(`EVM tx failed on ${chainSymbol}: ${msg}`, { cause: err })
  }
}

// used to skip approve when the existing allowance already covers the deposit
export async function readAllowance(
  token: Address,
  owner: Address,
  spender: Address,
  chainSymbol: EvmChainSymbol,
): Promise<bigint> {
  const chainId = EVM_CHAIN_ID[chainSymbol]
  return (await readContract(wagmiConfig, {
    chainId,
    address: token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, spender],
  })) as bigint
}

// USDC is 6 decimals on eth/arb/bsc
export function toUsdcBaseUnits(human: string): bigint {
  return parseUnits(human, 6)
}
