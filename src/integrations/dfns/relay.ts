// one place for the bff relay convention: base url from env, the shared auth
// header, the cookie credentials, json content-type when there is a body.
export function relayFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = import.meta.env.VITE_LOBSTER_API_URL
  if (!base) throw new Error('VITE_LOBSTER_API_URL not set')
  const token = import.meta.env.VITE_LOBSTER_API_TOKEN
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    ...(token ? { 'x-lobster-token': token } : {}),
  }
  if (init.body && !headers['content-type']) headers['content-type'] = 'application/json'
  return fetch(`${base}${path}`, { credentials: 'include', ...init, headers })
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
  let hardErrors = 0
  for (;;) {
    const res = await relayFetch(`/dfns/sign/${id}/status`, { signal: opts.signal })
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
