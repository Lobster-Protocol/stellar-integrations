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
  searchPaused,
  trackTransfer,
  useBurnIntents,
  useTrackedTransfers,
  walletsToSearch,
  type TrackedTransfer,
} from '../integrations/cctp/transfers'

const WATCH_FOR_MS = 7 * 24 * 3600_000
// an unfinished Stellar search is retried sooner. An unfinished EVM one records an error,
// and searchPaused holds it back until the pause ends
const SEARCH_EVERY_MS = 10 * 60_000
const SEARCH_AGAIN_MS = 2 * 60_000
// Horizon and logs lag fresh burns
const SEARCH_SETTLE_MS = 30_000
// a burn out of Stellar that Circle never saw is looked up on the ledger once it can no
// longer land, for a month at most: a public Horizon may drop older history
const UNSEEN_AFTER_MS = 5 * 60_000
const UNSEEN_UNTIL_MS = 30 * 24 * 3600_000
// a burn into Stellar still unsigned after this may have reverted, its receipt never read
const UNSIGNED_AFTER_MS = 10 * 60_000
const FATE_EVERY_MS = 2 * 60_000

// follows each transfer from any page, and notices one finished elsewhere
export default function BridgeWatcher() {
  const { network } = useNetwork()
  const tracked = useTrackedTransfers(network)
  const now = useNow(true, 60_000)
  // a forwarded one stays watched until Circle gives its mint hash, even once delivered
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

type SearchJob = (known: Set<string>) => Promise<{ found: TrackedTransfer[]; unfinished: boolean }>

function shortError(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split('\n')[0].slice(0, 120)
}

// what this browser lost track of, found again on chain
function Recovery({ network }: { network: Network }) {
  const toast = useToast()
  const { address: stellarAddr } = useWallet()
  const evmAddr = useAccount().address
  const intents = orphanIntents(useBurnIntents(network))
  const tracked = useTrackedTransfers(network)
  const busy = useRef(new Set<string>())
  const queued = useRef(new Map<string, SearchJob>())
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
      // another tab may have settled one since
      for (const i of orphanIntents(listIntents(network))) {
        if (stop) return
        try {
          const r = await resolveEvmIntent(i, new Set(listTransfers(network).map((t) => t.id)))
          if (stop) return
          if (r.kind === 'found') {
            trackTransfer(r.transfer)
            dropIntent(network, i.id)
            toast.info(`The ${i.amount} USDC burn from ${i.chainName} went out after the page that asked for it closed. It's waiting on the Bridges page.`)
          } else if (r.kind === 'tracked') {
            dropIntent(network, i.id)
          } else if (r.kind === 'none') {
            dropIntent(network, i.id)
            toast.info(`The ${i.amount} USDC burn from ${i.chainName} requested at ${clock(i.startedAt)} never left your wallet. Nothing moved.`)
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

  // one search per wallet and chain; a wallet that just connected never waits behind a slow one
  const run = useCallback(
    async (key: string, job: SearchJob) => {
      const busyKey = `${network}|${key}`
      // queued, not dropped, when asked again mid-run
      if (busy.current.has(busyKey)) {
        queued.current.set(busyKey, job)
        return
      }
      busy.current.add(busyKey)
      try {
        for (let next: SearchJob | undefined = job; next; next = queued.current.get(busyKey)) {
          queued.current.delete(busyKey)
          const { found, unfinished } = await next(new Set(listTransfers(network).map((t) => t.id)))
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
        }
      } finally {
        busy.current.delete(busyKey)
        queued.current.delete(busyKey)
      }
    },
    [network, toast],
  )

  // an EVM wallet only connects here to bridge. Remembered, it's searched later even while locked
  useEffect(() => {
    if (evmAddr) rememberWallet(network, 'evm', evmAddr)
  }, [network, evmAddr])

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
        if (searchPaused(listSearches(network)[key])) continue
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

  // burns tracked before their chain confirmed them, still unsigned by Circle. One that
  // never reached Stellar, or failed on chain, moved nothing and is dropped
  const doubtful = tracked.filter((t) => {
    if (t.stage !== 'burned' || t.attestedAt || landed.current.has(t.id)) return false
    const age = now - t.createdAt
    // a burn out of Stellar that can still land isn't missing yet
    return directionOf(t) === 'from-stellar'
      ? age > UNSEEN_AFTER_MS && age < UNSEEN_UNTIL_MS && (!t.validUntil || now > t.validUntil + 60_000)
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
                : `The ${t.amount} USDC burn on ${t.chainName} failed. Nothing moved.`,
            )
          }
          // not mined yet, or the read failed: asked again next round
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
  // a delivery made elsewhere doesn't reach this page by itself
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
        // for Circle's own mint, its forward state first, then the chain, which can be ahead of it
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
        // the next poll retries
      }
    })()
    return () => {
      cancelled = true
    }
  }, [data, network, t, out, chain, toast, qc, tick])

  return null
}
