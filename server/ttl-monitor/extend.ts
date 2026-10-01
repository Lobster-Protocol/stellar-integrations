import {
  TransactionBuilder,
  Operation,
  SorobanDataBuilder,
  xdr,
} from '@stellar/stellar-sdk'
import type { Transaction, Account } from '@stellar/stellar-sdk'
import { INCLUSION_FEE_STROOPS } from '../../src/config/contracts'
import { MAX_ENTRY_TTL } from './ledger'

export function clampExtendTo(target: number): number {
  return Math.min(Math.max(0, Math.floor(target)), MAX_ENTRY_TTL)
}

// the fee set here is only the inclusion bid, the same ceiling the app's own
// transactions use since the base fee timed out on mainnet. rent blows up near
// the cap, so it comes from assembleTransaction after simulation, never a guess.
export function buildExtendTtlTx(
  account: Account,
  key: xdr.LedgerKey,
  extendTo: number,
  networkPassphrase: string,
): Transaction {
  const sorobanData = new SorobanDataBuilder().setReadOnly([key]).build()
  return new TransactionBuilder(account, { fee: INCLUSION_FEE_STROOPS, networkPassphrase })
    .setSorobanData(sorobanData)
    .addOperation(Operation.extendFootprintTtl({ extendTo: clampExtendTo(extendTo) }))
    .setTimeout(30)
    .build()
}
