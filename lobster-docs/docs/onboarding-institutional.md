# Institutional onboarding

This is the path a regulated desk follows to put capital to work on Stellar
through Lobster: a trustline before any money moves, a bridge to get the capital
across, and custody a risk team will sign off on. Almost none of that is
specific to us. Build the same thing on another stack and you still need those
pieces, in roughly that order.

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

## Getting the capital across

Capital on Ethereum or Arbitrum can't reach Stellar directly. Allbridge Core
moves USDC across, and Lobster embeds its SDK in the execution path.

The shape is quote, then approve on the source chain, then send. The quote tells
you what lands net of the bridge fee and the source-chain gas. Below about a
dollar the stablecoin fee eats the transfer, so there's a floor worth enforcing.
The messenger is Allbridge's own; CCTP isn't a Stellar path. Decimals differ by
chain, six on Ethereum and Arbitrum against seven on Stellar, and the SDK
converts when it builds the transfer.

The Allbridge USDC pool into Stellar is closed at the moment, so the quote step
stops with a clear message rather than building a transfer that cannot land. The
integration page has the detail.

The part of this worth copying is the fee arithmetic. Work out the size below
which a transfer doesn't pay for itself, and enforce it, before you wire up any
of the SDK calls.

## MPC custody for regulated capital

A single private key is a non-starter under MiCA or any institutional risk
policy. DFNS holds the keys as threshold shares, so no node ever has the whole
key, and signing sits behind an approval policy.

Every signature Lobster produces goes through that layer, and the policy is what
decides when a human has to step in. Below a configured amount a transfer clears
on its own. At or above it a named approver has to release it, and that can
never be the identity that opened the request, so a held transfer always ends up
touching two people. The amount is env config rather than code, and ours is set
so that most transfers take the approval path. Releasing a held request is an
operator action, taken in the dashboard panel or in the DFNS console; a visitor
reading the dashboard can't do it.

Destinations are whitelisted independently of the key material, so a compromised
service account still can't send funds to an unknown address. Every signature
event streams to the dashboard and into an audit log built for MiCA reporting.

The signer is an interface. The same execution code runs against a connected
browser wallet or against DFNS, so changing custody doesn't change the strategy.

## A full allocation

Chained together that's one flow: custody wallet open, trustline in place, USDC
across the bridge, then the engine routes the swap and opens an LP position,
signed through the custody layer. The dashboard shows the position once the
ledger settles.
