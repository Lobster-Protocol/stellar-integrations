import { FeeBumpTransaction, Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk'
import type { Network } from '../../src/config/contracts'
import type { ExtendSigner } from './index'

// a key that only pays storage rent. extending a ttl needs no rights on the
// contract, so the account behind it holds fee money and nothing else, and the
// key signs one thing: a storage extend paid from that account
export function keySigner(secret: string, network: Network): ExtendSigner {
  const key = Keypair.fromSecret(secret)
  const own = network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET
  return {
    sourceAddress: key.publicKey(),
    network,
    async sign(xdrBase64, passphrase) {
      if (passphrase !== own) throw new Error(`rent key is for ${network}, asked to sign for another network`)
      const tx = TransactionBuilder.fromXDR(xdrBase64, passphrase)
      if (
        tx instanceof FeeBumpTransaction ||
        tx.source !== key.publicKey() ||
        tx.operations.length !== 1 ||
        tx.operations[0].type !== 'extendFootprintTtl'
      ) {
        throw new Error('rent key only signs a storage extend from its own account')
      }
      tx.sign(key)
      return tx.toXDR()
    },
  }
}

// the mainnet loop's signer, from TTL_EXTEND_SECRET. testnet never gets one. a
// value that is not a secret key leaves the loop reporting instead of taking the
// relay down, and is never logged
export function signerFromEnv(network: Network, env: NodeJS.ProcessEnv = process.env): ExtendSigner | undefined {
  const secret = env.TTL_EXTEND_SECRET
  if (!secret || network !== 'mainnet') return undefined
  try {
    return keySigner(secret, network)
  } catch {
    console.error(`[ttl-monitor:${network}] TTL_EXTEND_SECRET is not a secret key; reporting only`)
    return undefined
  }
}
