import { useSyncExternalStore } from 'react'
import { StrKey } from '@stellar/stellar-sdk'

import type { CctpFinality, Network } from '../../config/contracts'
import { restoreNotes, writeDurable, writeLocal, writtenAt } from './durable'

export type TransferStage = 'burned' | 'delivered'

// to-stellar: burned on an EVM chain, delivered on Stellar. from-stellar: the reverse
export type TransferDirection = 'to-stellar' | 'from-stellar'

// Between the burn and the delivery nothing on either chain remembers the
// transfer, so we do. Hashes and addresses only.
export interface TrackedTransfer {
  // the burn hash, unique per transfer: 0x-prefixed on an EVM chain, bare hex on Stellar
  id: string
  // absent means to-stellar
  direction?: TransferDirection
  network: Network
  // the EVM chain at the other end, where the burn happened or where the USDC is minted
  chainKey: string
  chainName: string
  // CCTP domain of the chain that burned
  sourceDomain: number
  // what the person typed, for display
  amount: string
  // a Stellar account on the way in, an EVM address on the way out
  recipient: string
  finality: CctpFinality
  createdAt: number
  stage: TransferStage
  // on the way out, Circle mints on the EVM chain itself for a fee taken from the amount
  forwarded?: boolean
  // when Circle's signature was first seen, and when the USDC landed
  attestedAt?: number
  deliveredAt?: number
  deliveredHash?: string
  // the mint the EVM wallet sent, saved as soon as the wallet returns it so an unread
  // receipt does not lose it
  sentHash?: string
  // a burn out of Stellar tracked from its signature: after this time Stellar can no
  // longer take it, so only then may its absence from the ledger mean it never went out
  validUntil?: number
}

export function directionOf(t: TrackedTransfer): TransferDirection {
  return t.direction ?? 'to-stellar'
}

const EVENT = 'lob:cctp-transfers'

function key(network: Network): string {
  return `lob_cctp_transfers_${network}`
}

// useSyncExternalStore needs the same array back until something changes, or
// it re-renders forever
const cache = new Map<Network, TrackedTransfer[]>()

export function listTransfers(network: Network): TrackedTransfer[] {
  try {
    const raw = localStorage.getItem(key(network))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // only keep entries of the right network, in case storage was edited by hand
    return parsed.filter(
      (t): t is TrackedTransfer =>
        !!t && typeof t === 'object' && (t as TrackedTransfer).network === network && typeof (t as TrackedTransfer).id === 'string',
    )
  } catch {
    return []
  }
}

function write(network: Network, list: TrackedTransfer[]): void {
  const value = JSON.stringify(list)
  let written = Date.now()
  try {
    written = writeLocal(key(network), value)
  } catch {
    // private mode or a full quota: the copy on disk still keeps it for the next visit
  }
  void writeDurable(key(network), value, written)
  cache.delete(network)
  window.dispatchEvent(new Event(EVENT))
}

// the history shown is short; a transfer still on its way is never the one dropped
const HISTORY_KEPT = 50

export function trackTransfer(t: TrackedTransfer): void {
  const list = [t, ...listTransfers(t.network).filter((x) => x.id !== t.id)]
  let finished = 0
  write(
    t.network,
    list.filter((x) => x.stage !== 'delivered' || ++finished <= HISTORY_KEPT),
  )
}

function update(network: Network, id: string, change: (t: TrackedTransfer) => TrackedTransfer): void {
  const list = listTransfers(network)
  if (!list.some((t) => t.id === id)) return
  write(network, list.map((t) => (t.id === id ? change(t) : t)))
}

// the first time Circle's signature is seen; a later look keeps that time
export function markAttested(network: Network, id: string, at = Date.now()): void {
  const t = listTransfers(network).find((x) => x.id === id)
  if (!t || t.attestedAt) return
  update(network, id, (x) => ({ ...x, attestedAt: at }))
}

// an empty hash clears it: the mint reverted, or never left the wallet
export function markSent(network: Network, id: string, hash: string): void {
  update(network, id, (t) => ({ ...t, sentHash: hash || undefined }))
}

// with no hash given, the mint the wallet sent counts as the delivery once the chain has it
export function markDelivered(network: Network, id: string, deliveredHash: string): void {
  update(network, id, (t) => ({
    ...t,
    stage: 'delivered',
    deliveredHash: deliveredHash || t.deliveredHash || t.sentHash,
    deliveredAt: t.deliveredAt ?? Date.now(),
  }))
}

export function forgetTransfer(network: Network, id: string): void {
  write(network, listTransfers(network).filter((t) => t.id !== id))
}

