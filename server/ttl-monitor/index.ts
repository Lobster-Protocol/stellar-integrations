import { rpc, xdr, Contract, Networks, TransactionBuilder } from '@stellar/stellar-sdk'
import { CONTRACTS, STELLAR_RPC_FALLBACK } from '../../src/config/contracts'
import type { Network } from '../../src/config/contracts'
import { scanTtl, keysNeedingExtend, type KeyStatus, type ScanResult } from './monitor'
import { buildExtendTtlTx } from './extend'
import { EXTEND_TARGET_LEDGERS, readTtl } from './ledger'
import { otlpEnabled, pushExposition } from '../metrics/otlp'

// ledgers that can pass between the extend applying and the read-back
const READBACK_SLACK_LEDGERS = 100

interface MonitorConfig {
  network: Network
  rpcUrl: string
  intervalMs: number
  pushgatewayUrl?: string
  feeCapStroops: bigint
}

const DEFAULT_INTERVAL_MS = 300_000
// most one extend may cost. the dearest is the 35 KB vault code going from its
// last day back to 30: about 10.4 XLM on mainnet in october 2026. the cap leaves
// room for rent to climb, not for a runaway estimate near the ttl ceiling.
const DEFAULT_FEE_CAP_XLM = 20
// an extend gives back two weeks or more, so a key that still reads due a day
// after one landed points at a fault. paying again every pass would only drain
// the account that pays the rent.
const EXTEND_COOLDOWN_MS = 24 * 3600 * 1000

function rpcUrlFor(network: Network, env: NodeJS.ProcessEnv = process.env): string {
  const override = network === 'mainnet' ? env.SOROBAN_RPC_MAINNET : env.SOROBAN_RPC_TESTNET
  return override || STELLAR_RPC_FALLBACK[network].soroban
}

function readConfig(env: NodeJS.ProcessEnv = process.env): MonitorConfig {
  // mainnet has to be asked for by name; an unset or mistyped var means testnet
  const network: Network = env.TTL_MONITOR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'
  const intervalMs = Number(env.TTL_MONITOR_INTERVAL_MS) || DEFAULT_INTERVAL_MS
  const cap = Number(env.TTL_EXTEND_FEE_CAP_XLM)
  const feeCapXlm = Number.isFinite(cap) && cap > 0 ? cap : DEFAULT_FEE_CAP_XLM
  return {
    network,
    rpcUrl: rpcUrlFor(network, env),
    intervalMs,
    pushgatewayUrl: env.PUSHGATEWAY_URL,
    feeCapStroops: BigInt(Math.round(feeCapXlm * 1e7)),
  }
}

// TTL_MONITOR_NETWORK names one network or a list, "testnet,mainnet". each gets
// its own loop so a failing network never holds the other up; anything else
// falls back to testnet, same as readConfig.
export function readConfigs(env: NodeJS.ProcessEnv = process.env): MonitorConfig[] {
  const asked = (env.TTL_MONITOR_NETWORK ?? '').split(',').map((s) => s.trim())
  const networks = (['testnet', 'mainnet'] as const).filter((n) => asked.includes(n))
  const base = readConfig(env)
  return (networks.length ? networks : [base.network]).map((network) => ({
    ...base,
    network,
    rpcUrl: rpcUrlFor(network, env),
  }))
}

// the code key a contract instance runs on. the factory's own hash lives only
// in its instance entry on chain, so it is read from there, never configured.
export function executableCodeKey(entry?: xdr.LedgerEntryData): xdr.LedgerKey | null {
  if (entry?.switch().name !== 'contractData') return null
  const val = entry.contractData().val()
  if (val.switch().name !== 'scvContractInstance') return null
  const exec = val.instance().executable()
  if (exec.switch().name !== 'contractExecutableWasm') return null
  return xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: exec.wasmHash() }))
}

