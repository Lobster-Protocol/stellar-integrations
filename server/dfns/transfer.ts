import { getDfnsClient } from './client'
import { SignGuardRejected, type SignGuardConfig } from './sign-guard'

// DFNS reads an approval policy against a transfer request, where it builds the
// payment itself and knows the recipient and the asset. Against a raw signing
// request it reads nothing: ask it for an amount and it answers "only supported
// on a transfer request", ask it for a recipient and it answers "recipient
// address not specified". So every signature going through /dfns/sign is held by
// any policy at all, and this route is the only one where a rule can let
// something through. It is what makes the auto-approve side of the policy
// visible instead of theoretical.

export interface TransferRequest {
  to: string
  stroops: string
}

export function checkTransfer(req: TransferRequest, cfg: SignGuardConfig): bigint {
  if (!cfg.destinationWhitelist.includes(req.to)) {
    throw new SignGuardRejected(`transfer destination ${req.to} not in whitelist`)
  }
  let amount: bigint
  // BigInt('') is 0n rather than a throw, so an empty amount would land in the
  // positive check and get a misleading message. Pin the shape first.
  if (!/^-?\d+$/.test(req.stroops)) {
    throw new SignGuardRejected('transfer amount must be a whole number of stroops')
  }
  try {
    amount = BigInt(req.stroops)
  } catch {
    throw new SignGuardRejected('transfer amount must be a whole number of stroops')
  }
  if (amount <= 0n) {
    throw new SignGuardRejected('transfer amount must be positive')
  }
  if (cfg.maxAmountStroops > 0n && amount > cfg.maxAmountStroops) {
    throw new SignGuardRejected(`transfer amount ${req.stroops} exceeds cap`)
  }
  return amount
}

export async function transferNative(walletId: string, req: TransferRequest, cfg: SignGuardConfig) {
  checkTransfer(req, cfg)
  const dfns = getDfnsClient()
  return dfns.wallets.transferAsset({
    walletId,
    body: { kind: 'Native', to: req.to, amount: req.stroops },
  })
}
