// Provisions the testnet auto-approver identity: the DFNS User whose Key
// credential the relay uses to release its own held signatures. Run once, by an
// operator, against the demo org.
//
//   tsx scripts/setup-dfns-approver.mts            generate the keypair, show the org policies, print the steps
//   tsx scripts/setup-dfns-approver.mts --verify   check that DFNS_APPROVER_* can authenticate and read approvals
//
// It does not write to DFNS. Putting a credential on a votable org user needs a
// user-action in the console (delegated registration only makes end-users, which
// cannot vote), so the console step stays manual. The script does the parts that
// are safe and easy to get wrong: it generates the keypair in the exact shape
// DFNS wants, lists the policies so you add the approver to the right one, prints
// the ordered steps, and verifies the identity once it is set.
//
// Why a User and not the service account: a service account can vote only when
// serviceAccountsCanApprove is on, which DFNS gates behind a support ticket. A
// User approver needs no such flag. Full runbook: _docs/TESTNET_AUTO_APPROVER.md.

import { generateKeyPairSync } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'

import { DfnsApiClient } from '@dfns/sdk'
import { AsymmetricKeySigner } from '@dfns/sdk-keysigner'

if (process.argv.includes('--verify')) {
  const need = ['DFNS_API_URL', 'DFNS_APPROVER_AUTH_TOKEN', 'DFNS_APPROVER_CRED_ID', 'DFNS_APPROVER_PRIVATE_KEY']
  const missing = need.filter((k) => !process.env[k])
  if (missing.length > 0) {
    console.error(`--verify needs these set: ${missing.join(', ')}`)
    process.exit(1)
  }
  const signer = new AsymmetricKeySigner({
    credId: process.env.DFNS_APPROVER_CRED_ID as string,
    privateKey: (process.env.DFNS_APPROVER_PRIVATE_KEY as string).replace(/\\n/g, '\n'),
  })
  const dfns = new DfnsApiClient({
    baseUrl: process.env.DFNS_API_URL as string,
    authToken: process.env.DFNS_APPROVER_AUTH_TOKEN as string,
    signer,
    ...(process.env.DFNS_ORG_ID ? { orgId: process.env.DFNS_ORG_ID } : {}),
  })
  const res = await dfns.policies.listApprovals({ query: { status: 'Pending', limit: '1' } })
  console.log(`approver identity OK: authenticated and read ${res.items?.length ?? 0} pending approval(s).`)
  console.log('it can vote once its userId is in the policy approvers and it holds Policies:Evaluations:Vote.')
  process.exit(0)
}

// Generate the Key credential keypair in DFNS's shapes: an SPKI public PEM to
// register on the User, a PKCS8 private PEM for the relay to sign with. ed25519
// matches DFNS's EDDSA option.
const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})
const outDir = '_local/dfns-approver'
mkdirSync(outDir, { recursive: true })
writeFileSync(`${outDir}/approver.public.pem`, publicKey)
writeFileSync(`${outDir}/approver.key`, privateKey)
console.log('generated the approver keypair under _local/dfns-approver/ (gitignored):')
console.log(`  ${outDir}/approver.public.pem   register this as the User's Key credential`)
console.log(`  ${outDir}/approver.key          becomes DFNS_APPROVER_PRIVATE_KEY on Render`)
console.log('')

// Read-only look at the org's policies, so you know which one to add the approver
// to. Skipped cleanly when the service-account env is not present on this box.
try {
  const { listPolicies } = await import('../server/dfns/policies')
  const res = await listPolicies()
  const active = ((res.items ?? []) as Array<{ id: string; name: string; status?: string }>).filter(
    (p) => p.status === 'Active',
  )
  console.log(`active policies in this org (${active.length}):`)
  for (const p of active) console.log(`  ${p.id}  ${p.name}`)
  console.log('')
} catch (e) {
  console.log(`(skipping the policy list: ${(e as Error).message})`)
  console.log('')
}

console.log('then, self-service (no DFNS support ticket), per _docs/TESTNET_AUTO_APPROVER.md:')
console.log('  1. DFNS console: add a credential of kind "Key" to your approver User, pasting')
console.log('     approver.public.pem above. Note the credential id (cr-...) and the userId (us-...).')
console.log('  2. Give that User Policies:Evaluations:Vote, add its userId to DFNS_APPROVER_USER_IDS,')
console.log('     and re-run scripts/setup-dfns-policies.mts so the policy lists it as an approver.')
console.log('  3. Render (Production): set DFNS_APPROVER_AUTH_TOKEN (the User token), DFNS_APPROVER_CRED_ID')
console.log('     (cr-...), DFNS_APPROVER_PRIVATE_KEY (approver.key), DFNS_AUTO_APPROVE_TESTNET=1. Redeploy.')
console.log('  4. Check it: tsx scripts/setup-dfns-approver.mts --verify')