// Saved before the EVM wallet is asked to sign a burn. The wallet broadcasts on its own (a
// phone even after the page is gone), so the hash may never reach us; the next visit
// looks for the burn on chain from this.
export interface BurnIntent {
  id: string
  network: Network
  chainKey: string
  chainName: string
  amount: string
  // what the burn moves, 6 decimals, as text
  units: string
  // the EVM wallet asked to sign, and the Stellar account the USDC is for
  from: string
  recipient: string
  finality: CctpFinality
  startedAt: number
  // the page load that asked; it settles its own intents, and only other sessions' are
  // looked for on chain
  session: string
  // on the way in, the EVM chain's block just before the wallet was asked, and how many
  // transactions the wallet had sent by then: the same count later means it sent none
  fromBlock?: string
  txCount?: number
}

function intentsKey(network: Network): string {
  return `lob_cctp_intents_${network}`
}

const intentCache = new Map<Network, BurnIntent[]>()

export function listIntents(network: Network): BurnIntent[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(intentsKey(network)) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (i): i is BurnIntent =>
        !!i && typeof i === 'object' && (i as BurnIntent).network === network && typeof (i as BurnIntent).id === 'string',
    )
  } catch {
    return []
  }
}

// resolves when the disk copy is written or given up on
function writeIntents(network: Network, list: BurnIntent[]): Promise<void> {
  const value = JSON.stringify(list)
  let written = Date.now()
  try {
    written = writeLocal(intentsKey(network), value)
  } catch {
    // the copy on disk still keeps it; without either, the burn is found again by the wallet's address
  }
  intentCache.delete(network)
  window.dispatchEvent(new Event(EVENT))
  return writeDurable(intentsKey(network), value, written)
}

export function saveIntent(i: BurnIntent): Promise<void> {
  return writeIntents(i.network, [i, ...listIntents(i.network).filter((x) => x.id !== i.id)])
}

export function dropIntent(network: Network, id: string): Promise<void> {
  return writeIntents(network, listIntents(network).filter((x) => x.id !== id))
}

