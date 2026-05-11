# Environment Variables

The dashboard reads its configuration from Vite-style env variables.
Anything prefixed `VITE_` is **bundled into the client JavaScript** and
visible to every visitor — never put a secret there.

For Vercel deployments, set these via `Project → Settings → Environment
Variables` (Production + Preview + Development).

## Required

| Variable | Default | What it does |
| --- | --- | --- |
| `VITE_DEFAULT_NETWORK` | `testnet` | First-load network for `NetworkContext`. Allowed: `testnet`, `mainnet`. Anything else is rejected and falls back to `testnet`. |

## Optional — Stellar RPC endpoints (public)

| Variable | Default | What it does |
| --- | --- | --- |
| `VITE_STELLAR_RPC_TESTNET` | `https://soroban-testnet.stellar.org` | Soroban RPC URL used on testnet. Override to use a custom provider (Ankr, NowNodes, self-hosted). |
| `VITE_STELLAR_RPC_MAINNET` | `https://mainnet.sorobanrpc.com` | Soroban RPC URL used on mainnet. Same as above. |
| `VITE_HORIZON_TESTNET` | `https://horizon-testnet.stellar.org` | Horizon endpoint used for classic-side reads (balances, operation history, trustline check). |
| `VITE_HORIZON_MAINNET` | `https://horizon.stellar.org` | Horizon endpoint on mainnet. |

## Optional — EVM RPC endpoints (for Allbridge source chains)

The Allbridge Core SDK needs an RPC URL for every chain it might bridge
*from*. These are public-by-design (used only to read balances and build
unsigned transactions; signing happens client-side via the user's EVM
wallet).

| Variable | Default | What it does |
| --- | --- | --- |
| `VITE_ETH_RPC` | `https://rpc.ankr.com/eth` | Ethereum mainnet RPC. |
| `VITE_ARB_RPC` | `https://rpc.ankr.com/arbitrum` | Arbitrum One RPC. |
| `VITE_BSC_RPC` | `https://rpc.ankr.com/bsc` | BNB Chain RPC. |

## Optional — WalletConnect

| Variable | Default | What it does |
| --- | --- | --- |
| `VITE_WALLETCONNECT_PROJECT_ID` | _(empty)_ | Project id from `https://cloud.reown.com`. Public by design — used as a rate-limit key. When unset, the WalletConnect module is not registered and LOBSTR mobile / multi-wallet QR pairing is unavailable. Freighter, xBull, Albedo, LOBSTR (desktop extension) keep working. |

## Optional — Lobster backend

| Variable | Default | What it does |
| --- | --- | --- |
| `VITE_ANALYTICS_API_URL` | `http://localhost:8085` | Base URL of the off-chain analytics engine. Not wired into the dashboard today; every page uses seeded mock data or live Soroban reads. |

## Conventions

- **Never** create a `VITE_*` variable that holds a secret. The build
  inlines it into the public JS bundle.
- For server-side secrets (none today), use unprefixed env variables and
  read them only from server functions / build scripts.
- The list of all VITE_ vars currently consumed by the source can be
  audited with `rg "import\.meta\.env\.VITE_" src`.
