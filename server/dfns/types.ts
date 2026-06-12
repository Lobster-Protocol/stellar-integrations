import { z } from 'zod'

// the 21 dfns webhook event kinds we may receive for a stellar wallet.
// docs-legacy.dfns.co/d/api-docs/webhooks/webhook-events
export const DfnsEventKindSchema = z.enum([
  'wallet.created',
  'wallet.exported',
  'wallet.delegated',
  'wallet.blockchainevent.detected',
  'wallet.signature.requested',
  'wallet.signature.signed',
  'wallet.signature.failed',
  'wallet.signature.rejected',
  'wallet.transaction.requested',
  'wallet.transaction.broadcasted',
  'wallet.transaction.confirmed',
  'wallet.transaction.failed',
  'wallet.transaction.rejected',
  'wallet.transfer.requested',
  'wallet.transfer.broadcasted',
  'wallet.transfer.confirmed',
  'wallet.transfer.failed',
  'wallet.transfer.rejected',
  'policy.triggered',
  'policy.approval.pending',
  'policy.approval.resolved',
])
export type DfnsEventKind = z.infer<typeof DfnsEventKindSchema>

export const DfnsWebhookEventSchema = z.object({
  id: z.string(),
  kind: DfnsEventKindSchema,
  // unix seconds, used for replay protection (5 minute tolerance)
  timestampSent: z.number(),
  date: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  deliveryAttempt: z.number().optional(),
  retryOf: z.string().optional(),
  nextAttemptDate: z.string().optional(),
})
export type DfnsWebhookEvent = z.infer<typeof DfnsWebhookEventSchema>

export const DfnsStellarNetworkSchema = z.enum(['Stellar', 'StellarTestnet'])
export type DfnsStellarNetwork = z.infer<typeof DfnsStellarNetworkSchema>

// transaction signing response. signedData is the hex-encoded fully
// signed envelope, ready to submit to horizon or soroban-rpc.
export const DfnsSignatureSchema = z.object({
  id: z.string(),
  status: z.enum([
    'Pending',
    'Executing',
    'Signed',
    'Broadcasted',
    'Confirmed',
    'Failed',
    'Rejected',
  ]),
  signedData: z.string().optional(),
})
export type DfnsSignatureResponse = z.infer<typeof DfnsSignatureSchema>
