import { NotFoundError, rpc, scValToNative, xdr, Address as StellarAddress } from '@stellar/stellar-sdk'
import { formatUnits, getAddress, TransactionReceiptNotFoundError, type Address } from 'viem'
import { getBlock, getPublicClient, getTransactionReceipt } from 'wagmi/actions'

import { wagmiConfig, isConfiguredChainId } from '../evm/config'
import { getHorizonServer } from '../horizon/client'
import { getSorobanServer } from '../lobster/client'
import {
  CCTP_EVM_USDC_DECIMALS,
  CCTP_FINALITY,
  CONTRACTS,
  STELLAR_CCTP_DOMAIN,
  cctpChainsFor,
  type CctpFinality,
  type CctpSourceChain,
  type Network,
} from '../../config/contracts'
import { contractToBytes32, decodeForwardHook, toHex } from './forward-hook'
import { fetchAttestation } from './iris'
import { decodeCctpMessage, hexToBytes } from './message'
import { isDeliveredOnStellar } from './claim'
import { DEPOSIT_FOR_BURN_EVENT, isReceivedOnEvm, readBlockNumber, readTxCount } from './evm-burn'
import { circleMinted } from './status'
import { stellarToEvmUnits } from './stellar-burn'
import { isSettled, markSettled, type BurnIntent, type TrackedTransfer } from './transfers'

// Finding transfers again after the page that started them went away: the PC switched
// off, the tab closed, another device, a browser that lost its storage. Two ways in: an
// EVM burn the wallet was asked for whose hash never came back (an intent saved before the
// signature; an EVM wallet sends by itself, a phone even after the page is gone), and
// every burn of the connected wallets that has not arrived yet. A Stellar burn needs no
// intent: the page sends it, so a page gone before that sends nothing.

const ZERO_32 = `0x${'00'.repeat(32)}`
const HOUR = 3600_000
// a piece of blocks this small is never refused for its size
const SMALLEST_PIECE = 500n
// a day of Base blocks at 2,000 a piece, with room to split a few
const MOST_PIECES = 60
// how far back the Stellar account's own history is read for burns out of it, and how many
// pages of 200 operations at most: a busy account's month
const STELLAR_LOOKBACK_MS = 30 * 24 * HOUR
const STELLAR_PAGES = 20
// Every burn not yet known to have arrived is checked, two at a time and at the pace every
// request to Circle keeps (iris.ts). Past this many in one search the rest waits for the
// next one
const MOST_LOOKUPS = 400
const LOOKUPS_AT_ONCE = 2

// Asks whether each burn arrived, at most `n` at once, each answer kept at its burn's place.
// The first check that fails ends the asking: Circle answers a caller it shuts out with an
// error the browser cannot even read, and asking on would only keep it shut. What was not
// asked stays null, to be asked by the next search
async function checkInTurn<T>(items: T[], n: number, check: (item: T) => Promise<boolean | null>): Promise<(boolean | null)[]> {
  const out: (boolean | null)[] = new Array(items.length).fill(null)
  let next = 0
  let failed = false
  const worker = async () => {
    while (next < items.length && !failed) {
      const i = next++
      out[i] = await check(items[i])
      if (out[i] === null) failed = true
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker))
  return out
}

export interface EvmBurn {
  hash: `0x${string}`
  blockNumber: bigint
  units: bigint
  // the Stellar account the forwarder pays
  recipient: string
  finality: CctpFinality
}

interface BurnLog {
  transactionHash: `0x${string}` | null
  blockNumber: bigint | null
  args: {
    amount?: bigint
    mintRecipient?: `0x${string}`
    destinationDomain?: number
    destinationCaller?: `0x${string}`
    minFinalityThreshold?: number
    hookData?: `0x${string}`
  }
}

