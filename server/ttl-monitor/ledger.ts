// pure ttl math, no sdk.

const LEDGER_SECONDS = 5
// protocol ceiling for a single extend on mainnet. an extend past this is
// clamped, not rejected.
export const MAX_ENTRY_TTL = 3_110_400

// alert bands in ledgers, derived from wall-clock so the intent stays readable
export const WARN_LEDGERS = (48 * 3600) / LEDGER_SECONDS // ~34560, two days out
export const CRIT_LEDGERS = (24 * 3600) / LEDGER_SECONDS // ~17280, one day out

// where an auto-extend puts the runway back. a month keeps the daemon quiet
// without going anywhere near the rent blow-up at max_entry_ttl.
export const EXTEND_TARGET_LEDGERS = (30 * 24 * 3600) / LEDGER_SECONDS // 518400

type TtlLevel = 'ok' | 'warn' | 'crit' | 'archived'

export interface TtlReading {
  remainingLedgers: number
  remainingSeconds: number
  level: TtlLevel
}

export function readTtl(
  liveUntilLedgerSeq: number | undefined,
  latestLedger: number,
): TtlReading {
  // an entry the rpc does not return is archived or never existed; either way
  // it carries no runway.
  if (liveUntilLedgerSeq === undefined) {
    return { remainingLedgers: 0, remainingSeconds: 0, level: 'archived' }
  }
  // latestLedger has to come from the same rpc response; a cached one reads a
  // dead entry as live.
  const remainingLedgers = liveUntilLedgerSeq - latestLedger
  const remainingSeconds = remainingLedgers * LEDGER_SECONDS
  let level: TtlLevel = 'ok'
  if (remainingLedgers <= 0) level = 'archived'
  else if (remainingLedgers <= CRIT_LEDGERS) level = 'crit'
  else if (remainingLedgers <= WARN_LEDGERS) level = 'warn'
  return { remainingLedgers, remainingSeconds, level }
}

// getLedgerEntries takes at most 200 keys per request.
export function chunk<T>(items: T[], size = 200): T[][] {
  if (size < 1) throw new Error('chunk size must be positive')
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
