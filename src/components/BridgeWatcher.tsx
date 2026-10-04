import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAccount } from 'wagmi'

import { useNetwork } from '../contexts/NetworkContext'
import { useToast } from '../contexts/ToastContext'
import { useWallet } from '../contexts/WalletContext'
import { STELLAR_CCTP_DOMAIN, cctpChainsFor, type Network } from '../config/contracts'
import { useAttestation } from '../integrations/cctp/hooks'
import { announceOnce } from '../integrations/cctp/on-screen'
import { circleMinted, clock, useNow } from '../integrations/cctp/status'
import { isDeliveredOnStellar } from '../integrations/cctp/claim'
import { isReceivedOnEvm } from '../integrations/cctp/evm-burn'
import { decodeCctpMessage, hexToBytes } from '../integrations/cctp/message'
import { evmBurnFate, resolveEvmIntent, searchEvmWallet, searchStellarAccount, stellarBurnFate } from '../integrations/cctp/recover'
import {
  directionOf,
  dropIntent,
  forgetTransfer,
  listIntents,
  listSearches,
  listTransfers,
  markAttested,
  markDelivered,
  orphanIntents,
  recordSearch,
  rememberWallet,
  SEARCH_EVENT,
  trackTransfer,
  useBurnIntents,
  useTrackedTransfers,
  walletsToSearch,
  type TrackedTransfer,
} from '../integrations/cctp/transfers'

// a transfer left this long is not watched in the background any more; the
// Bridges page still lists it and can finish it
const WATCH_FOR_MS = 7 * 24 * 3600_000
// how often the connected wallets are searched again for burns that never arrived, and how
// soon after a search that could not check everything
const SEARCH_EVERY_MS = 10 * 60_000
const SEARCH_AGAIN_MS = 2 * 60_000
// a burn made seconds before the page opened (a tab that crashed and came straight back,
// another computer) may not be on Horizon or in the logs yet: one more look this long after
const SEARCH_SETTLE_MS = 30_000
// a burn out of Stellar tracked from its signature that Circle has never seen this long
// after is checked against the ledger; its three minutes to land ran out long before.
// Only for a month: past that a public Horizon may no longer hold the history, and a
// missing record would no longer mean the burn never happened
const UNSEEN_AFTER_MS = 5 * 60_000
const UNSEEN_UNTIL_MS = 30 * 24 * 3600_000
// a burn into Stellar that Circle has not signed this long after is checked for a revert:
// the page saw it leave the wallet but never read its receipt, the PC off in between
const UNSIGNED_AFTER_MS = 10 * 60_000
// how often a burn whose fate could not be read is asked about again
const FATE_EVERY_MS = 2 * 60_000

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
      <Recovery network={network} />
      {live.map((t) => (
        <Watch key={t.id} network={network} transfer={t} />
      ))}
    </>
  )
}

function shortError(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split('\n')[0].slice(0, 120)
}