// one-shot scan a route or test can call without the daemon loop. throws when
// the factory isn't deployed on the network, which the caller turns into a 503.
export async function scanNetwork(network: Network, rpcUrl = rpcUrlFor(network)): Promise<ScanResult> {
  // the sdk default is no timeout at all; a stuck endpoint would pin the daemon
  // pass and hold /ttl requests open
  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://'), timeout: 15_000 })
  const { factory, wasmHash } = CONTRACTS[network].lobster
  if (!factory || !wasmHash) {
    throw new Error(`Lobster Factory not deployed on ${network}; nothing to monitor yet`)
  }
  const wasm = Buffer.from(wasmHash, 'hex')
  if (wasm.length !== 32) throw new Error(`factory wasm hash for ${network} is not 32 bytes`)
  // the factory instance, its code and the vault code it deploys each archive on
  // their own clock (CAP-53). wasmHash names the vault code on mainnet but the
  // factory's own code on testnet, so a key already watched isn't added twice.
  const instanceKey = new Contract(factory).getFootprint()
  const configuredKey = xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: wasm }))
  const kinds = new Map([[instanceKey.toXDR('base64'), 'instance']])
  const ownCode = executableCodeKey((await server.getLedgerEntries(instanceKey)).entries[0]?.val)
  if (ownCode) kinds.set(ownCode.toXDR('base64'), 'factory-code')
  if (!kinds.has(configuredKey.toXDR('base64'))) kinds.set(configuredKey.toXDR('base64'), 'vault-code')
  const scan = await scanTtl(
    [...kinds.keys()].map((k) => xdr.LedgerKey.fromXDR(k, 'base64')),
    server,
  )
  for (const s of scan.statuses) s.kind = kinds.get(s.keyXdr)

  // a stale wasmHash breaks vault deploys too, so fail loud rather than auto-extend a dead key
  const inst = scan.statuses.find((s) => s.kind === 'instance')
  const code = scan.statuses.find((s) => s.keyXdr === configuredKey.toXDR('base64'))
  if (inst && inst.reading.level !== 'archived' && code && code.reading.level === 'archived') {
    throw new Error(
      `Lobster factory on ${network} is live but its configured wasm code key ` +
        `(${wasmHash}) is absent on chain; contracts.ts wasmHash is stale after a ` +
        `redeploy. refresh it from the deployed factory before monitoring.`,
    )
  }
  return scan
}

// the latest-ledger gauge makes a stale push visible instead of silently trusted.
export function formatMetrics(scan: ScanResult, network: Network, autoExtend = false): string {
  const labels = (s: KeyStatus) =>
    `{network="${network}",kind="${s.kind ?? 'unknown'}",key="${s.keyXdr}"}`
  const lines = [
    '# HELP lobster_ttl_remaining_ledgers ledgers until the entry archives',
    '# TYPE lobster_ttl_remaining_ledgers gauge',
    ...scan.statuses.map((s) => `lobster_ttl_remaining_ledgers${labels(s)} ${s.reading.remainingLedgers}`),
    '# HELP lobster_ttl_remaining_seconds seconds until the entry archives',
    '# TYPE lobster_ttl_remaining_seconds gauge',
    ...scan.statuses.map((s) => `lobster_ttl_remaining_seconds${labels(s)} ${s.reading.remainingSeconds}`),
    '# HELP lobster_ttl_latest_ledger latest ledger the scan read against',
    '# TYPE lobster_ttl_latest_ledger gauge',
    `lobster_ttl_latest_ledger{network="${network}"} ${scan.latestLedger}`,
    '# HELP lobster_ttl_auto_extend 1 when the daemon holds a key to extend entries itself',
    '# TYPE lobster_ttl_auto_extend gauge',
    `lobster_ttl_auto_extend{network="${network}"} ${autoExtend ? 1 : 0}`,
  ]
  return lines.join('\n') + '\n'
}

async function pushMetrics(url: string, body: string): Promise<void> {
  const res = await fetch(`${url.replace(/\/$/, '')}/metrics/job/lobster-ttl-monitor`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body,
    // a stuck pushgateway must not hang the scan loop
    signal: AbortSignal.timeout(10_000),
  })
  // a rejected push blinds the grafana ttl alerts while the daemon still looks
  // healthy, so fail loud
  if (!res.ok) throw new Error(`pushgateway answered ${res.status}`)
}

// with no signer wired, a pass only reports the keys that need extending.
export interface ExtendSigner {
  sourceAddress: string
  // asserted against the pass so a mainnet daemon can't drive a testnet-wired
  // signer, or the reverse
  network: Network
  sign(xdrBase64: string, networkPassphrase: string): Promise<string>
}

