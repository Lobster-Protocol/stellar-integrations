import { TransactionBuilder, Operation, Keypair, type Transaction } from '@stellar/stellar-sdk'

import { getHorizonServer } from '../horizon/client'
import { networkPassphrase } from '../lobster/client'
import { assertAccountId } from './strkey-guards'
import type { Network } from '../lobster/types'
import { INCLUSION_FEE_STROOPS } from '../../config/contracts'

export interface AccountSigner {
  key: string
  weight: number
}

export interface AccountSigning {
  accountId: string
  masterWeight: number
  // every ed25519 signer, the master key included
  signers: AccountSigner[]
  thresholds: { low: number; med: number; high: number }
  // hashX / preAuthTx signers, which the quorum math cannot weigh
  otherSigners?: number
}

type Tier = 'low' | 'med' | 'high'

export async function readAccountSigning(network: Network, accountId: string): Promise<AccountSigning> {
  const account = await getHorizonServer(network).loadAccount(accountId)
  const signers: AccountSigner[] = account.signers
    .filter((s) => s.type === 'ed25519_public_key' && typeof s.key === 'string')
    .map((s) => ({ key: s.key, weight: s.weight }))
  const otherSigners = account.signers.filter((s) => s.type !== 'ed25519_public_key').length
  const master = signers.find((s) => s.key === accountId)
  return {
    accountId,
    masterWeight: master?.weight ?? 0,
    signers,
    thresholds: {
      low: account.thresholds.low_threshold,
      med: account.thresholds.med_threshold,
      high: account.thresholds.high_threshold,
    },
    otherSigners,
  }
}

// a threshold of 0 means one signer of any weight clears the op, so read it as 1.
// invokeHostFunction and payment are medium-threshold ops, hence the med default.
export function requiredWeight(a: AccountSigning, tier: Tier = 'med'): number {
  const t = a.thresholds[tier]
  return t > 0 ? t : 1
}

export function isMultisig(a: AccountSigning): boolean {
  const need = requiredWeight(a, 'med')
  const strongest = a.signers.reduce((m, s) => Math.max(m, s.weight), 0)
  return strongest < need
}

function asTx(xdr: string, network: Network): Transaction {
  const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase(network))
  if ('innerTransaction' in tx) {
    throw new Error('multisig signing operates on the transaction itself, not a fee bump')
  }
  return tx
}

// a decorated signature only carries a 4-byte hint, so verify it against the tx
// hash too, or a forged or stale signature would count toward the quorum.
export function signedBy(xdr: string, network: Network, a: AccountSigning): string[] {
  const tx = asTx(xdr, network)
  const hash = tx.hash()
  const out: string[] = []
  for (const signer of a.signers) {
    const kp = Keypair.fromPublicKey(signer.key)
    const hint = kp.signatureHint()
    const signed = tx.signatures.some((ds) => {
      if (!ds.hint().equals(hint)) return false
      try {
        return kp.verify(hash, ds.signature())
      } catch {
        return false
      }
    })
    if (signed) out.push(signer.key)
  }
  return out
}

export function accumulatedWeight(xdr: string, network: Network, a: AccountSigning): number {
  const keys = new Set(signedBy(xdr, network, a))
  return a.signers.filter((s) => keys.has(s.key)).reduce((sum, s) => sum + s.weight, 0)
}

// some wallets return a fresh envelope without the signatures already on it, so
// only copy over new ones that verify against a known signer of this account.
export function combine(baseXdr: string, signedXdr: string, network: Network, a: AccountSigning): string {
  const base = asTx(baseXdr, network)
  const signed = asTx(signedXdr, network)
  const hash = base.hash()
  const present = new Set(base.signatures.map((s) => s.toXDR().toString('base64')))
  for (const ds of signed.signatures) {
    const key = ds.toXDR().toString('base64')
    if (present.has(key)) continue
    const known = a.signers.some((signer) => {
      const kp = Keypair.fromPublicKey(signer.key)
      if (!ds.hint().equals(kp.signatureHint())) return false
      try {
        return kp.verify(hash, ds.signature())
      } catch {
        return false
      }
    })
    if (known) {
      base.addDecoratedSignature(ds)
      present.add(key)
    }
  }
  return base.toXDR()
}

export interface MultisigSetup {
  addSigners?: Array<{ key: string; weight: number }>
  masterWeight?: number
  threshold?: number
}

// a set_options op adds one signer, so each gets its own op and the weights and
// thresholds ride on the last one, all in a single atomic tx.
export async function buildSetOptionsTx(
  network: Network,
  accountId: string,
  setup: MultisigSetup,
): Promise<string> {
  // the ui validates these, but this builds a signing request for real money, so
  // do not trust the caller: a malformed key here would build a bricking change.
  assertAccountId(accountId)
  for (const s of setup.addSigners ?? []) assertAccountId(s.key)
  const server = getHorizonServer(network)
  const account = await server.loadAccount(accountId)
  const builder = new TransactionBuilder(account, {
    fee: INCLUSION_FEE_STROOPS,
    networkPassphrase: networkPassphrase(network),
  })
  // governance ops (set_options, account_merge) must need more than a spend, so
  // the high threshold is the full weight, not the spend quorum.
  const totalWeight = (setup.masterWeight ?? 1) + (setup.addSigners ?? []).reduce((n, s) => n + s.weight, 0)
  // a threshold above the total weight can never be met, which locks the account
  // out of every op at that tier.
  if (setup.threshold !== undefined && setup.threshold > totalWeight) {
    throw new Error(
      `a quorum of ${setup.threshold} needs more signing weight than the ${totalWeight} this account would have`,
    )
  }
  const applyWeights = (opts: Parameters<typeof Operation.setOptions>[0]) => {
    if (setup.masterWeight !== undefined) opts.masterWeight = setup.masterWeight
    if (setup.threshold !== undefined) {
      opts.lowThreshold = setup.threshold
      opts.medThreshold = setup.threshold
      opts.highThreshold = Math.max(setup.threshold, totalWeight)
    }
  }
  const signers = setup.addSigners ?? []
  if (signers.length === 0) {
    const opts: Parameters<typeof Operation.setOptions>[0] = {}
    applyWeights(opts)
    builder.addOperation(Operation.setOptions(opts))
  } else {
    signers.forEach((s, i) => {
      const opts: Parameters<typeof Operation.setOptions>[0] = {
        signer: { ed25519PublicKey: s.key, weight: s.weight },
      }
      if (i === signers.length - 1) applyWeights(opts)
      builder.addOperation(Operation.setOptions(opts))
    })
  }
  // an hour: turning shared control off waits on another person's signature, and
  // a tight window kept expiring mid-revert.
  return builder.setTimeout(3600).build().toXDR()
}

export async function submitClassic(network: Network, xdr: string): Promise<string> {
  const server = getHorizonServer(network)
  const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase(network))
  const res = await server.submitTransaction(tx)
  return res.hash
}
