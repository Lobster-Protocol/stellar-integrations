import { activeRelay } from './profiles'

// holding a token is what reveals the write controls. the relay is the real
// boundary, so a forged one only shows buttons whose requests come back 401.
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
