# Stellar Broker

Stellar Broker routes a swap across several Stellar DEXs and bundles the legs
into one ledger, so there's no price gap between them. Lobster calls it for the
trade step of a strategy, with a direct Soroswap path as the fallback.

## Setup

The SDK is `@stellar-broker/client`. It connects over a WebSocket that the client
opens from an https origin, read from config. The connection needs a partner key;
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
4. Confirm. The broker hands back each leg as an unsigned envelope for the signer,
   then a per-leg hash through the sign callback once it's accepted. The hash
   isn't in the final event, so it has to be captured at sign time.

## Single ledger, multiple DEXs

The router contract takes the path the broker picked and invokes every leg in one
transaction. A single swap can touch Soroswap and two Aquarius pools in one
invocation, which is verifiable on chain: the protocol of each leg is encoded in
the call arguments. A native SDEX leg is the exception, since an order-book trade
is a classic operation and can't ride inside the Soroban invocation; those go out
as parallel transactions aimed at the same ledger.

Not every quote is multi-DEX. A small amount often routes through a single pool,
so the evidence run estimates a few sizes first and only confirms one whose path
crosses two venues.

## Fallback

When the broker has no route or the connection fails, routing calls the Soroswap
router directly through `@stellar/stellar-sdk`, no broker SDK involved. It quotes
with `router_get_amounts_out` and swaps with `swap_exact_tokens_for_tokens`, with
a minimum-out floor that refuses a zero. The connection failure is the trigger;
there's no separate health ping.

## Networks

The broker is mainnet only, and Soroswap has no testnet router, so both the
best-execution path and its fallback run on mainnet. There's no testnet broker to
point at.

## Where it lives

`src/integrations/broker/` holds the client, quote, swap, asset mapping, the
chain guard and the Soroswap fallback. `src/integrations/routing/` holds the
orchestrator that tries the broker then drops to the fallback. The router and
endpoint addresses sit in `src/config/contracts.ts`, keyed by network.
