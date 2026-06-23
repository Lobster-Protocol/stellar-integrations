# Allbridge Core

Allbridge Core bridges USDC from an EVM chain to Stellar. Lobster leans on it
two ways: capital inflow, and topping up the arbitrage reserve.

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
   call here; the funds land in about two minutes.

## Fees and amounts

Gas is paid in the source-chain native token by default, or deducted from the
amount in USDC. With the stablecoin option the amount you pass is the gross, fee
included. The stablecoin fee runs under a dollar, so very small transfers don't
pay off.

## Decimals

USDC is six decimals on Ethereum and Arbitrum, seven on Stellar, eighteen on BNB;
the SDK converts when it builds the transfer. The arbitrage outbound leg, Stellar
back to EVM, isn't wired yet.

## Where it lives

`src/integrations/allbridge/` holds the client, the quote and send builders, the
trustline helpers, and the arb-reserve. The EVM broadcast is in
`src/integrations/evm/send.ts`. Canonical addresses (the USDC contract, bridge,
pool, and issuer) sit in `src/config/contracts.ts`, keyed by network.
