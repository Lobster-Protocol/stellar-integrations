// digital token identifier (iso 24165) codes. registration is free for
// regulatory reporting at registry.dtif.org. email secretariat@dtif.org
// once for api credentials, then look up the codes via the registry ui
// and paste them in here. until then mica-export falls back to 'UNKNOWN'.

export interface DtiKey {
  asset?: string
  issuer?: string
  contractId?: string
}

const TABLE: Array<{ key: DtiKey; dti: string }> = [
  // register the real 9-char alphanumeric codes here once obtained. key by
  // asset, by issuer for classic assets, or by contractId for soroban tokens.
  // empty until then so the export does not lie to legal.
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
