# Allbridge Core

Allbridge Core was the first way we brought USDC from an EVM chain onto Stellar.
It no longer can, and the bridge now runs on [Circle CCTP](bridge.md). This page
says what changed and what is left of the integration.

## What changed on Allbridge's side

Three things, all visible from outside:

- The API moved. The SDK version we ship calls `core.api.allbridgecoreapi.net`,
  and that domain no longer resolves. The live API is `api.core.allbridge.io`.
- The pools are gone. Every token in the catalogue now comes back with no pool
  address, on every chain, and the SDK marks its own `ALLBRIDGE` messenger as
  deprecated.
- There's no route into Stellar. Allbridge now routes through CCTP where it can,
  and the Stellar USDC token is the only one in its catalogue without a CCTP
  address, so the SDK refuses the route whatever messenger you ask for.

## What we kept

The client, the quote and the transaction builders are still in the code, on
both the browser and the server side, with their tests. We point the SDK at the
live API host, and the guard before a quote or a send now checks that a Stellar
pool exists at all. It used to read the pool fee instead, and a fee of zero on a
pool that isn't there passed. When the route is missing, the answer is a plain
sentence saying Allbridge no longer carries USDC into Stellar, never a transfer
that cannot land.

Nothing in the dashboard calls it anymore. The `/bridges` page links to
Allbridge for assets and chains that CCTP doesn't carry.

## If Allbridge lists Stellar again

The guard is the switch. Once the Stellar token has a pool, or a CCTP address
the SDK accepts, quotes go through again and the module can be put back behind
a form.

## Where it lives

`src/integrations/allbridge/` and `server/allbridge/`. The `/allbridge/*` routes
still answer, with the same guard in front. The bridge that runs today is on the
[bridge page](bridge.md).
