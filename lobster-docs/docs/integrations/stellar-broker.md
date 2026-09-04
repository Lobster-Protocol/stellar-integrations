# Stellar Broker

Stellar Broker routes a swap across several Stellar DEXs and bundles the legs
into one ledger, so there's no price gap between them. Lobster calls it for the
trade step of a strategy, with a direct Soroswap path as the fallback.

## Setup

`@stellar-broker/client` talks to the broker over a WebSocket the client opens
from an https origin, read from config. The connection needs a partner key;
without it the broker leg is disabled and routing drops straight to the fallback.
The package main field points at a file the bundle doesn't ship, so the build
aliases the import to the esm source. That alias is in both `vite.config.ts` and
`vitest.config.ts`.

## Routing a swap

1. Ask the broker for a quote with selling asset, buying asset and amount.
2. The quote comes back with an estimated output and an equivalent direct-trade
   estimate, so you can see what the routing actually saved.
3. Check the quote against the local guards (slippage ceiling, profit sanity, a
   ratio cap versus the direct trade). A quote that deviates too far is rejected,
   not retried at a worse price.
4. Show the comparison. The dashboard prints the broker estimate next to the
   same size on the direct route and the gap between them, which is the whole
   point of asking the broker.

Confirming through the broker is not wired in the dashboard. `confirmQuote`
needs a quote set over the broker trading socket, and a keyless quote never sets
one, so the confirm always failed and the leg was taken out. The broker answer is
a live price reference; the signable route is the direct Soroswap one below. Our
evidence runner still drives `confirmQuote` with a partner key, outside the app.

## Single ledger, multiple DEXs

The router contract takes the path the broker picked and invokes every leg in one
transaction. A single swap can touch Soroswap and two Aquarius pools in one
invocation, which is verifiable on chain: the protocol of each leg is encoded in
the call arguments. A native SDEX leg is the exception, since an order-book trade
is a classic operation and can't ride inside the Soroban invocation; those go out
as parallel transactions aimed at the same ledger.

Not every quote is multi-DEX. A small amount often routes through a single pool,
so a demo run estimates a few sizes first and only confirms one whose path
crosses two venues.

## Fallback

No route from the broker, a failed connection, no partner key: on any of those,
routing calls the Soroswap router directly through `@stellar/stellar-sdk`, with
no broker SDK in the path. It quotes with `router_get_amounts_out` and swaps with
`swap_exact_tokens_for_tokens`, with a minimum-out floor that refuses a zero.
Nothing pings the broker for health. The choice is made locally, off the selected
network and whether a partner key and a router address exist for it.

## Networks

The broker is mainnet only. There's no testnet broker to point at, so the
best-execution comparison only appears when the network toggle is on mainnet.

Soroswap does run on testnet. The testnet factory and router are wired in
`src/config/contracts.ts`, along with three extra swap tokens on top of XLM and
USDC, each with a Soroswap pool that actually fills. So the direct route
executes on either network, and on testnet routing goes straight to it. Aquarius
has no testnet deployment and stays empty there.

## Where it lives

The client, quote, swap, asset mapping, chain guard and Soroswap fallback are all
under `src/integrations/broker/`. One directory over, `src/integrations/routing/`
has the orchestrator that tries the broker and drops to the fallback. Router and
endpoint addresses come from `src/config/contracts.ts`, per network.
