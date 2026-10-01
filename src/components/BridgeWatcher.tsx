import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { useNetwork } from '../contexts/NetworkContext'
import { useToast } from '../contexts/ToastContext'
import { STELLAR_CCTP_DOMAIN, cctpChainsFor, type Network } from '../config/contracts'
import { useAttestation } from '../integrations/cctp/hooks'
import { announceOnce } from '../integrations/cctp/on-screen'
import { circleMinted, useNow } from '../integrations/cctp/status'
import { isDeliveredOnStellar } from '../integrations/cctp/claim'
import { isReceivedOnEvm } from '../integrations/cctp/evm-burn'
import { decodeCctpMessage, hexToBytes } from '../integrations/cctp/message'
import {
  directionOf,
  markAttested,
  markDelivered,
  useTrackedTransfers,
  type TrackedTransfer,
} from '../integrations/cctp/transfers'

// a transfer left this long is not watched in the background any more; the
// Bridges page still lists it and can finish it
const WATCH_FOR_MS = 7 * 24 * 3600_000

// Follows every transfer still on its way, on any page: records when Circle signed
// and when the USDC landed, and says so once. A delivery made from somewhere else,
// another tab, the relay, Circle's own mint, is picked up here too.
export default function BridgeWatcher() {
  const { network } = useNetwork()
  const tracked = useTrackedTransfers(network)
  const now = useNow(true, 60_000)
  // still on its way, or arrived through Circle's mint before Circle named that mint
  const live = tracked.filter(
    (t) => now - t.createdAt < WATCH_FOR_MS && (t.stage === 'burned' || (!!t.forwarded && !t.deliveredHash)),
  )
  return (
    <>
      {live.map((t) => (
        <Watch key={t.id} network={network} transfer={t} />
      ))}
    </>
  )
}

function Watch({ network, transfer: t }: { network: Network; transfer: TrackedTransfer }) {
  const toast = useToast()
  const qc = useQueryClient()
  const out = directionOf(t) === 'from-stellar'
  const chain = cctpChainsFor(network).find((c) => c.key === t.chainKey) ?? null
  const att = useAttestation(network, t.sourceDomain, t.id, {
    destinationDomain: out ? chain?.domain : STELLAR_CCTP_DOMAIN,
    untilForwarded: out && !!t.forwarded,
  })
  const data = att.data

  useEffect(() => {
    // the balances on screen were read before the USDC landed
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: ['cctp', 'holdings'] })
      void qc.invalidateQueries({ queryKey: ['horizon', 'balances', network] })
    }
    if (data?.state !== 'complete') return
    markAttested(network, t.id)
    if (t.stage === 'delivered') {
      if (data.forwardTxHash) markDelivered(network, t.id, data.forwardTxHash)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        // Circle's own mint: its labels first, then the chain, which knows even when they lag
        const minted =
          out && t.forwarded && chain
            ? circleMinted(data.forwardState) ||
              (!!data.forwardTxHash && (await isReceivedOnEvm(chain, decodeCctpMessage(hexToBytes(data.message)).nonce)))
            : false
        if (cancelled) return
        if (out && t.forwarded) {
          if (minted) {
            markDelivered(network, t.id, data.forwardTxHash ?? '')
            refresh()
            announceOnce(t.id, 'done', () => toast.success(`${t.amount} USDC arrived on ${t.chainName}.`))
          } else if (data.forwardState === 'FAILED') {
            announceOnce(t.id, 'act', () =>
              toast.info(`Circle could not mint ${t.amount} USDC on ${t.chainName}. Your EVM wallet can receive it from the Bridges page.`),
            )
          }
          return
        }
        // signed, but someone may already have finished it
        const nonce = decodeCctpMessage(hexToBytes(data.message)).nonce
        const done = out && chain ? await isReceivedOnEvm(chain, nonce) : await isDeliveredOnStellar(network, data.message)
        if (cancelled) return
        if (done) {
          markDelivered(network, t.id, '')
          refresh()
          announceOnce(t.id, 'done', () =>
            toast.success(out ? `${t.amount} USDC arrived on ${t.chainName}.` : `${t.amount} USDC from ${t.chainName} arrived on Stellar.`),
          )
          return
        }
        announceOnce(t.id, 'act', () =>
          toast.info(
            out
              ? `Circle signed ${t.amount} USDC to ${t.chainName}. Receive it from the Bridges page.`
              : `Circle signed ${t.amount} USDC from ${t.chainName}. Deliver it from the Bridges page.`,
          ),
        )
      } catch {
        // a read that fails says nothing; the next poll or the page settles it
      }
    })()
    return () => {
      cancelled = true
    }
  }, [data, network, t, out, chain, toast, qc])

  return null
}