export function newIntentId(): string {
  return `intent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const PAGE_SESSION = Math.random().toString(36).slice(2, 10)

// intents another page load made, which may have gone away mid-signature
export function orphanIntents(list: BurnIntent[]): BurnIntent[] {
  return list.filter((i) => i.session !== PAGE_SESSION)
}

// burns a search already found arrived, so the next one does not ask Circle about them again
const SETTLED_KEPT = 500

function settledKey(network: Network): string {
  return `lob_cctp_settled_${network}`
}

function listSettled(network: Network): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(settledKey(network)) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function isSettled(network: Network, id: string): boolean {
  return listSettled(network).includes(id)
}

export function markSettled(network: Network, ids: string[]): void {
  if (ids.length === 0) return
  const next = [...new Set([...ids, ...listSettled(network)])].slice(0, SETTLED_KEPT)
  try {
    localStorage.setItem(settledKey(network), JSON.stringify(next))
  } catch {
    // only costs a few repeat questions to Circle on the next search
  }
}

// Wallets this browser bridged with, searched at every visit whether connected or not (an
// EVM wallet locks itself on browser restart). Noted on connect, before anything is signed
export interface BridgeWallet {
  kind: 'evm' | 'stellar'
  address: string
  // the last time it was seen
  at: number
}

const WALLETS_KEPT = 6
const WALLET_KEPT_FOR_MS = 30 * 24 * 3600_000
// seen again within this long, the note is left as it is
const WALLET_SEEN_MS = 3600_000

function walletsKey(network: Network): string {
  return `lob_cctp_wallets_${network}`
}

function validWallet(w: unknown): w is BridgeWallet {
  if (!w || typeof w !== 'object') return false
  const { kind, address, at } = w as BridgeWallet
  if (typeof at !== 'number' || typeof address !== 'string') return false
  if (kind === 'evm') return /^0x[0-9a-fA-F]{40}$/.test(address)
  return kind === 'stellar' && StrKey.isValidEd25519PublicKey(address)
}

export function listWallets(network: Network): BridgeWallet[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(walletsKey(network)) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((w): w is BridgeWallet => validWallet(w) && Date.now() - w.at < WALLET_KEPT_FOR_MS)
  } catch {
    return []
  }
}

const isWallet = (w: BridgeWallet, kind: BridgeWallet['kind'], address: string) =>
  w.kind === kind && w.address.toLowerCase() === address.toLowerCase()

export function rememberWallet(network: Network, kind: BridgeWallet['kind'], address: string): void {
  const list = listWallets(network)
  const seen = list.find((w) => isWallet(w, kind, address))
  if (seen && Date.now() - seen.at < WALLET_SEEN_MS) return
  const next = [{ kind, address, at: Date.now() }, ...list.filter((w) => !isWallet(w, kind, address))]
  const value = JSON.stringify(next.filter(validWallet).slice(0, WALLETS_KEPT))
  let written = Date.now()
  try {
    written = writeLocal(walletsKey(network), value)
  } catch {
    // the copy on disk still keeps it
  }
  void writeDurable(walletsKey(network), value, written)
}

// what a search covers: the wallets connected now and the ones this browser bridged with
// lately, each once
export function walletsToSearch(
  network: Network,
  stellar: string | null | undefined,
  evm: string | null | undefined,
): { stellar: string[]; evm: string[] } {
  const remembered = listWallets(network)
  const once = (xs: string[]) => xs.filter((x, i) => xs.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i)
  return {
    stellar: once([...(stellar ? [stellar] : []), ...remembered.filter((w) => w.kind === 'stellar').map((w) => w.address)]),
    evm: once([...(evm ? [evm] : []), ...remembered.filter((w) => w.kind === 'evm').map((w) => w.address)]),
  }
}

// the Bridges page asks the background search to run now through this event
export const SEARCH_EVENT = 'lob:cctp-search'

// What the last search for unfinished transfers covered, per wallet and chain: shown on
// the Bridges page, and where the next search picks up
export interface SearchRecord {
  at: number
  // the newest block (or ledger) looked at, and the oldest one the search reached
  head?: string
  reachedFrom?: string
  complete: boolean
  error?: string
}

function searchKey(network: Network): string {
  return `lob_cctp_search_${network}`
}

const searchCache = new Map<Network, Record<string, SearchRecord>>()

export function listSearches(network: Network): Record<string, SearchRecord> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(searchKey(network)) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, SearchRecord>) : {}
  } catch {
    return {}
  }
}

export function recordSearch(network: Network, key: string, rec: SearchRecord): void {
  try {
    localStorage.setItem(searchKey(network), JSON.stringify({ ...listSearches(network), [key]: rec }))
  } catch {
    // the search still ran; only its summary is not kept
  }
  searchCache.delete(network)
  window.dispatchEvent(new Event(EVENT))
}

// after a failed search (an endpoint refused or throttled it), no trigger re-runs it for
// this long: retrying on each one turns a refusal into a flood
export const SEARCH_FAILURE_PAUSE_MS = 15 * 60_000

export function searchPaused(rec: SearchRecord | undefined, now = Date.now()): boolean {
  return !!rec && !rec.complete && !!rec.error && now - rec.at < SEARCH_FAILURE_PAUSE_MS
}

function subscribe(onChange: () => void): () => void {
  const handler = () => {
    cache.clear()
    intentCache.clear()
    searchCache.clear()
    onChange()
  }
  window.addEventListener(EVENT, handler)
  // another tab finishing a transfer should show here too
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}

const EMPTY: TrackedTransfer[] = []

export function useTrackedTransfers(network: Network): TrackedTransfer[] {
  return useSyncExternalStore(
    subscribe,
    () => {
      const hit = cache.get(network)
      if (hit) return hit
      const fresh = listTransfers(network)
      cache.set(network, fresh)
      return fresh
    },
    () => EMPTY,
  )
}

const NO_SEARCHES: Record<string, SearchRecord> = {}

export function useSearches(network: Network): Record<string, SearchRecord> {
  return useSyncExternalStore(
    subscribe,
    () => {
      const hit = searchCache.get(network)
      if (hit) return hit
      const fresh = listSearches(network)
      searchCache.set(network, fresh)
      return fresh
    },
    () => NO_SEARCHES,
  )
}

const NO_INTENTS: BurnIntent[] = []

export function useBurnIntents(network: Network): BurnIntent[] {
  return useSyncExternalStore(
    subscribe,
    () => {
      const hit = intentCache.get(network)
      if (hit) return hit
      const fresh = listIntents(network)
      intentCache.set(network, fresh)
      return fresh
    },
    () => NO_INTENTS,
  )
}

// transfers, intents and wallets, restored at load from the disk copy when it is newer
const NOTES = (['testnet', 'mainnet'] as const).flatMap((n) => [key(n), intentsKey(n), walletsKey(n)])

export function restoreFromDisk(): Promise<void> {
  let atLoad: Record<string, number> = {}
  try {
    atLoad = Object.fromEntries(NOTES.map((k) => [k, writtenAt(k)]))
  } catch {
    return Promise.resolve()
  }
  return restoreNotes(NOTES, atLoad).then(
    (back) => {
      if (back.length === 0) return
      cache.clear()
      intentCache.clear()
      window.dispatchEvent(new Event(EVENT))
    },
    () => {},
  )
}

void restoreFromDisk()
