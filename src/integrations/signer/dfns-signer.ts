import { relayFetch } from '../dfns/relay'
import type { Signer, SignOpts } from './types'

export const dfnsSigner: Signer = {
  name: 'dfns',
  async signTransaction(xdr: string, opts: SignOpts) {
    // the relay answers this quickly: a pending id (held for approval, polled
    // elsewhere) or the signed envelope. it does not wait out the human approval,
    // so a long silence means the relay itself is stuck. give up after a minute
    // rather than leave the caller on "Awaiting signature" forever.
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 60_000)
    let res: Response
    try {
      res = await relayFetch('/dfns/sign', {
        method: 'POST',
        body: JSON.stringify({ xdr, networkPassphrase: opts.networkPassphrase }),
        signal: ctrl.signal,
      })
    } catch (e) {
      if (ctrl.signal.aborted) throw new Error('the relay did not answer the signing request in time')
      throw e
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`dfns sign ${res.status}: ${detail}`)
    }
    const body = (await res.json()) as {
      signedTxXdr?: string
      txHash?: string
      pending?: boolean
      id?: string
      error?: string
    }
    // held for approval: the relay hands back the signature id to poll.
    if (body.pending && body.id) return { pendingId: body.id }
    // classic tx: the relay reports the hash dfns already broadcast.
    if (body.txHash) return { broadcastHash: body.txHash }
    // soroban tx: the relay hands back the signed envelope to submit.
    if (body.signedTxXdr) return { signedTxXdr: body.signedTxXdr }
    throw new Error(body.error ?? 'dfns sign returned neither a hash nor an envelope')
  },
}
