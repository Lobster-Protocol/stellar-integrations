# Stellar Wallets Kit

The Wallets Kit connects browser wallets to the dashboard. It's the light path: a
desk that doesn't need MPC custody connects directly with Freighter or LOBSTR and
signs from there.

## Setup

The package is `@creit-tech/stellar-wallets-kit` v2. It wraps Freighter, xBull,
Albedo and LOBSTR desktop behind one interface, plus LOBSTR mobile and other
WalletConnect wallets once a project id is set.

## Connecting

The kit opens a modal to pick a wallet. The chosen address, the wallet name and
the kit's id for that wallet go into React context and are copied to
localStorage so a reload stays connected. Only those three are stored, never a
key or a signed payload.

## Signing

`signTransaction` takes the XDR and an options object with the network passphrase
and address, and returns the signed XDR. The dashboard submits that to Soroban
RPC and polls for inclusion. The "Sign a testnet transaction" panel on `/audit`
is the reference round trip, and its button reads "Call the Factory with"
followed by the connected wallet's name.

A transaction is built to stay valid a minute for a vault action, three minutes
for a swap or a bridge step, when the wallet signs at once. A wallet reached over
WalletConnect gets ten: WalletConnect waits five minutes for its answer, and a
DFNS wallet holds a signature until its approver acts. The window says to approve
within five minutes, and if no answer comes, that nothing was signed or sent. A
DFNS policy whose only approver is the person who started the signature can never
approve it; it needs a second approver.

## One signer interface

Execution code calls `signTransaction` without knowing which signer answers. The kit
and DFNS implement the same `Signer` interface, and the custody mode decides
which one answers; the wallet / DFNS switch on the sign panel sets it. A desk on
a browser extension and a desk on an MPC treasury end up running the same path.

The wallet context and the kit setup are in `src/contexts`, the signing panel in
`src/components/SignDemoTx.tsx`, and the shared signer interface in
`src/integrations/signer/`.
