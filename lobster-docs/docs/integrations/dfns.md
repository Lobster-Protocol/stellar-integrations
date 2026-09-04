# DFNS

DFNS provides MPC custody: the signing key is held as threshold shares, so no
single party ever holds a complete key, and every signature passes through a
policy. It's the custody path for regulated capital. A desk that doesn't need it
uses the Wallets Kit instead, behind the same signer interface.

## Server setup

The signing happens server side, never in the browser. A Hono service holds the
DFNS credentials and the service-account key, reads them from env, and exposes a
small set of routes the dashboard calls. The browser never sees a DFNS token or
the PEM. Network is `StellarTestnet` for testnet, `Stellar` for mainnet.

## Wallet creation

A wallet is created through DFNS with the Stellar network set, and the returned
G-address is what the treasury signs from. The dashboard lists the wallets and,
on testnet, funds a fresh one through friendbot.

## Signing

The service builds the transaction, hands DFNS the unsigned envelope as hex, and
polls until the signature reaches a terminal state. DFNS broadcasts the result
itself. For a Soroban call that DFNS doesn't submit, the signed envelope comes
back and the service submits it through its own RPC. The passphrase is derived
server side from the configured network, and a request whose passphrase disagrees
is rejected, so a caller can't trick the signer onto the wrong network.

## The sign guard

The sign route is fail-closed. With no shared token set it refuses to sign; with
no guard configured it refuses too. Every envelope has to source from the treasury
account, and the fee on the envelope is capped at 1 XLM, since an inflated fee is
an outflow the amount cap never sees.

Classic operations are held to an allowlist: payment, path payment strict send,
path payment strict receive, bump sequence, and change trust. Payments have their
destination checked against a whitelist and their amount capped, each kind read
from the field that actually carries the spend. Change trust is in the list
because it moves no value. DEX offers are out: a dictated price is an outflow
that neither the destination check nor the amount cap can see.

A Soroban invocation is admitted on one narrow path, as a read-only view. Five
method names pass: `get_admin`, `get_pool_count`, `get_wasm_hash`, `get_owner`
and `get_multisig`. The name alone isn't enough. The contract has to be on an
allowlist and the call has to carry no arguments. It also has to carry no
authorization entries, since a token transfer needs the treasury's own
authorization attached while a view returns a value and signs nothing away. An
upload or a deploy is refused before any of that.

The allowlist comes from `DFNS_SOROBAN_VIEW_CONTRACTS`, a comma-separated list of
contract ids. Name nothing there and it falls back to the Lobster factory ids in
the app config, so the one button a reviewer is asked to press works without extra
setup, and a zero-argument view on a contract we deployed hands the caller nothing
either way. If the list resolves to empty, no Soroban invocation signs at all.

The guard reads the invocation out of the envelope rather than trusting what the
caller says about it. The dashboard drives that path from one button: "Call the
Factory (DFNS MPC)" on `/positions` signs a `get_admin` view from the treasury
through MPC, and DFNS hands the signed envelope back for the service to submit.

## Policies and approval

A policy is a transaction amount limit with an action attached. Below the limit
a signature clears on its own; at or above it the request waits for an approver
before anything broadcasts. The identity that starts a request is excluded from
approving it, so the initiating leg and the approving leg are always two separate
DFNS users, whatever the limit is set to.

The limits themselves are configuration, not code. They live in the env that
`scripts/setup-dfns-policies.mts` reads, so this page does not quote a number
that would rot. Ours are set so the approval path is the normal one rather than
the exception.

Each policy is scoped to a list of wallet ids. DFNS also allows scoping by wallet
tag, which is worth knowing because it fails quietly: no wallet in our org carries
a tag, so a policy filtered on tags would match nothing and look active while
covering zero wallets.

One more thing if you go reproduce this. DFNS evaluates an amount policy against
a transfer request, where it built the payment and knows the asset and the
recipient. It cannot evaluate one against a raw signing request.

The approval state streams to the dashboard. Deciding a held request is an
operator control rather than something a visitor does: the pending approvals
panel has Approve and Deny for whoever holds the operator credential, and the
same decision can be taken in the DFNS console.

## Webhooks and audit

DFNS posts webhook events for signatures and approvals. The service verifies the
HMAC signature in constant time, drops replays outside a time window, and
de-duplicates on the event id, then forwards a metadata-only frame to the
dashboard over SSE. The raw payload, which carries signed envelopes and approver
identities, never leaves the server. Wallet transaction and transfer events
export as a MiCA-shaped audit log, chained record to record so the export
verifies end to end.

## Where it lives

`server/dfns/` holds the client, signing, policies, approvals and the sign guard.
The routes, the HMAC check and the SSE stream are in `server/webhook.ts`. On the
browser side the signer is `src/integrations/signer/dfns-signer.ts`, and the
panels (wallets, approvals, policies, signature feed, MiCA export) are in
`src/components/`.
