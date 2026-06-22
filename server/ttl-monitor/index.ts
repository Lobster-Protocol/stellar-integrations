import { rpc, xdr, Contract, Networks, TransactionBuilder } from '@stellar/stellar-sdk'
import { CONTRACTS, STELLAR_RPC_FALLBACK } from '../../src/config/contracts'
import type { Network } from '../../src/config/contracts'
import { scanTtl, keysNeedingExtend, type KeyStatus, type ScanResult } from './monitor'
import { buildExtendTtlTx } from './extend'
import { EXTEND_TARGET_LEDGERS } from './ledger'

interface MonitorConfig {
  network: Network
  rpcUrl: string
  intervalMs: number
  pushgatewayUrl?: string
}

const DEFAULT_INTERVAL_MS = 300_000

// the caller's own rpc wins; the public endpoint is the fallback so a read
// still works without a private node configured.
function rpcUrlFor(network: Network, env: NodeJS.ProcessEnv = process.env): string {
  const override = network === 'mainnet' ? env.SOROBAN_RPC_MAINNET : env.SOROBAN_RPC_TESTNET
  return override || STELLAR_RPC_FALLBACK[network].soroban
}

function readConfig(env: NodeJS.ProcessEnv = process.env): MonitorConfig {
  // mainnet has to be asked for by name; an unset or mistyped var falls back
  // to testnet like every other network default in this repo
  const network: Network = env.TTL_MONITOR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'
  const intervalMs = Number(env.TTL_MONITOR_INTERVAL_MS) || DEFAULT_INTERVAL_MS
  return { network, rpcUrl: rpcUrlFor(network, env), intervalMs, pushgatewayUrl: env.PUSHGATEWAY_URL }
}

// one-shot scan a route or test can call without the daemon loop. throws when
// the factory isn't deployed on the network, which the caller turns into a 503.
export async function scanNetwork(network: Network, rpcUrl = rpcUrlFor(network)): Promise<ScanResult> {
  // the sdk default is no timeout at all; a stuck public endpoint would pin
  // the daemon pass and hold /ttl requests open, so cap it
  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://'), timeout: 15_000 })
  const { factory, wasmHash } = CONTRACTS[network].lobster
  if (!factory || !wasmHash) {
    throw new Error(`Lobster Factory not deployed on ${network}; nothing to monitor yet`)
  }
  const wasm = Buffer.from(wasmHash, 'hex')
  if (wasm.length !== 32) throw new Error(`factory wasm hash for ${network} is not 32 bytes`)
  // the factory instance and its wasm code archive sit on separate clocks
  // (CAP-53), so both are watched. the deployed pool's own code key and any
  // position instances get added here once contracts.ts carries the pool id;
  // until then this watches the two factory keys.
  const instanceKey = new Contract(factory).getFootprint()
  const codeKey = xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: wasm }))
  const kinds = new Map([
    [instanceKey.toXDR('base64'), 'instance'],
    [codeKey.toXDR('base64'), 'code'],
  ])
  const scan = await scanTtl([instanceKey, codeKey], server)
  for (const s of scan.statuses) s.kind = kinds.get(s.keyXdr)

  // a live factory whose configured code archive reads as gone means the hash in
  // contracts.ts no longer matches the deployed code, almost always a wasmHash
  // left stale after a redeploy. an instance can't run on archived code, so this
  // pairing is the stale-config signature, not real archival. fail loud rather
  // than auto-extend a dead key while the real code archive marches down unwatched.
  const inst = scan.statuses.find((s) => s.kind === 'instance')
  const code = scan.statuses.find((s) => s.kind === 'code')
  if (inst && inst.reading.level !== 'archived' && code && code.reading.level === 'archived') {
    throw new Error(
      `Lobster factory on ${network} is live but its configured wasm code key ` +
        `(${wasmHash}) is absent on chain; contracts.ts wasmHash is stale after a ` +
        `redeploy. refresh it from the deployed factory before monitoring.`,
    )
  }
  return scan
}

// prometheus exposition pushed to the gateway: a runway gauge per key in
// ledgers and seconds, plus the latest ledger the scan read against so a stale
// push shows up rather than being silently trusted.
async function pushMetrics(url: string, scan: ScanResult, network: Network): Promise<void> {
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
  ]
  const res = await fetch(`${url.replace(/\/$/, '')}/metrics/job/lobster-ttl-monitor`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: lines.join('\n') + '\n',
    // a stuck pushgateway must not hang the scan loop
    signal: AbortSignal.timeout(10_000),
  })
  // a rejected push blinds the grafana ttl alerts while the daemon still looks
  // healthy, so fail loud
  if (!res.ok) throw new Error(`pushgateway answered ${res.status}`)
}

// the signer the daemon hands an assembled xdr to. left unset, a pass only
// reports the keys that need extending, which is the standing mode until the
// mainnet deploy.
export interface ExtendSigner {
  sourceAddress: string
  // asserted against the pass so a mainnet daemon can't drive a testnet-wired
  // signer, or the reverse
  network: Network
  sign(xdrBase64: string, networkPassphrase: string): Promise<string>
}

// extend each critical key back to a month of runway, capping the fee so a
// runaway rent estimate near the ceiling can't sign an arbitrary amount. one
// bad key logs and moves on rather than stranding the rest.
export async function extendKeys(
  server: rpc.Server,
  keys: KeyStatus[],
  network: Network,
  signer: ExtendSigner,
  feeCapStroops = 5_000_000n,
): Promise<void> {
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
        console.warn(`[ttl-monitor:${network}] extended ${s.keyXdr}: tx ${sent.hash}`)
      } else {
        // a failed extend means the entry keeps marching to archival; log it
        // loud so a structural cause (underfunded source, fee) gets seen
        console.error(`[ttl-monitor:${network}] extend did not land for ${s.keyXdr}: tx ${sent.hash} ${res.status}`)
      }
    } catch (err) {
      console.error(`[ttl-monitor:${network}] extend failed for ${s.keyXdr}`, err)
    }
  }
}

// metrics push goes last so a pushgateway failure can't silence the console
// alerts from the same pass.
async function runOnce(config: MonitorConfig, signer?: ExtendSigner): Promise<void> {
  const scan = await scanNetwork(config.network, config.rpcUrl)

  // warn on every key that crossed a band this pass
  for (const a of scan.statuses.filter((s) => s.reading.level !== 'ok')) {
    console.warn(`[ttl-monitor:${config.network}] ${a.reading.level} ${a.keyXdr} ${a.reading.remainingLedgers} ledgers left`)
  }

  const toExtend = keysNeedingExtend(scan.statuses)
  if (toExtend.length && signer) {
    const server = new rpc.Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://'), timeout: 15_000 })
    await extendKeys(server, toExtend, config.network, signer)
  } else if (toExtend.length) {
    console.warn(`[ttl-monitor:${config.network}] ${toExtend.length} key(s) need an extend and no signer is wired`)
  }

  if (config.pushgatewayUrl) {
    await pushMetrics(config.pushgatewayUrl, scan, config.network)
  }
}

export async function startLoop(
  config: MonitorConfig = readConfig(),
  signer?: ExtendSigner,
): Promise<void> {
  console.warn(`[ttl-monitor] watching ${config.network} every ${config.intervalMs}ms`)
  for (;;) {
    try {
      await runOnce(config, signer)
    } catch (err) {
      console.error('[ttl-monitor] pass failed', err)
    }
    await new Promise((r) => setTimeout(r, config.intervalMs))
  }
}