// a DepositForBurn log, kept only when it goes to Stellar through Circle's forwarder,
// the one kind of burn this page can finish
export function burnFromLog(log: BurnLog, forwarder: string): EvmBurn | null {
  const a = log.args
  if (!log.transactionHash || log.blockNumber === null || a.amount === undefined || !a.hookData) return null
  if (a.destinationDomain !== STELLAR_CCTP_DOMAIN) return null
  const forwarder32 = toHex(contractToBytes32(forwarder)).toLowerCase()
  if (a.mintRecipient?.toLowerCase() !== forwarder32) return null
  if (![forwarder32, ZERO_32].includes(a.destinationCaller?.toLowerCase() ?? '')) return null
  let recipient: string
  try {
    recipient = decodeForwardHook(hexToBytes(a.hookData)).recipient
  } catch {
    return null
  }
  return {
    hash: log.transactionHash.toLowerCase() as `0x${string}`,
    blockNumber: log.blockNumber,
    units: a.amount,
    recipient,
    finality: (a.minFinalityThreshold ?? 0) >= CCTP_FINALITY.standard ? 'standard' : 'fast',
  }
}

export interface LogSearch {
  burns: EvmBurn[]
  // the oldest block reached; blocks between it and the start asked for went unread
  reachedFrom: bigint
  complete: boolean
  error?: string
}

function errorText(err: unknown): string {
  const e = err as { details?: string; shortMessage?: string; message?: string }
  return `${e?.details ?? ''} ${e?.shortMessage ?? ''} ${e?.message ?? ''}`
}

// "limited to a 2,000 range", "exceed maximum block range": the piece was too big. An
// archive or state error is about the blocks' age, which a smaller piece does not cure
export function refusedForSize(err: unknown): boolean {
  const text = errorText(err)
  if (/archive|state|pruned|missing trie/i.test(text)) return false
  return /range|limit|exceed|too (large|many|big)|block span|maximum/i.test(text)
}

// One wallet's burns to Stellar between two blocks, newest first, in pieces the endpoints
// answer: a piece refused for its size is split, and blocks the endpoints no longer serve
// end the search there, the caller learning how far back it got
export async function findEvmBurnsToStellar(
  chain: CctpSourceChain,
  depositor: Address,
  from: bigint,
  to: bigint,
  forwarder: string,
): Promise<LogSearch> {
  if (!isConfiguredChainId(chain.chainId)) return { burns: [], reachedFrom: to + 1n, complete: false, error: 'chain not set up' }
  const client = getPublicClient(wagmiConfig, { chainId: chain.chainId })
  const burns: EvmBurn[] = []
  let span = BigInt(chain.logsSpan)
  let end = to
  let pieces = 0
  while (end >= from) {
    if (pieces++ >= MOST_PIECES) return { burns, reachedFrom: end + 1n, complete: false, error: 'too many pieces' }
    const start = end - span + 1n > from ? end - span + 1n : from
    try {
      const logs = await client.getLogs({
        address: chain.tokenMessenger,
        event: DEPOSIT_FOR_BURN_EVENT[0],
        args: { depositor: getAddress(depositor) },
        fromBlock: start,
        toBlock: end,
      })
      for (const l of logs) {
        const b = burnFromLog(l as BurnLog, forwarder)
        if (b) burns.push(b)
      }
      end = start - 1n
    } catch (err) {
      if (refusedForSize(err) && span > SMALLEST_PIECE) {
        span /= 2n
        continue
      }
      return { burns, reachedFrom: end + 1n, complete: false, error: errorText(err).trim().slice(0, 120) }
    }
  }
  return { burns, reachedFrom: from, complete: true }
}

async function blockTime(chain: CctpSourceChain, blockNumber: bigint): Promise<number> {
  try {
    if (!isConfiguredChainId(chain.chainId)) return Date.now()
    const b = await getBlock(wagmiConfig, { chainId: chain.chainId, blockNumber })
    return Number(b.timestamp) * 1000
  } catch {
    return Date.now()
  }
}

