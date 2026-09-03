// Custody writes (create a wallet, approve or deny a held signature) are not
// for whoever happens to open the dashboard. The relay wants
// LOBSTER_OPERATOR_TOKEN in an x-lobster-operator-token header, and that value
// is deliberately absent from the bundle, so an operator puts their own copy in
// this browser under the key below:
//
//   localStorage.setItem('lob_operator_token', '<LOBSTER_OPERATOR_TOKEN>')
//
// Holding the key is what reveals the write controls. Everyone else reads the
// same panels without them. The browser copy is not the security boundary, the
// relay is: a forged flag only reveals buttons whose requests come back 401.
const KEY = 'lob_operator_token'

const HEADER = 'x-lobster-operator-token'

export function operatorToken(): string | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw && raw.trim() ? raw.trim() : null
  } catch {
    // storage switched off, or a value another tool wrote
    return null
  }
}

export function isOperator(): boolean {
  return operatorToken() !== null
}

export function operatorHeaders(): Record<string, string> {
  const token = operatorToken()
  return token ? { [HEADER]: token } : {}
}
