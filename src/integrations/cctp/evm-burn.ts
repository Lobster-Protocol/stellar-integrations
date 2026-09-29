import {
  BaseError,
  ContractFunctionRevertedError,
  erc20Abi,
  getAddress,
  hexToBytes,
  parseEventLogs,
  parseUnits,
  type Address,
} from 'viem'
import {
  getAccount,
  getBalance,
  getTransactionReceipt,
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
import { contractToBytes32, decodeForwardHook, encodeForwardHook, toHex } from './forward-hook'

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

// The transaction left the wallet but no endpoint gave its receipt back in time.
// It may well be mined: whoever tracks it must not treat it as never sent.
export class ReceiptUnreadError extends Error {
  readonly hash: `0x${string}`

  constructor(hash: `0x${string}`, options?: { cause?: unknown }) {
    super(`Sent (${hash}), but its confirmation could not be read in time`, options)
    this.name = 'ReceiptUnreadError'
    this.hash = hash
  }
}

function chainIdOf(chain: CctpSourceChain): WagmiChainIdAny {
  if (!isConfiguredChainId(chain.chainId)) {
    throw new EvmBurnError(`${chain.name} is not configured in the wallet layer`)
  }
  return chain.chainId
}

// viem puts a revert reason on the line after "reverted with the following
// reason:", and the modal shows a single line
function reasonOf(err: unknown): string {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) {
      return reverted.reason ?? reverted.data?.errorName ?? 'the contract refused it'
    }
    return err.shortMessage.split('\n')[0]
  }
  return err instanceof Error ? err.message.split('\n')[0] : 'unknown error'
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
  onSent?: (hash: `0x${string}`) => void,
): Promise<`0x${string}`> {
  const chainId = await ensureChain(chain)
  let hash: `0x${string}`
  try {
    hash = await write(chainId)
  } catch (err) {
    if (isUserRejection(err)) throw new UserRejectedError()
    throw new EvmBurnError(`The ${what} failed on ${chain.name}: ${reasonOf(err)}`, { cause: err })
  }
  onSent?.(hash)
  let receipt
  try {
    receipt = await waitForTransactionReceipt(wagmiConfig, { chainId, hash })
  } catch (err) {
    throw new ReceiptUnreadError(hash, { cause: err })
  }
  // a receipt comes back for a reverted transaction too
  if (receipt.status !== 'success') throw new EvmBurnError(`The ${what} was reverted on chain (${hash})`)
  return hash
}

// Base hands out a receipt from a preconfirmed block before `latest` includes
// it, and the wallet estimates the burn against `latest`: sent right away, that
// estimate fails for want of an allowance. Past the deadline the wallet decides.
async function untilAllowanceVisible(chain: CctpSourceChain, units: bigint, timeoutMs = 60_000): Promise<void> {
  const owner = getAccount(wagmiConfig).address
  if (!owner) return
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const allowance = await readAllowance(chain, owner).catch(() => 0n)
    if (allowance >= units) return
    await new Promise((r) => setTimeout(r, 1_500))
  }
}

