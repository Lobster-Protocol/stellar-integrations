import { createHash } from 'node:crypto'
import { z } from 'zod'

// extended mica record per cdr 2025/1140 table 3 with the dfns / decision /
// execution blocks added, plus recordHash + prevHash chaining so a reviewer
// can detect tampered or reordered records by recomputing the chain. when the
// official esma message specs zip is out, swap this schema for the
// json-schema-to-typescript output and keep the same chain logic.

export const McaSideSchema = z.enum(['buy', 'sell'])

export const McaDfnsBlockSchema = z.object({
  walletId: z.string().optional(),
  signatureId: z.string().optional(),
  status: z.string().optional(),
})

export const McaDecisionBlockSchema = z.object({
  policyId: z.string().optional(),
  approvalId: z.string().optional(),
  value: z.enum(['AutoApproved', 'Approved', 'Denied']).optional(),
  approvers: z.array(z.string()).optional(),
  resolvedAt: z.string().optional(),
})

export const McaExecutionBlockSchema = z.object({
  ledgerSequence: z.number().optional(),
  txHash: z.string().optional(),
  feePaidStroops: z.string().optional(),
  submittedAt: z.string().optional(),
})

export const McaRecordSchema = z.object({
  // chain header: every record carries the sha256 of its canonical body
  // plus the previous record's hash. the first record in a batch sets
  // prevRecordHash to null.
  recordHash: z.string(),
  prevRecordHash: z.string().nullable(),

  transactionReference: z.string(),
  executingEntityLei: z.string(),
  tradingDateTimeUtc: z.string(),
  buyerIdentifier: z.string(),
  sellerIdentifier: z.string(),
  instrumentDti: z.string(),
  quantity: z.string(),
  price: z.string().optional(),
  tradingVenueId: z.string(),
  transactionType: z.enum([
    'payment',
    'path_payment_strict_send',
    'path_payment_strict_receive',
    'manage_sell_offer',
    'manage_buy_offer',
    'invoke_host_function',
  ]),

  side: McaSideSchema.optional(),
  dfns: McaDfnsBlockSchema.optional(),
  decision: McaDecisionBlockSchema.optional(),
  execution: McaExecutionBlockSchema.optional(),
})
export type McaRecord = z.infer<typeof McaRecordSchema>
export type McaSide = z.infer<typeof McaSideSchema>

export interface StellarTxSnapshot {
  hash: string
  ledgerCloseTime: string
  ledgerSequence?: number
  feePaidStroops?: string
  sourceAccount: string
  operations: Array<{
    type: McaRecord['transactionType']
    sourceAccount?: string
    destination?: string
    assetCode?: string
    assetIssuer?: string
    contractId?: string
    amount?: string
    price?: string
    side?: McaSide
  }>
  // optional dfns + decision blocks attached at the tx level
  dfns?: z.infer<typeof McaDfnsBlockSchema>
  decision?: z.infer<typeof McaDecisionBlockSchema>
}

export interface ExportContext {
  caspLei: string
  resolveDti: (asset: { code?: string; issuer?: string; contractId?: string }) => string | null
  resolveVenue: (contractId: string | undefined) => string
}

// sort keys at every level. a top-level key array passed as the stringify
// replacer filters nested keys too, so the dfns/decision/execution blocks
// would serialize as {} and drop out of the hash - tampering inside them
// would go undetected. recurse instead.
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical)
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const k of Object.keys(o).sort()) sorted[k] = canonical(o[k])
    return sorted
  }
  return v
}

// canonical json, sha256 hex. recordHash is excluded from the body it signs
// (a hash can't depend on itself).
function hashBody(record: Omit<McaRecord, 'recordHash'>): string {
  return createHash('sha256').update(JSON.stringify(canonical(record))).digest('hex')
}

// startPrevHash threads the chain across transactions: an export concatenates
// the records of many txs, and verifyChain walks the whole array, so the first
// record of tx N+1 must carry the last hash of tx N (not null) or the verifier
// reads a break at every tx boundary. defaults to null for a standalone tx.
export function buildMcaRecords(
  tx: StellarTxSnapshot,
  ctx: ExportContext,
  startPrevHash: string | null = null,
): McaRecord[] {
  const out: McaRecord[] = []
  let prevHash: string | null = startPrevHash
  for (const op of tx.operations) {
    const body: Omit<McaRecord, 'recordHash'> = {
      prevRecordHash: prevHash,
      transactionReference: tx.hash,
      executingEntityLei: ctx.caspLei,
      tradingDateTimeUtc: tx.ledgerCloseTime,
      buyerIdentifier: op.destination ?? op.sourceAccount ?? tx.sourceAccount,
      sellerIdentifier: op.sourceAccount ?? tx.sourceAccount,
      instrumentDti:
        ctx.resolveDti({ code: op.assetCode, issuer: op.assetIssuer, contractId: op.contractId }) ??
        'UNKNOWN',
      quantity: op.amount ?? '0',
      price: op.price,
      tradingVenueId: ctx.resolveVenue(op.contractId),
      transactionType: op.type,
      side: op.side,
      dfns: tx.dfns,
      decision: tx.decision,
      execution: {
        ledgerSequence: tx.ledgerSequence,
        txHash: tx.hash,
        feePaidStroops: tx.feePaidStroops,
      },
    }
    const recordHash = hashBody(body)
    out.push({ ...body, recordHash })
    prevHash = recordHash
  }
  return out
}

export function toEsmaJson(records: McaRecord[]): string {
  return JSON.stringify({ records }, null, 2)
}

// reviewer / auditor side: walk the chain and confirm every record's body
// hashes to its recordHash and that prevRecordHash matches the previous
// record. returns the index of the first broken record or -1 when valid.
export function verifyChain(records: McaRecord[]): number {
  let prev: string | null = null
  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    const { recordHash: claimed, ...body } = r
    if (body.prevRecordHash !== prev) return i
    const computed = hashBody(body)
    if (computed !== claimed) return i
    prev = claimed
  }
  return -1
}
