import { listPendingApprovals } from './approvals'
import { approverConfigured, getApproverClient } from './approver'

// refused on mainnet whatever the flag says: auto-approving there would defeat the
// custody hold. dfns names mainnet 'Stellar', anything else is testnet.
export function autoApproveArmed(): boolean {
  if (process.env.DFNS_AUTO_APPROVE_TESTNET !== '1') return false
  if (process.env.DFNS_STELLAR_NETWORK === 'Stellar') return false
  return approverConfigured()
}

type SignActivity = { kind?: string; transactionRequest?: { id?: string; walletId?: string } }

// only the request the relay just sent went through the sign guard. anything else
// held on the wallet, a transfer started from the console say, waits for a human.
export function isOwnHeldRequest(activity: unknown, walletId: string, transactionId: string): boolean {
  if (!walletId || !transactionId) return false
  const a = activity as SignActivity | null | undefined
  const tr = a?.transactionRequest
  return a?.kind === 'Wallets:Sign' && tr?.walletId === walletId && tr?.id === transactionId
}

type PendingApproval = { id: string; status?: string; activity?: unknown }

// lists with the service account but votes as the approver User, the only identity
// allowed to vote without the staff flag. the caller keeps this off the throwing
// path, so a failed vote leaves the tx pending for a human.
export async function autoApproveHeldForWallet(walletId: string, transactionId: string): Promise<number> {
  if (!autoApproveArmed()) return 0
  const res = await listPendingApprovals()
  const items = (res.items ?? []) as PendingApproval[]
  const dfns = getApproverClient()
  let approved = 0
  for (const ap of items) {
    if (ap.status && ap.status !== 'Pending') continue
    if (!isOwnHeldRequest(ap.activity, walletId, transactionId)) continue
    await dfns.policies.createApprovalDecision({
      approvalId: ap.id,
      body: { value: 'Approved', reason: 'auto-approved by the Lobster testnet demo relay' },
    })
    approved++
  }
  return approved
}
