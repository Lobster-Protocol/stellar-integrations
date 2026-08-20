import type { Signer, SignOpts } from './types'

// the hono service runs the mpc round and answers with the signed envelope
export const dfnsSigner: Signer = {
  name: 'dfns',
  async signTransaction(xdr: string, opts: SignOpts) {
    const base = import.meta.env.VITE_LOBSTER_API_URL
    if (!base) throw new Error('VITE_LOBSTER_API_URL not set; cannot reach dfns signer')
    const token = import.meta.env.VITE_LOBSTER_API_TOKEN
    const res = await fetch(`${base}/dfns/sign`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(token ? { 'x-lobster-token': token } : {}),
      },
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
