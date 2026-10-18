# Allbridge Core

Allbridge Core has no route that carries USDC from an EVM chain onto Stellar, so
the bridge runs on [Circle CCTP](bridge.md). The Allbridge code stays in the
tree, behind a guard, in case the route comes back.

## Why there's no route

From outside, on Allbridge's side:

- The SDK version we ship calls `core.api.allbridgecoreapi.net`, and that domain
  doesn't resolve. The live API is `api.core.allbridge.io`.
- Every token in the catalogue comes back with no pool address, on every chain,
  and the SDK marks its own `ALLBRIDGE` messenger as deprecated.
- Allbridge routes through CCTP where it can, and the Stellar USDC token is the
  only one in its catalogue without a CCTP address, so the SDK refuses the route
  whatever messenger you ask for.

## What the code does

The client, the quote and the transaction builders are in the code, on both the
browser and the server side, with their tests. The SDK is pointed at the live API
host, and a guard in front of every quote and send checks that a Stellar pool
exists at all. Without one the answer is a plain sentence saying Allbridge
doesn't carry USDC into Stellar, never a transfer that cannot land.

The dashboard doesn't call it. The `/bridges` page links to Allbridge for assets
and chains that CCTP doesn't carry.

## If Allbridge lists Stellar again

The guard is the switch. Once the Stellar token has a pool, or a CCTP address
the SDK accepts, quotes go through and the module can be put back behind a form.

## Code

`src/integrations/allbridge/` and `server/allbridge/`. The `/allbridge/*` routes
answer, with the same guard in front of the quote and send routes. The bridge in
use is on the [bridge page](bridge.md).
