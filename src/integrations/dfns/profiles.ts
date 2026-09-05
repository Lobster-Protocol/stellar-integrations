// A DFNS custody profile points the app at one relay and carries the read token to
// reach it. The client self-hosts that relay with their own DFNS env, so the app
// holds the url and the read token, never the client's signing key. The built-in
// demo profile comes from the build env; client profiles the operator adds live in
// this browser only.
//
// The operator (write/approval) token is NOT part of the stored profile: it is a
// bearer right to move or approve money, so it stays in sessionStorage, re-entered
// per session, never persisted to disk (see profileOperatorToken below).

export const DEMO_PROFILE_ID = '__demo__'

export interface DfnsProfile {
  id: string
  label: string
  kind: 'demo' | 'client'
  relayBaseUrl: string
  // x-lobster-token, the read gate
  apiToken: string
  // the host the operator confirmed to send tokens to. the resolver refuses to
  // attach the operator token when the current host does not match this, so a
  // silently-changed relay url cannot harvest it.
  trustedHost?: string
}

// what the relay resolver hands out for the active profile: everything a request
// needs, captured together so a mid-action profile switch cannot mix one profile's
// url with another's token.
export interface ActiveRelay {
  profileId: string
  baseUrl: string
  apiToken: string
  operatorToken: string | null
}

const PROFILES_KEY = 'lob_dfns_profiles'
const ACTIVE_KEY = 'lob_dfns_active'
// the single-relay operator token key that predates profiles; kept as the demo
// profile's operator token so an operator who already set it keeps their writes.
const DEMO_OPERATOR_KEY = 'lob_operator_token'

// a tiny store so components re-render when the profile set or selection changes.
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

// the snapshot for useSyncExternalStore: a primitive that changes on every store
// change, so the hook re-reads the (cheap) profile functions.
export function storeVersion(): number {
  return version
}

// pick up a change another tab made to the same storage.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === PROFILES_KEY || e.key === ACTIVE_KEY) emit()
  })
}

export function relayHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

// A client relay url is a place the dashboard will send money-authorizing tokens,
// so validate it hard: https only (the demo may use http on localhost for dev), no
// credentials in the url, and for a client no private/loopback/link-local host.
export function assertRelayUrl(raw: string, kind: 'demo' | 'client'): string {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new Error('That is not a valid URL. Enter your relay address, like https://relay.yourfirm.com')
  }
  if (u.username || u.password) {
    throw new Error('The relay URL must not carry a username or password.')
  }
  const loopback = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]'
  if (u.protocol !== 'https:' && !(kind === 'demo' && u.protocol === 'http:' && loopback)) {
    throw new Error('The relay must be served over https, so its tokens are never sent in the clear.')
  }
  if (kind === 'client') {
    const h = u.hostname
    const isPrivate =
      loopback ||
      /^(10|127)\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      /^169\.254\./.test(h) ||
      h === '0.0.0.0'
    if (isPrivate) {
      throw new Error('A client relay cannot be a private or loopback address; use its public https host.')
    }
  }
  return raw
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage off in this context; the change just does not persist
  }
}

function demoProfile(): DfnsProfile | null {
  const relayBaseUrl = import.meta.env.VITE_LOBSTER_API_URL
  if (!relayBaseUrl) return null
  return {
    id: DEMO_PROFILE_ID,
    label: 'Lobster demo (testnet)',
    kind: 'demo',
    relayBaseUrl,
    apiToken: import.meta.env.VITE_LOBSTER_API_TOKEN ?? '',
    trustedHost: relayHost(relayBaseUrl),
  }
}

// client profiles from localStorage. the demo is never stored here, it is always
// resolved from env, so it can never be edited into a client profile.
export function clientProfiles(): DfnsProfile[] {
  return read<DfnsProfile[]>(PROFILES_KEY, []).filter(
    (p): p is DfnsProfile => !!p && typeof p.id === 'string' && p.kind === 'client',
  )
}

export function listProfiles(): DfnsProfile[] {
  const demo = demoProfile()
  return [...(demo ? [demo] : []), ...clientProfiles()]
}

export function activeProfileId(): string | null {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(ACTIVE_KEY)
  } catch {
    stored = null
  }
  const all = listProfiles()
  if (stored && all.some((p) => p.id === stored)) return stored
  return all[0]?.id ?? null
}

export function activeProfile(): DfnsProfile | null {
  const id = activeProfileId()
  if (!id) return null
  return listProfiles().find((p) => p.id === id) ?? null
}

export function setActiveProfile(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id)
  } catch {
    // storage off; the selection lasts only this render
  }
  emit()
}

export function addClientProfile(input: Omit<DfnsProfile, 'id' | 'kind'>): DfnsProfile {
  assertRelayUrl(input.relayBaseUrl, 'client')
  const id = `client-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  const profile: DfnsProfile = {
    ...input,
    id,
    kind: 'client',
    trustedHost: input.trustedHost ?? relayHost(input.relayBaseUrl),
  }
  write(PROFILES_KEY, [...clientProfiles(), profile])
  // a freshly connected profile becomes the active one: connecting your dfns is
  // how you switch to it.
  setActiveProfile(id)
  return profile
}

export function removeClientProfile(id: string): void {
  write(
    PROFILES_KEY,
    clientProfiles().filter((p) => p.id !== id),
  )
  try {
    sessionStorage.removeItem(operatorKey(id))
  } catch {
    // storage off
  }
  if (activeProfileId() === id) {
    try {
      localStorage.removeItem(ACTIVE_KEY)
    } catch {
      // storage off
    }
  }
  emit()
}

function operatorKey(id: string): string {
  return `lob_op_token_${id}`
}

// the operator token is a bearer right to approve or move money. a client's stays
// in sessionStorage (gone when the tab closes, never on disk); the demo keeps the
// pre-existing localStorage key so an operator who set it keeps their writes. it is
// only ever resolved for a profile whose current host matches the trusted one.
export function profileOperatorToken(profile: DfnsProfile): string | null {
  if (profile.trustedHost && relayHost(profile.relayBaseUrl) !== profile.trustedHost) return null
  try {
    const raw =
      profile.kind === 'demo'
        ? localStorage.getItem(DEMO_OPERATOR_KEY)
        : sessionStorage.getItem(operatorKey(profile.id))
    return raw && raw.trim() ? raw.trim() : null
  } catch {
    return null
  }
}

export function setProfileOperatorToken(profile: DfnsProfile, token: string): void {
  try {
    if (profile.kind === 'demo') localStorage.setItem(DEMO_OPERATOR_KEY, token)
    else sessionStorage.setItem(operatorKey(profile.id), token)
  } catch {
    // storage off
  }
  emit()
}

// resolves everything the active profile's requests need in one shot. null when no
// profile is selected (the app is on browser-wallet custody or nothing is set).
export function activeRelay(): ActiveRelay | null {
  const p = activeProfile()
  if (!p) return null
  return {
    profileId: p.id,
    baseUrl: p.relayBaseUrl,
    apiToken: p.apiToken,
    operatorToken: profileOperatorToken(p),
  }
}
