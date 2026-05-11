// Probe the Stellar testnet + mainnet RPCs and confirm both respond.
//
// Run:  node scripts/probe-stellar-rpc.mjs

import { rpc, Networks } from '@stellar/stellar-sdk'

const ENDPOINTS = {
  testnet: 'https://soroban-testnet.stellar.org',
  mainnet: 'https://mainnet.sorobanrpc.com',
}

async function probe(name, url) {
  const server = new rpc.Server(url)
  const health = await server.getHealth()
  const latestLedger = await server.getLatestLedger()
  return {
    name,
    url,
    status: health.status,
    latestLedger: latestLedger.sequence,
    protocolVersion: latestLedger.protocolVersion,
    networkPassphrase: name === 'testnet' ? Networks.TESTNET : Networks.PUBLIC,
  }
}

const results = await Promise.all(
  Object.entries(ENDPOINTS).map(([name, url]) => probe(name, url)),
)

console.log('Stellar RPC probe')
console.log('=================')
for (const r of results) {
  console.log(`\n${r.name.toUpperCase()}`)
  console.log(`  url:                ${r.url}`)
  console.log(`  health:             ${r.status}`)
  console.log(`  latest ledger:      ${r.latestLedger}`)
  console.log(`  protocol version:   ${r.protocolVersion}`)
  console.log(`  network passphrase: ${r.networkPassphrase}`)
}
