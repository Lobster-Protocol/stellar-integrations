# Architecture

Short overview of how the dashboard is wired.

## High-level layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (React 19 + Vite 6 + Tailwind v4)                       │
│                                                                   │
│  ┌───────────────────────┐    ┌──────────────────────────────┐  │
│  │ NetworkContext         │    │ WalletContext                │  │
│  │ testnet / mainnet      │───▶│ StellarWalletsKit v2 init    │  │
│  │ localStorage persist   │    │ Freighter/xBull/Albedo/LOBSTR│  │
│  └───────────────────────┘    └──────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ react-query (cache, retry, refetch policy)                  │  │
│  └────────────────────────────────────────────────────────────┘  │
│      │              │              │                              │
│      ▼              ▼              ▼                              │
│  ┌────────┐    ┌─────────┐    ┌─────────┐                       │
│  │ Lobster │   │Horizon  │   │Allbridge │                       │
│  │ Factory │   │balances │   │Core SDK  │                       │
│  │ (Soroban│   │+ ops    │   │(bridge)  │                       │
│  │  RPC)   │   │         │   │          │                       │
│  └────┬────┘    └────┬────┘    └────┬─────┘                     │
└───────┼───────────────┼───────────────┼─────────────────────────┘
        │               │               │
        ▼               ▼               ▼
   Soroban RPC      Horizon         Allbridge Core
                                    (mainnet only)
```

## Module map

```
src/
  config/contracts.ts        Single source of truth for every C-address
                             and G-address (per network).
  contexts/
    NetworkContext.tsx       testnet/mainnet toggle + RPC URL derivation
    WalletContext.tsx        Wallets Kit v2 init + setNetwork on toggle
  integrations/
    lobster/                 Soroban Factory client (read+write paths)
    allbridge/               Allbridge Core SDK wrappers
    horizon/                 Horizon balances + operation history
  components/                Visual primitives + DepositModal +
                             SignDemoTx + BalancesCard + OnChainActivityCard
  pages/
    Overview                 Strategy preview (seeded mock)
    Performance / Activity / Allocation / Bridges   Strategy preview
    Positions                Live on-chain reads + signing demo
  data/mock.ts               Deterministic seeded PRNG, 180 days
  utils/format.ts            shortenAddress, cn, timeSince, formatBalance
```

## Key decisions

### Soroban-side singleton servers
`getSorobanServer(network)` and `getHorizonServer(network)` cache one
instance per network. Toggling network re-uses the cache; tests reset
it via the `_reset*ForTests` helpers.

### Reads vs writes
- Reads go through `simulateTransaction`. No signing, no fee, no
  on-chain footprint. The Factory's view functions (`get_admin`,
  `get_wasm_hash`, `get_pool_count`, `get_pools_by_user`) are all
  simulated against a public source account.
- Writes follow the canonical Soroban pattern: build, simulate,
  `rpc.assembleTransaction`, user signs via Wallets Kit,
  `sendTransaction`, poll `getTransaction`. Errors raised include
  `RestoreRequiredError` (archived state) and `TryAgainLaterError`
  (RPC overloaded).

### Address discipline
No raw C-address or G-address may appear in source code outside
`src/config/contracts.ts`. The only exception is `TESTNET_READ_SOURCE`
in `factory.ts`, the public deployer G-address used purely as a
simulation source.

### Bundle split
`vite.config.ts` `manualChunks` puts heavy libraries each in their own
chunk so they're cacheable across navigations and deployments:
- `stellar-sdk` (~2 MB)
- `allbridge-sdk` (~3.5 MB, lazy via DepositModal)
- `recharts` (~330 KB)
- `wallets-kit` (~150 KB)

Initial JS payload is around 280 KB / 90 KB gzip.

### State persistence
- `localStorage.lob_addr` + `lob_wname`: last connected wallet, used to
  rehydrate the TopBar on refresh.
- `localStorage.lob_network`: testnet/mainnet toggle. Validated against
  the union on read; invalid values fall back to testnet.

### Lazy loading
Every route is `React.lazy()`'d via `src/App.tsx`. The DepositModal is
lazy-loaded inside Overview so the Allbridge SDK chunk only ships when
the user actually opens the deposit flow.
