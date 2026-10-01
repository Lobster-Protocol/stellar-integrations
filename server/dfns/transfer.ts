import { getDfnsClient } from './client'
import { SignGuardRejected, type SignGuardConfig } from './sign-guard'

// DFNS evaluates amount and recipient rules only on a transfer request, where it
// builds the payment itself. on a raw signing request an amount rule answers "only
// supported on a transfer request" and a recipient rule "recipient address not
// specified", so every /dfns/sign signature is held by any policy, and this is the
// only request whose amount and recipient a rule can read.

export interface TransferRequest {
  to: string
  stroops: string
}

export function checkTransfer(req: TransferRequest, cfg: SignGuardConfig): bigint {
  if (!cfg.destinationWhitelist.includes(req.to)) {
    throw new SignGuardRejected(`transfer destination ${req.to} not in whitelist`)
  }
  // an empty string turns into 0n here instead of throwing, so it would fall to
  // the positive check and get told the amount was zero. check the shape first.
  if (!/^-?\d+$/.test(req.stroops)) {
    throw new SignGuardRejected('transfer amount must be a whole number of stroops')
  }
  const amount = BigInt(req.stroops)
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