function transferFromEvmBurn(network: Network, chain: CctpSourceChain, b: EvmBurn, createdAt: number): TrackedTransfer {
  return {
    id: b.hash,
    direction: 'to-stellar',
    network,
    chainKey: chain.key,
    chainName: chain.name,
    sourceDomain: chain.domain,
    amount: formatUnits(b.units, CCTP_EVM_USDC_DECIMALS),
    recipient: b.recipient,
    finality: b.finality,
    createdAt,
    stage: 'burned',
  }
}

// 'arrived' once the Stellar nonce is spent, whoever delivered it; a read that fails is
// left for the page's watcher, which settles it when it can
async function arrivedOnStellar(network: Network, chain: CctpSourceChain, hash: string): Promise<boolean | null> {
  try {
    const att = await fetchAttestation(network, chain.domain, hash, 10_000, STELLAR_CCTP_DOMAIN)
    if (att.state !== 'complete') return false
    return await isDeliveredOnStellar(network, att.message)
  } catch {
    return null
  }
}

export interface EvmSearchResult {
  found: TrackedTransfer[]
  head: bigint
  search: LogSearch
  // burns past the most one search checks, left for the next
  unchecked: number
}

// every burn of one EVM wallet on one chain that has not reached Stellar, back to `since`
// or the chain's search depth
export async function searchEvmWallet(
  network: Network,
  chain: CctpSourceChain,
  depositor: Address,
  known: Set<string>,
  since?: bigint,
): Promise<EvmSearchResult> {
  const head = await readBlockNumber(chain)
  const floor = head - BigInt(chain.searchBlocks)
  const from = since !== undefined && since > floor ? since : floor
  const search = await findEvmBurnsToStellar(chain, depositor, from, head, CONTRACTS[network].cctp.forwarder)
  const found: TrackedTransfer[] = []
  const settled: string[] = []
  const unknown = search.burns.filter((b) => !known.has(b.hash) && !isSettled(network, b.hash))
  const todo = unknown.slice(0, MOST_LOOKUPS)
  let unchecked = unknown.length - todo.length
  const answers = await checkInTurn(todo, LOOKUPS_AT_ONCE, (b) => arrivedOnStellar(network, chain, b.hash))
  for (const [i, b] of todo.entries()) {
    // a burn that could not be checked is not listed: it may well have arrived long ago, and
    // a list of transfers that are not on their way would bury the one that is
    if (answers[i] === null) unchecked++
    else if (answers[i]) settled.push(b.hash)
    else found.push(transferFromEvmBurn(network, chain, b, await blockTime(chain, b.blockNumber)))
  }
  markSettled(network, settled)
  if (unchecked === 0) return { found, head, search, unchecked }
  return { found, head, search: { ...search, complete: false, error: search.error ?? `${unchecked} burn(s) left to check` }, unchecked }
}

export interface StellarBurn {
  hash: string
  at: number
  // 7 decimals, as burned on Stellar
  units: bigint
  domain: number
  // the EVM address the burn pays
  recipient: string
  forwarded: boolean
}

interface OpLike {
  type: string
  transaction_hash: string
  transaction_successful?: boolean
  created_at: string
  parameters?: Array<{ type: string; value: string }>
}

const BURN_FNS = new Set(['deposit_for_burn', 'deposit_for_burn_with_hook'])

// a burn out of Stellar read from the account's own operation: Circle's TokenMessengerMinter
// called with (caller, amount, domain, mint recipient, ...)
export function burnFromOperation(op: OpLike, tokenMessengerMinter: string): StellarBurn | null {
  if (op.type !== 'invoke_host_function' || op.transaction_successful === false) return null
  const p = op.parameters ?? []
  if (p.length < 6) return null
  try {
    const val = (i: number) => xdr.ScVal.fromXDR(p[i].value, 'base64')
    if (StellarAddress.fromScVal(val(0)).toString() !== tokenMessengerMinter) return null
    const fn = val(1).sym().toString()
    if (!BURN_FNS.has(fn)) return null
    const units = BigInt(scValToNative(val(3)) as bigint | number | string)
    const domain = Number(scValToNative(val(4)))
    const mint = val(5).bytes()
    if (mint.length !== 32 || mint.subarray(0, 12).some((b) => b !== 0)) return null
    return {
      hash: op.transaction_hash,
      at: Date.parse(op.created_at),
      units,
      domain,
      recipient: getAddress(toHex(mint.subarray(12))),
      forwarded: fn === 'deposit_for_burn_with_hook',
    }
  } catch {
    return null
  }
}

