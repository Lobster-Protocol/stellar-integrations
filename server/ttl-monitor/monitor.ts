import type { xdr } from '@stellar/stellar-sdk'
import { chunk, readTtl, type TtlReading } from './ledger'

// the slice of rpc.Server the scan needs. kept narrow so a fake fills it in a
// test without standing up a real client.
export interface LedgerEntriesReader {
  getLedgerEntries(
    ...keys: xdr.LedgerKey[]
  ): Promise<{
    entries: Array<{ key: xdr.LedgerKey; liveUntilLedgerSeq?: number }>
    latestLedger: number
  }>
}

// poll every key in <=200-key batches and read its runway against the latest
// ledger reported in the same batch. a key the rpc omits is archived, so it
// lands as a status rather than vanishing from the report.
export async function scanTtl(
  keys: xdr.LedgerKey[],
  reader: LedgerEntriesReader,
): Promise<ScanResult> {
  const statuses: KeyStatus[] = []
  let latestLedger = 0

  for (const batch of chunk(keys, 200)) {
    const res = await reader.getLedgerEntries(...batch)
    latestLedger = res.latestLedger
    const byKey = new Map<string, number | undefined>()
    for (const e of res.entries) {
      byKey.set(e.key.toXDR('base64'), e.liveUntilLedgerSeq)
    }
    for (const key of batch) {
      const b64 = key.toXDR('base64')
      // absent from the response, or present with no liveUntilLedgerSeq, both
      // read as archived in readTtl
      const live = byKey.get(b64)
      statuses.push({ keyXdr: b64, reading: readTtl(live, res.latestLedger) })
    }
  }

  return { latestLedger, statuses }
}

export function keysNeedingExtend(statuses: KeyStatus[]): KeyStatus[] {
  return statuses.filter((s) => s.reading.level === 'crit')
}

export interface KeyStatus {
  keyXdr: string
  reading: TtlReading
  // set by scanNetwork so a dashboard legend reads "instance"/"code" instead of
  // 200 characters of base64 ledger key. absent in the bare scanTtl path.
  kind?: string
}

export interface ScanResult {
  latestLedger: number
  statuses: KeyStatus[]
}
