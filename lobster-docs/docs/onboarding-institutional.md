# Institutional onboarding

This is the path a regulated desk follows to put capital to work on Stellar
through Lobster: custody first, then a bridge in, then an allocation. The three
pieces below are meant to be reused. If you run institutional capital and want it
on Stellar, you need all three, whatever your stack looks like.

## Trustline before any inflow

A Stellar account can't hold an asset it hasn't trusted. Bridge USDC to an
account with no USDC trustline and the funds bounce. So the trustline is opened
and confirmed before anything is sent.

In Lobster that's `hasTrustline`, then `buildTrustlineXdr`, then submit, all
before the bridge transaction goes out. The check reads Horizon balances; the
change-trust op targets the classic USDC issuer, not the Soroban contract. A
fresh account on mainnet that 404s on lookup is read as "no trustline yet", not
as an error.

Any team bridging a non-native asset to Stellar needs this guard. It's the
difference between funds arriving and funds stuck at the bridge.

## The cross-chain bridge layer

Capital on Ethereum or Arbitrum can't reach Stellar directly. Allbridge Core
moves USDC across, and Lobster embeds its SDK in the execution path.

The shape is quote, then approve on the source chain, then send. The quote tells
you what lands net of the bridge fee and the source-chain gas. Below about a
dollar the stablecoin fee eats the transfer, so there's a floor worth enforcing.
The messenger is Allbridge's own; CCTP isn't a Stellar path. Decimals differ by
chain, six on Ethereum and Arbitrum against seven on Stellar, and the SDK
converts when it builds the transfer.

The institutional angle here is the fee model and the minimum that makes a bridge
worth doing, not the mechanics. Those are stable.

## MPC custody for regulated capital

A single private key is a non-starter under MiCA or any institutional risk
policy. DFNS holds the keys as threshold shares, so no node ever has the whole
key, and signing sits behind an approval policy.

Lobster routes every signature through a custody layer. Below a configured
threshold a transaction auto-approves in seconds; above it, named approvers sign
off from the dashboard. Destinations are whitelisted independently of the key
material, so a compromised service account still can't send funds to an unknown
address. Every signature event streams to the dashboard and into an audit log
built for MiCA reporting.

The signer is an interface, so the same execution code runs against a connected
browser wallet for a small desk or against DFNS for a regulated one. Changing
custody doesn't change the strategy.

## A full allocation

A live allocation chains the three: open custody, bridge capital in, then let the
engine route the swap and open an LP position, signed through the custody layer.
The dashboard shows the position once the ledger settles.
