# Stellar Wallets Kit

The Wallets Kit connects browser wallets to the dashboard. It's the light path: a
desk that doesn't need MPC custody connects directly with Freighter or LOBSTR and
signs from there.

## Setup

The package is `@creit-tech/stellar-wallets-kit` v2. It wraps Freighter, xBull,
Albedo and LOBSTR desktop behind one interface, plus LOBSTR mobile and other
WalletConnect wallets once a project id is set.

## Connecting

The kit opens a modal to pick a wallet. The chosen address and wallet name go
into React context and are mirrored to localStorage so a reload stays connected.
Only the address and the wallet name are stored, never a key or a signed payload.

## Signing

`signTransaction` takes the XDR and an options object with the network passphrase
and address, and returns the signed XDR. The dashboard submits that to Soroban RPC and polls for
inclusion. The "Sign a testnet transaction" panel on `/positions` is the
reference round trip, and its button reads "Call the Factory with" followed by
the connected wallet's name.

## One signer interface

The kit sits behind the same `Signer` interface as DFNS. The execution code calls
`signTransaction` without caring which one is active; the custody toggle decides.
That's what lets a small desk and a regulated one share the same path.

The wallet context and the kit wiring live in `src/contexts`, the signing demo in
`src/components/SignDemoTx.tsx`, and the shared signer interface in
`src/integrations/signer/`.
