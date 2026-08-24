import { relayFetch } from '../dfns/relay'
import type { Signer, SignOpts } from './types'

export const dfnsSigner: Signer = {
  name: 'dfns',
  async signTransaction(xdr: string, opts: SignOpts) {
    const res = await relayFetch('/dfns/sign', {
      method: 'POST',
      body: JSON.stringify({ xdr, networkPassphrase: opts.networkPassphrase }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`dfns sign ${res.status}: ${detail}`)
    }
    const body = (await res.json()) as {
      signedTxXdr?: string
      txHash?: string
      error?: string
    }
    // classic tx: the relay reports the hash dfns already broadcast.
    if (body.txHash) return { broadcastHash: body.txHash }
    // soroban tx: the relay hands back the signed envelope to submit.
    if (body.signedTxXdr) return { signedTxXdr: body.signedTxXdr }
    throw new Error(body.error ?? 'dfns sign returned neither a hash nor an envelope')
  },
}
