# Stellar Broker

Stellar Broker routes a swap across several Stellar DEXs and bundles the legs
into one ledger, so there's no price gap between them. Lobster asks it for the
best route on every mainnet swap and shows that route next to the direct Soroswap
one. The direct route is the one your wallet signs.

## Setup

`@stellar-broker/client` gets a quote over plain https with no key, and trades
over a WebSocket it opens on the same https origin. That socket needs a partner
key, and the swap panel never opens it: the broker answer is a price reference and
the swap runs on the direct Soroswap route, whether or not the build carries a
partner key. The package main field points at a file the bundle
doesn't ship, so the build aliases the import to the esm source. That alias is
in both `vite.config.ts` and `vitest.config.ts`.

## Routing a swap

1. Ask the broker for a quote with selling asset, buying asset and amount.
2. The quote comes back with an estimated output and an equivalent direct-trade
   estimate, so you can see what the routing saved.
3. Check the quote against the local guards (slippage ceiling, profit sanity, a
   ratio cap versus the direct trade). A quote that deviates too far is rejected,
   not retried at a worse price.
4. Show the comparison. The dashboard prints the broker estimate next to the
   same size on the direct route and the gap between them, which is the whole
   point of asking the broker.

The dashboard does not confirm through the broker. `confirmQuote`
needs a quote set over the broker trading socket, and a keyless quote never sets
one, so the confirm always failed and the leg was taken out. The broker answer is
a live price reference; the signable route is the direct Soroswap one below.

## Single ledger, multiple DEXs

The router contract takes the path the broker picked and invokes every leg in one
transaction. A single swap can touch Soroswap and two Aquarius pools in one
invocation, which is verifiable on chain: the protocol of each leg is encoded in
the call arguments. A native SDEX leg is the exception, since an order-book trade
is a classic operation and can't ride inside the Soroban invocation; those go out
as parallel transactions aimed at the same ledger.

Not every quote is multi-DEX. A small amount often routes through a single pool,
and it takes a larger size before the path crosses two venues.

## The signed route

The swap calls the Soroswap router directly through `@stellar/stellar-sdk`, with
no broker SDK in the path. It quotes with `router_get_amounts_out` and swaps with
`swap_exact_tokens_for_tokens`, with a minimum-out floor that refuses a zero. A
broker that has no route, fails to answer or quotes something the guards reject
only takes the comparison away; the swap itself is unaffected. Nothing pings the
broker for health. What shows is decided locally, off the selected network and
whether a router address exists for it.

## Networks

The broker is mainnet only. There's no testnet broker to point at, so the
best-execution comparison only appears when the network toggle is on mainnet.

Soroswap does run on testnet. The testnet factory and router are set in
`src/config/contracts.ts`, along with three extra swap tokens on top of XLM and
USDC, each with a Soroswap pool that actually fills. So the direct route
executes on either network, and on testnet routing goes straight to it. Aquarius
has no testnet deployment and stays empty there.

## Where it lives

The client, quote, swap, asset mapping, chain guard and Soroswap fallback are all
under `src/integrations/broker/`. One directory over, `src/integrations/routing/`
has the orchestrator that asks the broker for its quote and builds the Soroswap
leg next to it. Router and
endpoint addresses come from `src/config/contracts.ts`, per network.