// the account's burns out of Stellar, newest first, back to `since`; `reachedAll` is false
// when the account did more since then than the pages read hold
export async function stellarBurnsOf(
  network: Network,
  account: string,
  since: number,
  pages = STELLAR_PAGES,
): Promise<{ burns: StellarBurn[]; reachedAll: boolean }> {
  const tmm = CONTRACTS[network].cctp.tokenMessengerMinter
  const server = getHorizonServer(network)
  const burns: StellarBurn[] = []
  let page
  try {
    page = await server.operations().forAccount(account).order('desc').limit(200).call()
  } catch (err) {
    // an account not on the ledger yet has burned nothing
    if (err instanceof NotFoundError) return { burns, reachedAll: true }
    throw err
  }
  for (let n = 0; n < pages; n++) {
    for (const op of page.records as unknown as OpLike[]) {
      if (Date.parse(op.created_at) < since) return { burns, reachedAll: true }
      const b = burnFromOperation(op, tmm)
      if (b) burns.push(b)
    }
    if (page.records.length < 200) return { burns, reachedAll: true }
    if (n < pages - 1) page = await page.next()
  }
  return { burns, reachedAll: false }
}

function transferFromStellarBurn(network: Network, chain: CctpSourceChain, b: StellarBurn): TrackedTransfer {
  return {
    id: b.hash,
    direction: 'from-stellar',
    network,
    chainKey: chain.key,
    chainName: chain.name,
    sourceDomain: STELLAR_CCTP_DOMAIN,
    amount: formatUnits(stellarToEvmUnits(b.units), CCTP_EVM_USDC_DECIMALS),
    recipient: b.recipient,
    finality: 'standard',
    forwarded: b.forwarded,
    createdAt: b.at,
    stage: 'burned',
  }
}

// every burn out of one Stellar account in the last month that has not reached its EVM chain;
// `complete` is false when part of the month, or some burn in it, could not be checked
export async function searchStellarAccount(
  network: Network,
  account: string,
  known: Set<string>,
): Promise<{ found: TrackedTransfer[]; complete: boolean }> {
  const chains = cctpChainsFor(network)
  const { burns, reachedAll } = await stellarBurnsOf(network, account, Date.now() - STELLAR_LOOKBACK_MS)
  const found: TrackedTransfer[] = []
  const settled: string[] = []
  const unknown = burns.filter((b) => !known.has(b.hash) && !isSettled(network, b.hash) && chains.some((c) => c.domain === b.domain))
  const todo = unknown.slice(0, MOST_LOOKUPS)
  let unchecked = unknown.length - todo.length
  const answers = await checkInTurn(todo, LOOKUPS_AT_ONCE, async (b): Promise<boolean | null> => {
    const chain = chains.find((c) => c.domain === b.domain)!
    try {
      const att = await fetchAttestation(network, STELLAR_CCTP_DOMAIN, b.hash, 10_000, chain.domain)
      if (att.state !== 'complete') return false
      return (b.forwarded && circleMinted(att.forwardState)) || (await isReceivedOnEvm(chain, decodeCctpMessage(hexToBytes(att.message)).nonce))
    } catch {
      return null
    }
  })
  for (const [i, b] of todo.entries()) {
    if (answers[i] === null) unchecked++
    else if (answers[i]) settled.push(b.hash)
    else found.push(transferFromStellarBurn(network, chains.find((c) => c.domain === b.domain)!, b))
  }
  markSettled(network, settled)
  return { found, complete: reachedAll && unchecked === 0 }
}