// the fee cap stops a runaway rent estimate near the ceiling from signing an
// arbitrary amount. one bad key logs and moves on rather than stranding the rest.
// returns the keys whose extend landed, which is when the rent got paid.
export async function extendKeys(
  server: rpc.Server,
  keys: KeyStatus[],
  network: Network,
  signer: ExtendSigner,
  feeCapStroops = 5_000_000n,
): Promise<string[]> {
  const landed: string[] = []
  if (signer.network !== network) {
    throw new Error(`extend signer is wired for ${signer.network}, refusing to sign on ${network}`)
  }
  const passphrase = network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET
  for (const s of keys) {
    try {
      const account = await server.getAccount(signer.sourceAddress)
      const key = xdr.LedgerKey.fromXDR(s.keyXdr, 'base64')
      const tx = buildExtendTtlTx(account, key, EXTEND_TARGET_LEDGERS, passphrase)
      const sim = await server.simulateTransaction(tx)
      if (rpc.Api.isSimulationError(sim)) {
        console.error(`[ttl-monitor:${network}] extend simulation failed for ${s.keyXdr}: ${sim.error}`)
        continue
      }
      if (rpc.Api.isSimulationRestore(sim)) {
        // the entry archived between the scan and this pass; an extend can't
        // bring it back, that takes a restore
        console.error(`[ttl-monitor:${network}] ${s.keyXdr} archived before the extend landed; restore needed`)
        continue
      }
      const prepared = rpc.assembleTransaction(tx, sim).build()
      const fee = BigInt(prepared.fee)
      if (fee > feeCapStroops) {
        console.error(`[ttl-monitor:${network}] extend fee ${fee} over cap ${feeCapStroops} for ${s.keyXdr}, skipping`)
        continue
      }
      const signed = await signer.sign(prepared.toXDR(), passphrase)
      const sent = await server.sendTransaction(TransactionBuilder.fromXDR(signed, passphrase))
      if (sent.status === 'ERROR') {
        console.error(`[ttl-monitor:${network}] extend rejected for ${s.keyXdr}`)
        continue
      }
      const res = await server.pollTransaction(sent.hash)
      if (res.status === 'SUCCESS') {
        landed.push(s.keyXdr)
        // SUCCESS says the tx applied, not that the entry now has the runway we
        // asked for, so read it back before calling the key done
        const after = await server.getLedgerEntries(key)
        const left = readTtl(after.entries[0]?.liveUntilLedgerSeq, after.latestLedger).remainingLedgers
        if (left >= EXTEND_TARGET_LEDGERS - READBACK_SLACK_LEDGERS) {
          console.warn(`[ttl-monitor:${network}] extended ${s.keyXdr}: tx ${sent.hash}, ${left} ledgers left`)
        } else {
          console.error(`[ttl-monitor:${network}] extend tx ${sent.hash} landed but ${s.keyXdr} only has ${left} ledgers left`)
        }
      } else {
        // a failed extend means the entry keeps marching to archival; log it
        // loud so a structural cause (underfunded source, fee) gets seen
        console.error(`[ttl-monitor:${network}] extend did not land for ${s.keyXdr}: tx ${sent.hash} ${res.status}`)
      }
    } catch (err) {
      console.error(`[ttl-monitor:${network}] extend failed for ${s.keyXdr}`, err)
    }
  }
  return landed
}

// the due keys not extended inside the cooldown
export function dueForExtend(due: KeyStatus[], extendedAt: Map<string, number>, now: number): KeyStatus[] {
  return due.filter((s) => now - (extendedAt.get(s.keyXdr) ?? -Infinity) >= EXTEND_COOLDOWN_MS)
}

// metrics push goes last so a pushgateway failure can't silence the console
// alerts from the same pass.
async function runOnce(config: MonitorConfig, signer?: ExtendSigner, extendedAt = new Map<string, number>()): Promise<void> {
  const scan = await scanNetwork(config.network, config.rpcUrl)

  for (const a of scan.statuses.filter((s) => s.reading.level !== 'ok')) {
    console.warn(`[ttl-monitor:${config.network}] ${a.reading.level} ${a.keyXdr} ${a.reading.remainingLedgers} ledgers left`)
  }

  const due = keysNeedingExtend(scan.statuses)
  if (due.length && signer) {
    const now = Date.now()
    const toExtend = dueForExtend(due, extendedAt, now)
    for (const s of due.filter((d) => !toExtend.includes(d))) {
      console.error(`[ttl-monitor:${config.network}] ${s.keyXdr} still reads due a day after its extend landed; not paying again yet`)
    }
    if (toExtend.length) {
      const server = new rpc.Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://'), timeout: 15_000 })
      for (const k of await extendKeys(server, toExtend, config.network, signer, config.feeCapStroops)) extendedAt.set(k, now)
    }
  } else if (due.length) {
    console.warn(`[ttl-monitor:${config.network}] ${due.length} key(s) need an extend and no signer is wired`)
  }

  const body = formatMetrics(scan, config.network, !!signer)
  if (config.pushgatewayUrl) {
    await pushMetrics(config.pushgatewayUrl, body)
  }
  if (otlpEnabled()) {
    await pushExposition(body, 'lobster-ttl-monitor')
  }
}

export async function startLoop(
  config: MonitorConfig = readConfig(),
  signer?: ExtendSigner,
): Promise<void> {
  console.warn(`[ttl-monitor] watching ${config.network} every ${config.intervalMs}ms`)
  if (signer) console.warn(`[ttl-monitor:${config.network}] extends at 15 days left, paid by ${signer.sourceAddress}`)
  const extendedAt = new Map<string, number>()
  for (;;) {
    try {
      await runOnce(config, signer, extendedAt)
    } catch (err) {
      console.error('[ttl-monitor] pass failed', err)
    }
    await new Promise((r) => setTimeout(r, config.intervalMs))
  }
}
