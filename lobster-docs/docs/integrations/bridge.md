# Bridging USDC in

USDC comes onto Stellar from an EVM chain through Circle's Cross-Chain Transfer
Protocol (CCTP V2). Circle has run it on Stellar since May 2026, on testnet and
mainnet, so the whole path can be tried with test USDC before any real money
moves.

## How a transfer runs

1. The Stellar account that will receive opens a USDC trustline. Without one the
   last step fails, so the dashboard checks it before anything else.
2. On the source chain, the wallet approves Circle's `TokenMessengerV2` for the
   exact amount. Never an open-ended allowance.
3. The same wallet calls `depositForBurnWithHook`. The USDC is burned and the
   burn hash is the EVM-side proof.
4. Circle's attestation service signs the burn. We ask for it by burn hash at
   `/v2/messages/{sourceDomain}`, straight from the browser.
5. On Stellar, one call to `mint_and_forward` on Circle's `CctpForwarder` mints
   the USDC and pays the account.

Step 5 carries no authorization entry. Whoever pays its fee can submit it, and
the account being paid never signs. The dashboard has the connected wallet do
it, which costs a few hundredths of an XLM and moves none of its funds.

## Why the forwarder

A CCTP message names who receives the mint as 32 raw bytes, and Circle's
Stellar contract reads those bytes as a contract id. There's no way to say "this
is a G account". So the burn names the forwarder as the mint recipient, and puts
the real destination in the hook data:

```
bytes 0-23   zero, meaning we finish the transfer ourselves
bytes 24-27  hook version, 0
bytes 28-31  length of the address
bytes 32+    the G or M address, as text
```

The forwarder mints to itself and pays that address in the same call. It also
pays muxed M addresses, which is handy for a sub-account.

## Fast or standard

A fast transfer asks Circle to sign before the source chain finalises. It costs
a few basis points, read live from `/v2/burn/USDC/fees/{src}/27`, and lands in
about a minute. A standard transfer is free and waits for finality, which can
take a quarter of an hour on Ethereum. The burn declares a `maxFee` with some
headroom; Circle charges what it actually takes, not the ceiling.

## Chains

Base, Arbitrum and Ethereum, and their Sepolia testnets. Circle's contracts sit
at the same address on every EVM chain of a network, and every id we use was
read back from the chains themselves. They live in `src/config/contracts.ts`
under `cctp` and `CCTP_SOURCE_CHAINS`. Stellar is CCTP domain 27.

On testnet, the USDC that CCTP mints is Circle's test asset, issuer
`GBBD47IF...LFLA5`. It is not the test USDC the Soroswap pools use, so it has its
own entry in the config.

## When a transfer stops halfway

Between the burn and the delivery the money is in neither account, and nothing
on either chain will remind anyone. The dashboard keeps a note of each burn in
the browser and lists the unfinished ones on `/bridges`, where one click picks
the transfer back up at Circle's signature. The note holds hashes and addresses,
never a key, and losing it loses nothing: the burn is on chain and Circle will
still sign it.

A fast transfer's message expires after roughly a day of Stellar ledgers. Past
that it needs a fresh signature from Circle before it can be delivered.

## From a server

The same service that runs the DFNS routes exposes the bridge for anyone who
wants plain HTTP:

| Route | What it does |
| --- | --- |
| `GET /cctp/chains?network=` | the source chains and their contracts |
| `GET /cctp/fees?network=&domain=` | Circle's fast and standard fees toward Stellar |
| `GET /cctp/message?network=&domain=&txHash=` | where a burn stands, and who it pays |
| `POST /cctp/deliver` | runs step 5 and pays the fee from our account |

The delivery route is behind the operator token and shut unless a relay key is
configured. It never takes the message from the caller. It asks Circle by burn
hash, checks that the transfer pays the account the caller named through the
forwarder of the network the caller named, and only then submits. It's meant for
an account that doesn't sign from a browser, a custody treasury for example.

## Limits

CCTP carries USDC and nothing else. For another asset, or a chain Circle doesn't
reach, `/bridges` links out to Allbridge, StellarX, Aquarius and Stellar anchors
instead of pretending.

## Where it lives

`src/integrations/cctp/` holds the hook encoding, the message decoder, the EVM
burn, the attestation client, the Stellar delivery and the local record of
transfers. The form is `src/components/BridgeModal.tsx`, the page is
`src/pages/Bridges.tsx`, and the server side is `server/cctp/`.