export type IntentOutcome =
  | { kind: 'found'; transfer: TrackedTransfer }
  // it went out, and the page already follows it: the wallet search got there first
  | { kind: 'tracked' }
  // nothing went out, and nothing can any more
  | { kind: 'none' }
  // a day on, the chain could not be read far enough back to tell
  | { kind: 'unreadable' }
  | { kind: 'open' }

// a burn the wallet was asked for on an EVM chain, looked for from the block it was asked at
export async function resolveEvmIntent(intent: BurnIntent, known: Set<string>): Promise<IntentOutcome> {
  const chain = cctpChainsFor(intent.network).find((c) => c.key === intent.chainKey)
  if (!chain) return { kind: 'none' }
  const head = await readBlockNumber(chain)
  const depth = BigInt(chain.searchBlocks)
  const from = intent.fromBlock ? BigInt(intent.fromBlock) - 2n : head - depth
  const to = head - from > depth ? from + depth : head
  const search = await findEvmBurnsToStellar(chain, intent.from as Address, from, to, CONTRACTS[intent.network].cctp.forwarder)
  const units = BigInt(intent.units)
  const same = search.burns.filter((b) => b.recipient === intent.recipient && b.units === units)
  const hit = same.find((b) => !known.has(b.hash))
  if (hit) return { kind: 'found', transfer: transferFromEvmBurn(intent.network, chain, hit, await blockTime(chain, hit.blockNumber)) }
  // one already followed counts only from the block the wallet was asked at: an identical
  // burn just before it is an earlier transfer
  if (intent.fromBlock && same.some((b) => b.blockNumber >= BigInt(intent.fromBlock!))) return { kind: 'tracked' }
  const age = Date.now() - intent.startedAt
  if (!search.complete) return age > 24 * HOUR ? { kind: 'unreadable' } : { kind: 'open' }
  if (age > 24 * HOUR) return { kind: 'none' }
  // a wallet can hold a request for a long while; one that has sent nothing for half an
  // hour after being asked is taken as never having signed it
  if (age > HOUR / 2 && intent.txCount !== undefined) {
    const count = await readTxCount(chain, intent.from as Address).catch(() => null)
    if (count !== null && count <= intent.txCount) return { kind: 'none' }
  }
  return { kind: 'open' }
}

// What became of a burn tracked before its chain confirmed it: on the ledger, there but
// failed (nothing moved), not there, or null when that could not be read
export type BurnFate = 'landed' | 'failed' | 'missing' | null

// A burn out of Stellar is tracked from its signature, before Stellar has it. Horizon can
// lag the ledger, so a burn it does not know is only taken as missing once the RPC, which
// keeps the last day of transactions, does not know it either
export async function stellarBurnFate(network: Network, hash: string): Promise<BurnFate> {
  try {
    const tx = await getHorizonServer(network).transactions().transaction(hash).call()
    return tx.successful ? 'landed' : 'failed'
  } catch (err) {
    if (!(err instanceof NotFoundError)) return null
  }
  try {
    const r = await getSorobanServer(network).getTransaction(hash)
    if (r.status === rpc.Api.GetTransactionStatus.SUCCESS) return 'landed'
    if (r.status === rpc.Api.GetTransactionStatus.FAILED) return 'failed'
    return 'missing'
  } catch {
    return null
  }
}

// An EVM burn tracked from the hash the wallet returned, whose receipt the page never read:
// one that reverted moved nothing. One not mined yet is left alone, it still may be
export async function evmBurnFate(chain: CctpSourceChain, hash: `0x${string}`): Promise<BurnFate> {
  if (!isConfiguredChainId(chain.chainId)) return null
  try {
    const r = await getTransactionReceipt(wagmiConfig, { chainId: chain.chainId, hash })
    return r.status === 'success' ? 'landed' : 'failed'
  } catch (err) {
    return err instanceof TransactionReceiptNotFoundError ? 'missing' : null
  }
}
