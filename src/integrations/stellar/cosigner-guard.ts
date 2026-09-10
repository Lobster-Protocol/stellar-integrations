import { CONTRACTS, type Network } from '../../config/contracts'
import { isAccountId } from './strkey-guards'

// A co-signer has to be a key the account holder can actually sign with. Nobody can
// verify that from here, but one class of mistake is worth refusing outright: putting
// one of Lobster's own addresses on the account. That key lives in DFNS custody with
// no browser behind it, so the quorum can never be met from the dashboard and the
// account ends up frozen. It happened once on the demo wallet.
const OUR_RUNTIME_KEY = 'lob_our_dfns_addrs'

function staticOurs(): string[] {
  const out = new Set<string>()
  for (const net of ['testnet', 'mainnet'] as Network[]) {
    const c = CONTRACTS[net]
    for (const a of [c.lobster.readSource, c.lobsAsset.issuer]) {
      if (a && isAccountId(a)) out.add(a)
    }
  }
  return [...out]
}

export const OUR_STATIC_ADDRESSES = staticOurs()

// The DFNS treasury is not in the bundle, the relay reports it. Keep every one we
// are told about so it stays refused later, when no profile is connected to ask.
export function rememberOurAddress(addr: string | null | undefined): void {
  if (!addr || !isAccountId(addr)) return
  try {
    const held = ourRuntimeAddresses()
    if (held.includes(addr)) return
    localStorage.setItem(OUR_RUNTIME_KEY, JSON.stringify([...held, addr]))
  } catch {
    // a browser that refuses storage still gets the static list
  }
}

export function ourRuntimeAddresses(): string[] {
  try {
    const raw = localStorage.getItem(OUR_RUNTIME_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((a): a is string => typeof a === 'string' && isAccountId(a)) : []
  } catch {
    return []
  }
}

export function ourAddresses(extra: Array<string | null | undefined> = []): string[] {
  const out = new Set([...OUR_STATIC_ADDRESSES, ...ourRuntimeAddresses()])
  for (const a of extra) if (a && isAccountId(a)) out.add(a)
  return [...out]
}

// Returns the reason this address cannot be a co-signer, or null when it can.
export function coSignerProblem(
  wallet: string | null,
  candidate: string,
  ours: string[],
): string | null {
  const value = candidate.trim()
  if (value === '') return null
  if (!isAccountId(value)) return 'That is not a Stellar account address.'
  if (wallet && value === wallet) return 'This is the wallet you are already signing with.'
  if (ours.includes(value)) {
    return 'This is a Lobster address. Its key sits in DFNS custody with no wallet behind it, so the quorum could never be met and the account would be stuck. Use a key you hold.'
  }
  return null
}
