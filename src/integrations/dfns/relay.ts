import { activeRelay, type ActiveRelay } from './profiles'

// One place for the relay convention: base url and read token come from the ACTIVE
// dfns profile, not a build-time env, so the dashboard can talk to the client's own
// relay. A caller can pass a bound relay to pin a multi-step flow (a poll) to the
// profile it started on, so a mid-flow switch cannot redirect it to another relay.
// bearer token in a header, no ambient cookies (the relay reads no cookie).
export function relayFetch(path: string, init: RequestInit = {}, bound?: ActiveRelay): Promise<Response> {
  const relay = bound ?? activeRelay()
  if (!relay) throw new Error('No DFNS profile is selected')
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    ...(relay.apiToken ? { 'x-lobster-token': relay.apiToken } : {}),
  }
  if (init.body && !headers['content-type']) headers['content-type'] = 'application/json'
  return fetch(`${relay.baseUrl}${path}`, { ...init, headers })
}

// polls a pending dfns signature until it confirms on chain (returns the hash) or
// is rejected. the approval is a human step in the dfns console, so the window is
// wide, but a bad token/id or a dead endpoint fails fast rather than waiting it out
// and blaming a missing approval. pass a signal to stop the loop on unmount.
export async function pollSignatureStatus(
  id: string,
  opts: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const interval = opts.intervalMs ?? 4_000
  const timeout = opts.timeoutMs ?? 30 * 60_000
  const start = Date.now()
  // bind the relay at the start so a profile switch mid-poll cannot send the id to
  // a different relay.
  const bound = activeRelay() ?? undefined
  let hardErrors = 0
  for (;;) {
    const res = await relayFetch(`/dfns/sign/${id}/status`, { signal: opts.signal }, bound)
    if (res.ok) {
      hardErrors = 0
      const body = (await res.json()) as { status?: string; txHash?: string; reason?: string }
      if (body.status === 'Confirmed') {
        if (body.txHash) return body.txHash
        throw new Error('dfns confirmed the signature but returned no tx hash')
      }
      if (body.status === 'Failed' || body.status === 'Rejected') {
        throw new Error(`dfns ${body.status}${body.reason ? `: ${body.reason}` : ''}`)
      }
    } else if (res.status >= 400 && res.status < 500) {
      throw new Error(`could not read the approval status (${res.status})`)
    } else if (++hardErrors >= 3) {
      throw new Error('the DFNS status endpoint is unreachable')
    }
    if (Date.now() - start >= timeout) throw new Error('still awaiting approval in the DFNS console')
    await new Promise((r) => setTimeout(r, interval))
  }
}

export type SignatureResult = { txHash: string } | { signedTxXdr: string }

// polls a held dfns signature to its end and returns what dfns produced: a classic
// tx confirms on chain and comes back as a hash; a soroban tx dfns signs but does
// not broadcast, so it comes back as an envelope the caller submits itself. same
// wide window and same relay binding as pollSignatureStatus, so a mid-flow profile
// switch cannot redirect the poll.
export async function pollSignatureResult(
  id: string,
  opts: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<SignatureResult> {
  const interval = opts.intervalMs ?? 4_000
  const timeout = opts.timeoutMs ?? 30 * 60_000
  const start = Date.now()
  const bound = activeRelay() ?? undefined
  let hardErrors = 0
  for (;;) {
    const res = await relayFetch(`/dfns/sign/${id}/status`, { signal: opts.signal }, bound)
    if (res.ok) {
      hardErrors = 0
      const body = (await res.json()) as {
        status?: string
        txHash?: string
        signedTxXdr?: string
        reason?: string
      }
      if (body.status === 'Confirmed') {
        if (body.txHash) return { txHash: body.txHash }
        throw new Error('dfns confirmed the signature but returned no tx hash')
      }
      // a soroban tx ends here: signed, with an envelope to submit.
      if (body.signedTxXdr) return { signedTxXdr: body.signedTxXdr }
      if (body.status === 'Failed' || body.status === 'Rejected') {
        throw new Error(`dfns ${body.status}${body.reason ? `: ${body.reason}` : ''}`)
      }
    } else if (res.status >= 400 && res.status < 500) {
      throw new Error(`could not read the approval status (${res.status})`)
    } else if (++hardErrors >= 3) {
      throw new Error('the DFNS status endpoint is unreachable')
    }
    if (Date.now() - start >= timeout) throw new Error('still awaiting approval in the DFNS console')
    await new Promise((r) => setTimeout(r, interval))
  }
}

export interface TransferOutcome {
  id: string
  status: string
  txHash: string | null
  held: boolean
}

// Asks DFNS to build and send the payment itself. That is the one request shape
// its approval rules can read, so it is the only way to show a rule letting
// something through rather than holding it. Everything the dashboard signs as
// raw XDR is held by any policy at all.
export async function requestTransfer(to: string, stroops: string): Promise<TransferOutcome> {
  const res = await relayFetch('/dfns/transfer', {
    method: 'POST',
    body: JSON.stringify({ to, stroops }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    id?: string
    status?: string
    txHash?: string | null
    held?: boolean
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `the relay refused the transfer (${res.status})`)
  return {
    id: body.id ?? '',
    status: body.status ?? 'Unknown',
    txHash: body.txHash ?? null,
    held: Boolean(body.held),
  }
}