// Finds again what this browser lost track of, so a PC switched off mid-transfer, a closed
// tab or another device loses nothing: EVM burns a page asked for and never heard back
// about, every unfinished burn of the wallets connected or bridged with here lately (the
// Stellar accounts' history, the EVM chains' logs), and burns tracked before their chain
// confirmed them that never landed or failed there
function Recovery({ network }: { network: Network }) {
  const toast = useToast()
  const { address: stellarAddr } = useWallet()
  const evmAddr = useAccount().address
  const intents = orphanIntents(useBurnIntents(network))
  const tracked = useTrackedTransfers(network)
  const busy = useRef(new Set<string>())
  const again = useRef<ReturnType<typeof setTimeout> | null>(null)
  const landed = useRef(new Set<string>())
  const now = useNow(true, 60_000)

  const intentKey = intents.map((i) => i.id).join(',')
  useEffect(() => {
    if (!intentKey) return
    let stop = false
    // a round slower than the interval must not run twice over the same intent
    let running = false
    const run = async () => {
      if (running) return
      running = true
      // read afresh each round: one settled by another tab is gone from the store
      for (const i of orphanIntents(listIntents(network))) {
        if (stop) return
        try {
          const r = await resolveEvmIntent(i, new Set(listTransfers(network).map((t) => t.id)))
          if (stop) return
          if (r.kind === 'found') {
            trackTransfer(r.transfer)
            dropIntent(network, i.id)
            toast.info(`The ${i.amount} USDC burn from ${i.chainName} went out while the page was away. It is waiting on the Bridges page.`)
          } else if (r.kind === 'tracked') {
            dropIntent(network, i.id)
          } else if (r.kind === 'none') {
            dropIntent(network, i.id)
            toast.info(`The ${i.amount} USDC burn from ${i.chainName} asked at ${clock(i.startedAt)} never left your wallet. Nothing moved.`)
          } else if (r.kind === 'unreadable') {
            dropIntent(network, i.id)
            toast.info(
              `Could not tell whether the ${i.amount} USDC burn from ${i.chainName} went out. If your wallet shows it sent, paste its hash on the Bridges page.`,
            )
          }
        } catch {
          // a read that fails settles nothing; the next round tries again
        }
      }
      running = false
    }
    void run()
    const id = setInterval(() => void run(), 20_000)
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [intentKey, network, toast])

  // One search per wallet and chain, each on its own: an EVM wallet connected while the
  // Stellar account's history is still being read is searched at once, not ten minutes on.
  // A search already running for the same wallet is left to finish
  const run = useCallback(
    async (key: string, job: (known: Set<string>) => Promise<{ found: TrackedTransfer[]; unfinished: boolean }>) => {
      const busyKey = `${network}|${key}`
      if (busy.current.has(busyKey)) return
      busy.current.add(busyKey)
      try {
        const { found, unfinished } = await job(new Set(listTransfers(network).map((t) => t.id)))
        if (unfinished && !again.current) {
          again.current = setTimeout(() => {
            again.current = null
            window.dispatchEvent(new Event(SEARCH_EVENT))
          }, SEARCH_AGAIN_MS)
        }
        for (const t of found) {
          if (listTransfers(network).some((x) => x.id === t.id)) continue
          trackTransfer(t)
          const out = directionOf(t) === 'from-stellar'
          announceOnce(t.id, 'found', () =>
            toast.info(
              out
                ? `Found ${t.amount} USDC sent out of Stellar to ${t.chainName} that has not arrived yet. It is waiting on the Bridges page.`
                : `Found ${t.amount} USDC from ${t.chainName} that has not reached Stellar yet. It is waiting on the Bridges page.`,
            ),
          )
        }
      } finally {
        busy.current.delete(busyKey)
      }
    },
    [network, toast],
  )

  // an EVM wallet is only connected here to bridge: noted the moment it is, so a later visit
  // searches it even while it is locked
  useEffect(() => {
    if (evmAddr) rememberWallet(network, 'evm', evmAddr)
  }, [network, evmAddr])

  // every wallet connected now or bridged with from this browser lately, each on its own
  const search = useCallback(() => {
    const wallets = walletsToSearch(network, stellarAddr, evmAddr)
    for (const account of wallets.stellar) {
      const key = `stellar:${account}`
      void run(key, async (known) => {
        try {
          const r = await searchStellarAccount(network, account, known)
          recordSearch(network, key, { at: Date.now(), complete: r.complete, ...(r.complete ? {} : { error: 'part of the history is left to check' }) })
          return { found: r.found, unfinished: !r.complete }
        } catch (err) {
          recordSearch(network, key, { at: Date.now(), complete: false, error: shortError(err) })
          return { found: [], unfinished: true }
        }
      })
    }
    for (const depositor of wallets.evm) {
      for (const chain of cctpChainsFor(network)) {
        const key = `evm:${chain.key}:${depositor.toLowerCase()}`
        void run(key, async (known) => {
          const prev = listSearches(network)[key]
          // once a full pass is done, only the blocks since it
          const since = prev?.complete && prev.head ? BigInt(prev.head) - 10n : undefined
          try {
            const r = await searchEvmWallet(network, chain, depositor as `0x${string}`, known, since)
            recordSearch(network, key, {
              at: Date.now(),
              head: r.head.toString(),
              reachedFrom: (since !== undefined && prev?.reachedFrom ? BigInt(prev.reachedFrom) : r.search.reachedFrom).toString(),
              complete: r.search.complete,
              error: r.search.error,
            })
            return { found: r.found, unfinished: r.unchecked > 0 }
          } catch (err) {
            recordSearch(network, key, { at: Date.now(), complete: false, error: shortError(err) })
            return { found: [], unfinished: true }
          }
        })
      }
    }
  }, [network, stellarAddr, evmAddr, run])

  // on load and half a minute later, when a wallet connects, every few minutes, when the tab
  // comes back, and on demand
  useEffect(() => {
    search()
    const soon = setTimeout(search, SEARCH_SETTLE_MS)
    const id = setInterval(search, SEARCH_EVERY_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') search()
    }
    const onAsk = () => search()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(SEARCH_EVENT, onAsk)
    return () => {
      clearTimeout(soon)
      clearInterval(id)
      if (again.current) clearTimeout(again.current)
      again.current = null
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(SEARCH_EVENT, onAsk)
    }
  }, [search])

  // Burns tracked before their chain confirmed them that Circle has still not signed: out of
  // Stellar from the signature, into Stellar from the hash the wallet returned. One that never
  // reached Stellar, or reached a chain and failed there, moved nothing and stops being shown
  const doubtful = tracked.filter((t) => {
    if (t.stage !== 'burned' || t.attestedAt || landed.current.has(t.id)) return false
    const age = now - t.createdAt
    return directionOf(t) === 'from-stellar'
      ? age > UNSEEN_AFTER_MS && age < UNSEEN_UNTIL_MS
      : age > UNSIGNED_AFTER_MS && age < WATCH_FOR_MS
  })
  const doubtfulKey = doubtful.map((t) => t.id).join(',')
  useEffect(() => {
    if (!doubtfulKey) return
    let stop = false
    let checking = false
    const check = async () => {
      if (checking) return
      checking = true
      try {
        for (const id of doubtfulKey.split(',')) {
          const t = listTransfers(network).find((x) => x.id === id)
          if (!t || t.stage !== 'burned' || t.attestedAt) continue
          const out = directionOf(t) === 'from-stellar'
          const chain = cctpChainsFor(network).find((c) => c.key === t.chainKey)
          const fate = out ? await stellarBurnFate(network, id) : chain ? await evmBurnFate(chain, id as `0x${string}`) : null
          if (stop) return
          if (fate === 'landed') {
            landed.current.add(id)
          } else if (fate === 'missing' && out) {
            forgetTransfer(network, id)
            toast.info(`The ${t.amount} USDC burn to ${t.chainName} never reached Stellar. Nothing moved.`)
          } else if (fate === 'failed') {
            forgetTransfer(network, id)
            toast.info(
              out
                ? `The ${t.amount} USDC burn to ${t.chainName} failed on Stellar. Nothing moved.`
                : `The ${t.amount} USDC burn on ${t.chainName} failed on chain. Nothing moved.`,
            )
          }
          // an EVM burn not mined yet, or a read that failed: asked again in a while
        }
      } finally {
        checking = false
      }
    }
    void check()
    const id = setInterval(() => void check(), FATE_EVERY_MS)
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [doubtfulKey, network, toast])

  return null
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
  // signed but not yet arrived: asked again every half minute, since a delivery made
  // elsewhere (another device, the relay, Circle) changes nothing this page would hear
  const tick = useNow(data?.state === 'complete' && t.stage === 'burned', 30_000)

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
  }, [data, network, t, out, chain, toast, qc, tick])

  return null
}
