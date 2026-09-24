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
difference between funds arriving and funds stuck halfway.

## Getting the capital across

Capital on Ethereum, Base or Arbitrum can't reach Stellar directly. Lobster
moves USDC across with Circle's Cross-Chain Transfer Protocol (CCTP), live on
Stellar since May 2026. There's no pool and no wrapped token in between: USDC is
burned on the source chain, Circle signs the burn, and the burned amount, less
Circle's fee on a fast transfer, is minted as native USDC on Stellar.

The shape is approve, then burn on the source chain, then wait for Circle's
signature, then one call on Stellar that delivers. That last call needs no
signature from the account being paid, so a desk whose treasury never signs from
a browser can still receive: whoever pays the network fee can submit it. A fast
transfer costs a few basis points and lands in about a minute. A standard one is
free and waits for the source chain to finalise.

This leg was first built on Allbridge Core. Allbridge has since removed its
pools, the Stellar one included, and lists no route into Stellar, so that
integration stays in the code but out of the path. The
[bridge page](integrations/bridge.md) has the detail.

The part of this worth copying is the bookkeeping. Between the burn and the
delivery the money is in neither account, and nothing on either chain will
remind anyone. Keep a note of every burn until its delivery lands.

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

The last step is the allocation itself: the engine routes a swap and opens an
LP position, signed through the custody layer. The dashboard shows the position
once the ledger settles.
