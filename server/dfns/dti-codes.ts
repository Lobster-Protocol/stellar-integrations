// digital token identifier (iso 24165) codes for the mica export. empty until the
// codes are registered, so lookups return null and the export reports UNKNOWN
// rather than a wrong code.

export interface DtiKey {
  asset?: string
  issuer?: string
  contractId?: string
}

const TABLE: Array<{ key: DtiKey; dti: string }> = [
  // real 9-char codes go here once obtained; key by asset, issuer, or contractId.
]

function keysMatch(a: DtiKey, b: DtiKey): boolean {
  if ((a.asset ?? '') !== (b.asset ?? '')) return false
  if ((a.issuer ?? '') !== (b.issuer ?? '')) return false
  if ((a.contractId ?? '') !== (b.contractId ?? '')) return false
  return true
}

export function lookupDti(key: DtiKey): string | null {
  const hit = TABLE.find((row) => keysMatch(row.key, key))
  return hit?.dti ?? null
}
