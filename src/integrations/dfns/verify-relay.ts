import { assertRelayUrl } from './profiles'

// verifies a relay the operator has not saved yet: reach its /health, then read
// its wallets with the read token. a raw fetch to the typed url, since there is no
// active profile to resolve through relayFetch yet. returns the wallet count so the
// caller can confirm the read token works before saving.
export async function verifyRelay(url: string, readToken: string): Promise<number> {
  assertRelayUrl(url, 'client')
  let health: Response
  try {
    health = await fetch(`${url}/health`)
  } catch {
    throw new Error(
      'The browser could not reach that relay. It has to be running, served over https, and set DASHBOARD_ORIGIN to this dashboard so the browser is allowed to call it.',
    )
  }
  if (!health.ok) throw new Error(`The relay answered ${health.status} for /health.`)
  const w = await fetch(`${url}/dfns/wallets`, {
    headers: readToken ? { 'x-lobster-token': readToken } : undefined,
  })
  if (w.status === 401) throw new Error('The relay answered but turned down the read. Check the read token.')
  if (!w.ok) throw new Error(`The relay answered ${w.status} for the wallet read.`)
  const body = (await w.json().catch(() => ({}))) as { items?: unknown[] }
  return body.items?.length ?? 0
}
