// hand-kept copy of the relay event kinds, the server tsconfig is not
// reachable from the app graph

import { z } from 'zod'

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

export interface DfnsEvent {
  id: string
  kind: DfnsEventKind
  timestampSent: number
  date?: string
  data?: Record<string, unknown>
}
