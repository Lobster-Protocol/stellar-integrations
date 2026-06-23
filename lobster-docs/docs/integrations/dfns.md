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
itself; for a Soroban call that DFNS doesn't submit, the signed envelope comes
back for the service to submit through its own RPC. The passphrase is derived
server side from the configured network, and a request whose passphrase disagrees
is rejected, so a caller can't trick the signer onto the wrong network.

## The sign guard

The sign route is fail-closed. With no shared token set it refuses to sign; with
no guard configured it refuses too. Every envelope has to source from the treasury
account. Operations are held to an allowlist: payment, path payment, bump sequence.
Destinations are checked against a whitelist, and the amount is capped. Soroban
calls from the treasury are deliberately out of that allowlist,
since an invocation could move funds through a token contract without tripping the
destination or amount checks; they're rejected today, and a contract-allowlist
path for them is planned.

## Policies and approval

A policy sets a USD threshold. Below it a signature clears on its own; above it
the request waits for an approver to decide before it broadcasts. The person who
triggers a request can't approve their own, so the automated leg and the approval
leg use separate identities. The approval state streams to the dashboard.

## Webhooks and audit

DFNS posts webhook events for signatures and approvals. The service verifies the
HMAC signature in constant time, drops replays outside a time window, and
de-duplicates on the event id, then forwards a metadata-only frame to the
dashboard over SSE. The raw payload, which carries signed envelopes and approver
identities, never leaves the server. Wallet transaction and transfer events export as a
MiCA-shaped audit log, chained record to record so the export verifies end to end.

## Where it lives

`server/dfns/` holds the client, signing, policies, approvals and the sign guard;
`server/webhook.ts` holds the routes, HMAC check and SSE. The browser signer is
`src/integrations/signer/dfns-signer.ts`, and the dashboard panels (wallets,
approvals, policies, signature feed, MiCA export) are in `src/components/`.
