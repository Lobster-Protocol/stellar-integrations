// A client can note that their connected wallet shares control with a DFNS multisig
// account. That note is a label, kept in this browser, keyed by network and wallet.
// It is never signed, sent, or turned into a custody route. The one thing it must
// refuse is pairing a wallet with a Lobster address: we run the demo relay, so a
// client's multisig must be their own DFNS, never ours.

import { CONTRACTS, type Network } from '../../config/contracts'
import { isAccountId } from '../stellar/strkey-guards'

const PAIR_KEY = 'lob_wallet_pair'
// our demo treasury address is runtime-only (the relay reports it, it is not in the
// bundle). We only see it while the demo profile is the active custody, which is the
// default on first load. Remember it there so the blocklist keeps refusing it later,
// when a client profile is active and we are deliberately not re-reading our org.
const OUR_RUNTIME_KEY = 'lob_our_dfns_addrs'

type PairMap = Record<string, string>

// our own accounts, from config, for both networks: the factory read source and the
// LOBS issuer. The demo treasury address is not in the bundle (the relay answers it
// at runtime), so the caller adds it to the guard when the demo is the active custody.
function ourStaticAddresses(): string[] {
  const out = new Set<string>()
  for (const net of ['testnet', 'mainnet'] as Network[]) {
    const c = CONTRACTS[net]
    for (const a of [c.lobster.readSource, c.lobsAsset.issuer]) {
      if (isAccountId(a)) out.add(a)
    }
  }
  return [...out]
}

export const OUR_STATIC_ADDRESSES = ourStaticAddresses()

export interface PairGuard {
  // every address we must refuse as a pair: OUR_STATIC_ADDRESSES plus, when our demo
  // is the active custody, the demo treasury the relay reported.
  ourAddresses: string[]
  // false while we still cannot vouch the candidate is not our demo treasury (the
  // relay has not answered yet). A save is refused until this is true: better to make
  // the client wait than to let our own address slip in as their pair.
  ready: boolean
}

export type PairVerdict = { ok: true; address: string } | { ok: false; reason: string }

export function evaluatePair(wallet: string, raw: string, guard: PairGuard): PairVerdict {
  const address = raw.trim()
  if (!address) {
    return { ok: false, reason: 'Enter the DFNS multisig account this wallet shares control with.' }
  }
  if (!isAccountId(address)) {
    return { ok: false, reason: 'That is not a Stellar account address. It starts with G and is 56 characters.' }
  }
  if (address === wallet) {
    return { ok: false, reason: 'That is the wallet you already connected. Pair it with the other signer, not itself.' }
  }
  if (!guard.ready) {
    return { ok: false, reason: 'Still confirming this is not a Lobster address. Give it a second and try again.' }
  }
  if (guard.ourAddresses.some((a) => a === address)) {
    return { ok: false, reason: 'That is a Lobster address. Pair your wallet with your own DFNS multisig, never ours.' }
  }
  return { ok: true, address }
}

let version = 0
const listeners = new Set<() => void>()

function emit(): void {
  version += 1
  for (const l of listeners) l()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function storeVersion(): number {
  return version
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === PAIR_KEY) emit()
  })
}

function readMap(): PairMap {
  try {
    const raw = localStorage.getItem(PAIR_KEY)
    return raw ? (JSON.parse(raw) as PairMap) : {}
  } catch {
    return {}
  }
}

function writeMap(map: PairMap): void {
  try {
    localStorage.setItem(PAIR_KEY, JSON.stringify(map))
  } catch {
    // storage off in this context; the note just does not persist
  }
}

function readOurRuntime(): string[] {
  try {
    const raw = localStorage.getItem(OUR_RUNTIME_KEY)
    const arr: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((a): a is string => typeof a === 'string' && isAccountId(a)) : []
  } catch {
    return []
  }
}

// addresses the app has confirmed are Lobster's own, seen while the demo relay was the
// active custody. Read into the pair blocklist so our treasury stays refused even after
// the client switches to their own profile (when we no longer re-read our org).
export function ourRuntimeAddresses(): string[] {
  return readOurRuntime()
}

export function rememberOurAddresses(addrs: Array<string | null | undefined>): void {
  const seen = new Set(readOurRuntime())
  let grew = false
  for (const a of addrs) {
    if (a && isAccountId(a) && !seen.has(a)) {
      seen.add(a)
      grew = true
    }
  }
  if (!grew) return
  try {
    localStorage.setItem(OUR_RUNTIME_KEY, JSON.stringify([...seen]))
  } catch {
    // storage off; the blocklist still has the static floor and the live demo list
  }
  emit()
}

function slot(network: Network, wallet: string): string {
  return `${network}:${wallet}`
}

export function pairedFor(network: Network, wallet: string | null): string | null {
  if (!wallet) return null
  const v = readMap()[slot(network, wallet)]
  return v && isAccountId(v) ? v : null
}

// throws with the verdict reason when the candidate is refused, so the caller can
// show it. returns the saved address on success.
export function setPair(network: Network, wallet: string, raw: string, guard: PairGuard): string {
  const verdict = evaluatePair(wallet, raw, guard)
  if (!verdict.ok) throw new Error(verdict.reason)
  const map = readMap()
  map[slot(network, wallet)] = verdict.address
  writeMap(map)
  emit()
  return verdict.address
}

export function clearPair(network: Network, wallet: string): void {
  const map = readMap()
  const key = slot(network, wallet)
  if (key in map) {
    delete map[key]
    writeMap(map)
    emit()
  }
}
