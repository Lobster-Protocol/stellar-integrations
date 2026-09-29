// iso 24165 dti codes for the mica export. empty until the codes are registered,
// so a lookup returns null and the export reports UNKNOWN rather than a wrong code.

export interface DtiKey {
  asset?: string
  issuer?: string
  contractId?: string
}

const TABLE: Array<{ key: DtiKey; dti: string }> = [
  // real 9-char codes go here once obtained; key by asset, issuer, or contractId.
]

export function lookupDti(key: DtiKey): string | null {
  const hit = TABLE.find(
    (row) =>
      (row.key.asset ?? '') === (key.asset ?? '') &&
      (row.key.issuer ?? '') === (key.issuer ?? '') &&
      (row.key.contractId ?? '') === (key.contractId ?? ''),
  )
  return hit?.dti ?? null
}
