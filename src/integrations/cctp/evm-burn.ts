import { erc20Abi, parseUnits, type Address } from 'viem'
import {
  getAccount,
  getBalance,
  readContract,
  switchChain,
  waitForTransactionReceipt,
  writeContract,
} from 'wagmi/actions'

import { wagmiConfig, isConfiguredChainId, type WagmiChainIdAny } from '../evm/config'
import {
  CCTP_EVM_USDC_DECIMALS,
  CCTP_FINALITY,
  STELLAR_CCTP_DOMAIN,
  type CctpFinality,
  type CctpSourceChain,
} from '../../config/contracts'
import { contractToBytes32, encodeForwardHook, toHex } from './forward-hook'

// Circle's TokenMessengerV2, just the call we make

const TOKEN_MESSENGER_V2_ABI = [
  {
    type: 'function',
    name: 'depositForBurnWithHook',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destinationDomain', type: 'uint32' },
      { name: 'mintRecipient', type: 'bytes32' },
      { name: 'burnToken', type: 'address' },
      { name: 'destinationCaller', type: 'bytes32' },
      { name: 'maxFee', type: 'uint256' },
      { name: 'minFinalityThreshold', type: 'uint32' },
      { name: 'hookData', type: 'bytes' },
    ],
    outputs: [],
  },
] as const

export class EvmBurnError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'EvmBurnError'
  }
}

// A signature the user declined is not a failure and must not read like one.
export class UserRejectedError extends Error {
  constructor() {
    super('You declined the request in your wallet. Nothing was sent.')
    this.name = 'UserRejectedError'
  }
}

function chainIdOf(chain: CctpSourceChain): WagmiChainIdAny {
  if (!isConfiguredChainId(chain.chainId)) {
    throw new EvmBurnError(`${chain.name} is not configured in the wallet layer`)
  }
  return chain.chainId
}

function isUserRejection(err: unknown): boolean {
  const e = err as { name?: string; code?: number; shortMessage?: string; message?: string }
  if (e?.name === 'UserRejectedRequestError' || e?.code === 4001) return true
  const text = `${e?.shortMessage ?? ''} ${e?.message ?? ''}`.toLowerCase()
  return text.includes('user rejected') || text.includes('user denied') || text.includes('rejected the request')
}

// refuses a 7th decimal rather than quietly sending less than was typed
export function toEvmUsdcUnits(human: string): bigint {
  const trimmed = human.trim()
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(trimmed)) throw new EvmBurnError('Enter an amount like 12.5')
  const decimals = trimmed.split('.')[1]?.length ?? 0
  if (decimals > CCTP_EVM_USDC_DECIMALS) {
    throw new EvmBurnError(`USDC has ${CCTP_EVM_USDC_DECIMALS} decimals on this chain, not ${decimals}`)
  }
  const units = parseUnits(trimmed, CCTP_EVM_USDC_DECIMALS)
  if (units <= 0n) throw new EvmBurnError('The amount has to be more than zero')
  return units
}

async function ensureChain(chain: CctpSourceChain): Promise<WagmiChainIdAny> {
  const target = chainIdOf(chain)
  const account = getAccount(wagmiConfig)
  if (!account.address) throw new EvmBurnError('Connect an EVM wallet first')
  if (account.chainId !== target) {
    try {
      await switchChain(wagmiConfig, { chainId: target })
    } catch (err) {
      if (isUserRejection(err)) throw new UserRejectedError()
      throw new EvmBurnError(`Your wallet would not switch to ${chain.name}. Switch it by hand and try again.`, {
        cause: err,
      })
    }
  }
  return target
}

export async function readUsdcBalance(chain: CctpSourceChain, owner: Address): Promise<bigint> {
  return readContract(wagmiConfig, {
    chainId: chainIdOf(chain),
    address: chain.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [owner],
  })
}

export async function readGasBalance(chain: CctpSourceChain, owner: Address): Promise<bigint> {
  const b = await getBalance(wagmiConfig, { chainId: chainIdOf(chain), address: owner })
  return b.value
}

export async function readAllowance(chain: CctpSourceChain, owner: Address): Promise<bigint> {
  return readContract(wagmiConfig, {
    chainId: chainIdOf(chain),
    address: chain.usdc,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, chain.tokenMessenger],
  })
}

async function send(
  chain: CctpSourceChain,
  what: string,
  write: (chainId: WagmiChainIdAny) => Promise<`0x${string}`>,
): Promise<`0x${string}`> {
  const chainId = await ensureChain(chain)
  let hash: `0x${string}`
  try {
    hash = await write(chainId)
  } catch (err) {
    if (isUserRejection(err)) throw new UserRejectedError()
    throw new EvmBurnError(`The ${what} failed on ${chain.name}: ${(err as Error).message}`, { cause: err })
  }
  const receipt = await waitForTransactionReceipt(wagmiConfig, { chainId, hash })
  // a receipt comes back for a reverted transaction too
  if (receipt.status !== 'success') throw new EvmBurnError(`The ${what} was reverted on chain (${hash})`)
  return hash
}

// exact amount, never unlimited: an open approval outlives the transfer
export function approveUsdc(chain: CctpSourceChain, units: bigint): Promise<`0x${string}`> {
  return send(chain, 'approval', (chainId) =>
    writeContract(wagmiConfig, {
      chainId,
      address: chain.usdc,
      abi: erc20Abi,
      functionName: 'approve',
      args: [chain.tokenMessenger, units],
    }),
  )
}

export interface BurnRequest {
  chain: CctpSourceChain
  units: bigint
  // the Stellar account the forwarder will pay
  recipient: string
  // the forwarder on the Stellar network matching `chain`
  forwarder: string
  maxFee: bigint
  finality: CctpFinality
}

// split out so where the money goes can be tested without a wallet
export function burnArgs(req: BurnRequest) {
  const forwarder32 = toHex(contractToBytes32(req.forwarder))
  return [
    req.units,
    STELLAR_CCTP_DOMAIN,
    forwarder32, // mintRecipient: the forwarder, never the user
    req.chain.usdc,
    forwarder32, // destinationCaller: only the forwarder may consume this
    req.maxFee,
    CCTP_FINALITY[req.finality],
    toHex(encodeForwardHook(req.recipient)),
  ] as const
}

export async function burnToStellar(req: BurnRequest): Promise<`0x${string}`> {
  if (req.maxFee >= req.units) throw new EvmBurnError('The fee would swallow the whole amount')
  const args = burnArgs(req)
  return send(req.chain, 'burn', (chainId) =>
    writeContract(wagmiConfig, {
      chainId,
      address: req.chain.tokenMessenger,
      abi: TOKEN_MESSENGER_V2_ABI,
      functionName: 'depositForBurnWithHook',
      args,
    }),
  )
}
