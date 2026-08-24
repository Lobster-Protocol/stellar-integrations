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
