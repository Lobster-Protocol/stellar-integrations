import { activeRelay } from './profiles'

// Custody writes (create a wallet, approve or deny a held signature) are not for
// whoever happens to open the dashboard. The relay wants LOBSTER_OPERATOR_TOKEN in
// an x-lobster-operator-token header. That token belongs to the ACTIVE dfns profile
// and is resolved per profile: the demo's from the pre-existing browser key, a
// client's from sessionStorage (gone when the tab closes, never on disk). Holding
// the token is what reveals the write controls; the relay is the real boundary, so
// a forged flag only reveals buttons whose requests come back 401.
const HEADER = 'x-lobster-operator-token'

export function operatorToken(): string | null {
  return activeRelay()?.operatorToken ?? null
}

export function isOperator(): boolean {
  return operatorToken() !== null
}

export function operatorHeaders(): Record<string, string> {
  const token = operatorToken()
  return token ? { [HEADER]: token } : {}
}