// exact amount, never unlimited: an open approval outlives the transfer
export async function approveUsdc(chain: CctpSourceChain, units: bigint): Promise<`0x${string}`> {
  let hash: `0x${string}`
  try {
    hash = await send(chain, 'approval', (chainId) =>
      writeContract(wagmiConfig, {
        chainId,
        address: chain.usdc,
        abi: erc20Abi,
        functionName: 'approve',
        args: [chain.tokenMessenger, units],
      }),
    )
  } catch (err) {
    // only the receipt is missing: the allowance on chain says whether the approval landed
    if (!(err instanceof ReceiptUnreadError)) throw err
    hash = err.hash
  }
  await untilAllowanceVisible(chain, units)
  return hash
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

// onSent hears the hash the moment the burn leaves the wallet, before any receipt
export async function burnToStellar(req: BurnRequest, onSent?: (hash: `0x${string}`) => void): Promise<`0x${string}`> {
  if (req.maxFee >= req.units) throw new EvmBurnError('The fee would swallow the whole amount')
  const args = burnArgs(req)
  return send(
    req.chain,
    'burn',
    (chainId) =>
      writeContract(wagmiConfig, {
        chainId,
        address: req.chain.tokenMessenger,
        abi: TOKEN_MESSENGER_V2_ABI,
        functionName: 'depositForBurnWithHook',
        args,
      }),
    onSent,
  )
}

// reading the burn from this log rather than the call input also covers a burn
// made from a smart account (a Safe, a custody platform), where it is an internal call
const DEPOSIT_FOR_BURN_EVENT = [
  {
    type: 'event',
    name: 'DepositForBurn',
    inputs: [
      { name: 'burnToken', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'depositor', type: 'address', indexed: true },
      { name: 'mintRecipient', type: 'bytes32', indexed: false },
      { name: 'destinationDomain', type: 'uint32', indexed: false },
      { name: 'destinationTokenMessenger', type: 'bytes32', indexed: false },
      { name: 'destinationCaller', type: 'bytes32', indexed: false },
      { name: 'maxFee', type: 'uint256', indexed: false },
      { name: 'minFinalityThreshold', type: 'uint32', indexed: true },
      { name: 'hookData', type: 'bytes', indexed: false },
    ],
  },
] as const

const ZERO_32 = `0x${'00'.repeat(32)}`

export interface BurnToStellar {
  units: bigint
  // the Stellar account the forwarder will pay
  recipient: string
  finality: CctpFinality
}

// A burn made outside this browser, read back from its receipt, so the dashboard
// can finish a transfer it never saw. Refuses anything the forwarder could not
// deliver rather than tracking a transfer that can never land.
export async function readBurnToStellar(
  chain: CctpSourceChain,
  hash: `0x${string}`,
  forwarder: string,
): Promise<BurnToStellar> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new EvmBurnError('Enter a transaction hash, 0x followed by 64 hex characters')
  const chainId = chainIdOf(chain)
  let receipt
  try {
    receipt = await getTransactionReceipt(wagmiConfig, { chainId, hash })
  } catch (err) {
    // only the chain saying it has no such receipt means no such transaction; an
    // endpoint that fails says nothing about the hash
    if (err instanceof Error && err.name === 'TransactionReceiptNotFoundError') {
      throw new EvmBurnError(`No confirmed transaction with that hash on ${chain.name}`)
    }
    throw new EvmBurnError(`Could not read ${chain.name} just now. Try again in a moment.`)
  }
  if (receipt.status !== 'success') throw new EvmBurnError('That transaction reverted, so nothing was burned')
  const burns = parseEventLogs({ abi: DEPOSIT_FOR_BURN_EVENT, logs: receipt.logs, eventName: 'DepositForBurn' }).filter(
    (l) => getAddress(l.address) === getAddress(chain.tokenMessenger),
  )
  const burn = burns.find((l) => l.args.destinationDomain === STELLAR_CCTP_DOMAIN)
  if (!burn) {
    throw new EvmBurnError(
      burns.length ? 'That burn is bound for another chain, not Stellar' : `That transaction burned no USDC through CCTP on ${chain.name}`,
    )
  }
  const forwarder32 = toHex(contractToBytes32(forwarder))
  const { mintRecipient, destinationCaller, hookData, amount, minFinalityThreshold } = burn.args
  // anyone may deliver when no caller is named; otherwise it has to be the forwarder
  if (mintRecipient.toLowerCase() !== forwarder32 || ![forwarder32, ZERO_32].includes(destinationCaller.toLowerCase())) {
    throw new EvmBurnError("That burn does not go through Circle's forwarder, so it cannot be delivered from here")
  }
  const { recipient } = decodeForwardHook(hexToBytes(hookData))
  return { units: amount, recipient, finality: minFinalityThreshold >= CCTP_FINALITY.standard ? 'standard' : 'fast' }
}
