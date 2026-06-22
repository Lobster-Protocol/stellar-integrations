import {
  TransactionBuilder,
  Operation,
  SorobanDataBuilder,
  BASE_FEE,
  xdr,
} from '@stellar/stellar-sdk'
import type { Transaction, Account } from '@stellar/stellar-sdk'
import { MAX_ENTRY_TTL } from './ledger'

export function clampExtendTo(target: number): number {
  return Math.min(Math.max(0, Math.floor(target)), MAX_ENTRY_TTL)
}

// fee stays at base on purpose: rent scales with entry size times duration and
// blows up near the cap, so the real fee comes out of assembleTransaction
// after simulation, never a guess up front.
export function buildExtendTtlTx(
  account: Account,
  key: xdr.LedgerKey,
  extendTo: number,
  networkPassphrase: string,
): Transaction {
  const sorobanData = new SorobanDataBuilder().setReadOnly([key]).build()
  return new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
    .setSorobanData(sorobanData)
    .addOperation(Operation.extendFootprintTtl({ extendTo: clampExtendTo(extendTo) }))
    .setTimeout(30)
    .build()
}
