import { TransactionBuilder, Operation, Keypair, BASE_FEE, type Transaction } from '@stellar/stellar-sdk'

import { getHorizonServer } from '../horizon/client'
import { networkPassphrase } from '../lobster/client'
import { assertAccountId } from './strkey-guards'
import type { Network } from '../lobster/types'

// Stellar-native multisig on the vault's owner account. every value action
// (vault deposit/withdraw, swap, create-vault) is a soroban invoke whose source
// account is also the require_auth address (caller == owner), so the envelope
// signatures alone authorize it. raising that account's medium threshold above
// any single signer's weight makes every such action need the client's quorum,
// with no dfns, no relay, no custodian holding a key.

export interface AccountSigner {
  key: string
  weight: number
}

export interface AccountSigning {
  accountId: string
  // weight of the account's own master key
  masterWeight: number
  // every ed25519 signer, the master key included
  signers: AccountSigner[]
  thresholds: { low: number; med: number; high: number }
  // hashX / preAuthTx signers, which the quorum math cannot weigh. one of these
  // at a high weight would clear a threshold on its own, so enrollment refuses an
  // account that carries any.
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
// invokeHostFunction and payment are medium-threshold ops, which is why the vault
// actions gate on med.
export function requiredWeight(a: AccountSigning, tier: Tier = 'med'): number {
  const t = a.thresholds[tier]
  return t > 0 ? t : 1
}

// multisig when no single signer can meet the medium threshold on its own, so a
// value action needs more than one signature.
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

// which of the account's signers have actually signed this envelope. a decorated
// signature only carries a 4-byte hint, so match by hint then verify against the
// tx hash, which is what rules out a forged or stale signature counting toward
// the quorum.
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

export function hasEnoughWeight(xdr: string, network: Network, a: AccountSigning, tier: Tier = 'med'): boolean {
  return accumulatedWeight(xdr, network, a) >= requiredWeight(a, tier)
}

// merges a co-signer's signature into the canonical envelope. some wallets return
// a fresh envelope that drops the signatures already on it, so instead of trusting
// the returned xdr wholesale, take only the new signatures that verify against a
// known signer for this account and add them to the base. that keeps co-signing
// wallet-agnostic: base is always the one envelope everyone signs, and a foreign
// or stale signature can never ride in. base and signed must be the same tx (same
// hash), or the incoming signatures fail to verify and are skipped.
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
  // co-signers to add, each with its weight. one is a 2-of-2, two is a 2-of-3.
  // in a 2-of-3 a lost key still leaves a quorum that can move funds (including
  // sweeping to a fresh account); rotating the signer set in place needs the full
  // weight, so a lost key cannot be replaced without rebuilding elsewhere.
  addSigners?: Array<{ key: string; weight: number }>
  masterWeight?: number
  // sets low, med and high to the same quorum weight
  threshold?: number
}

// builds the classic set_options tx that reshapes the account's signers and
// thresholds. set_options is a high-threshold op, so this must be signed under
// the OLD thresholds: run it while the account is still single-sig to lock in the
// quorum, and the next value action already needs the new threshold. a single op
// can add only one signer, so add each in its own op and fold the master weight
// and thresholds into the last one, keeping the whole change in one atomic tx.
// returns the unsigned xdr for the client to sign.
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
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase(network),
  })
  // the full signing weight after this change. governance ops (set_options,
  // account_merge are HIGH threshold) must need more than a routine spend, so the
  // high threshold is the full weight, not the spend threshold. for a 2-of-2
  // there is only weight 2 to give so high == med is unavoidable there, one more
  // reason to prefer a 2-of-3.
  const totalWeight = (setup.masterWeight ?? 1) + (setup.addSigners ?? []).reduce((n, s) => n + s.weight, 0)
  // a threshold above the total weight can never be met, which locks the account
  // out of every op at that tier. refuse it rather than build a brick.
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
  return builder.setTimeout(300).build().toXDR()
}

// classic (non-soroban) submit for the set_options tx. the vault co-sign path
// submits through the soroban rpc helpers instead, the same ones the one-shot
// path already uses.
export async function submitClassic(network: Network, xdr: string): Promise<string> {
  const server = getHorizonServer(network)
  const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase(network))
  const res = await server.submitTransaction(tx)
  return res.hash
}
