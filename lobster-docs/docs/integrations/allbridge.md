# Allbridge Core

Allbridge Core bridges USDC from an EVM chain to Stellar. Lobster uses it for
capital inflow.

Skip to the pool section if you came here to move money today. The USDC pool on
the Stellar side is closed, so nothing completes.

## Setup

The SDK is `@allbridge/bridge-core-sdk`. It's initialised once with the RPC URLs
for Stellar and each supported EVM chain (Ethereum, Arbitrum, BNB), read from
config rather than inlined.

## Bridging in

1. Look up the USDC token on both chains with `tokensByChain`.
2. Open the Stellar trustline if it's missing (see the onboarding guide), and
   confirm it before sending.
3. On the source chain, check the ERC-20 allowance and build an approve tx if it
   falls short.
4. Build the bridge send with `rawTxBuilder.send`, messenger set to Allbridge.
   CCTP isn't supported for Stellar.
5. Broadcast on the source chain. That tx hash is the EVM-side proof.
6. The Allbridge relayer delivers USDC on Stellar. The client makes no Soroban
   call here. Delivery time comes from the SDK for that corridor rather than a
   figure we invent, and when the SDK gives none we show none.

## The Stellar USDC pool is closed

Allbridge has parked the USDC pool on the Stellar side. A live pool carries a
`feeShare` around 0.003; this one reads 0.9999, which is Allbridge's marker for a
disabled pool and takes anything you send down to zero. `transferTime` for
Stellar comes back empty on every corridor, and the pool read from chain is
heavily drained.

So `quoteBridge` refuses before the SDK can throw its own "amount must be greater
than zero". It checks `feeShare` first and fails closed: at or above 0.5, or
unreadable, the quote stops with "The Allbridge USDC pool into Stellar is closed
right now. Bridging will work again once the pool reopens." Reopening it is
Allbridge's decision, not something in this codebase.

The quote itself reads the pool from chain, through
`getAmountToBeReceivedFromChain`, because the token list ships an empty
`poolInfo` and the plain call underflows to zero even on a healthy pool.

On testnet there is no Allbridge network at all and no USDC on Stellar testnet,
so the dashboard offers a walkthrough instead. It is badged in the UI as
"Simulation - no funds moved" and the mainnet path is untouched by it.

## Fees and amounts

Gas is paid in the source-chain native token by default, or deducted from the
amount in USDC. With the stablecoin option the amount you pass is the gross, fee
included. The stablecoin fee runs under a dollar, so very small transfers don't
pay off.

## Decimals

USDC is six decimals on Ethereum and Arbitrum, seven on Stellar, eighteen on BNB;
the SDK converts when it builds the transfer. BNB is refused on our side because
the allowance scaling on the send path assumes six decimals, so the corridors are
Ethereum and Arbitrum.

## Where it lives

`src/integrations/allbridge/` holds the client, the quote and send builders, the
trustline helpers, and the testnet walkthrough in `simulate.ts`. The EVM
broadcast is in `src/integrations/evm/send.ts`. Canonical addresses (the USDC
contract, bridge, pool, and issuer) sit in `src/config/contracts.ts`, keyed by
network. There is no outbound leg from Stellar back to EVM. That code was never
written, so nothing here covers it.
