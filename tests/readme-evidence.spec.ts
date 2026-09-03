import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The README is the only committed file that publishes transaction hashes, so it
// is what a reviewer checks. These specs read it and hold every link to the
// ledger: the transaction has to exist, have succeeded, and come from a wallet
// we control unless the line says in as many words that it does not.

const OURS = [
  // DFNS treasury, testnet then mainnet
  'GCWEI7HVEOPEMP7YTULFH5DMGCJCHMEKZHBHTI3R66WMKX276A4W2OPB',
  'GCE75LSGSRWKXNZLJ2SPZ4XZS4CFSUTZBHCWQSK7RTWSMU2AJ3F36DQP',
  // deployer / demo wallets
  'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
  'GCVFDROZF3D565FAURFQBXQEOHT4BPQK2P66JUCL5XQWNWQBOGXMRVQA',
  // the browser-wallet test account behind the Freighter and xBull signatures.
  // one key imported into both wallets, which is why both proofs share a source.
  'GC6QPGCOCI2FTQYTLVHNWC6I6MQYZPGCLJOO5X7KV2Z4ZMIY67I6JKDY',
]

interface Link {
  line: string
  net: 'public' | 'testnet'
  hash: string
  disowned: boolean
}

function readLinks(): Link[] {
  const md = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8')
  const out: Link[] = []
  for (const line of md.split('\n')) {
    const m = /explorer\/(public|testnet)\/tx\/([a-f0-9]{64})/.exec(line)
    if (!m) continue
    out.push({
      line,
      net: m[1] as 'public' | 'testnet',
      hash: m[2],
      // a line that says the transaction is not ours is held to a weaker promise
      disowned: /not our transaction/i.test(line),
    })
  }
  return out
}

async function horizon(net: string, hash: string) {
  const base = net === 'public' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org'
  const res = await fetch(`${base}/transactions/${hash}`, { signal: AbortSignal.timeout(20000) })
  return { status: res.status, body: res.ok ? await res.json() : null }
}

const links = readLinks()

test.describe('the hashes the README publishes', () => {
  test('there are some, and every one carries its network', () => {
    expect(links.length).toBeGreaterThan(5)
    for (const l of links) expect(['public', 'testnet']).toContain(l.net)
  })

  for (const l of links) {
    const label = l.line.replace(/\|/g, '').trim().slice(0, 54)

    test(`${l.hash.slice(0, 8)} on ${l.net} exists and succeeded`, async () => {
      let r
      try {
        r = await horizon(l.net, l.hash)
      } catch {
        test.skip(true, 'horizon unreachable')
        return
      }
      expect(r.status, `${label}: horizon says ${r.status}`).toBe(200)
      expect(r.body.successful, `${label}: transaction failed on chain`).toBe(true)
    })

    test(`${l.hash.slice(0, 8)} is ours, or says it is not`, async () => {
      let r
      try {
        r = await horizon(l.net, l.hash)
      } catch {
        test.skip(true, 'horizon unreachable')
        return
      }
      if (r.status !== 200) {
        test.skip(true, 'covered by the existence check')
        return
      }
      const src = r.body.source_account as string
      if (l.disowned) {
        // the point of the label: it is somebody else's, and the README says so
        expect(OURS).not.toContain(src)
      } else {
        expect(
          OURS,
          `${label}: sourced by ${src}, which is not a wallet we control. Either the ` +
            'hash is wrong or the line has to say the transaction is not ours.',
        ).toContain(src)
      }
    })
  }
})
