# Lobster — Stellar dashboard

[![CI](https://github.com/Lobster-Protocol/stellar-integrations/actions/workflows/ci.yml/badge.svg)](https://github.com/Lobster-Protocol/stellar-integrations/actions/workflows/ci.yml)

React frontend that talks to our Soroban contracts on Stellar. Wires up
the wallets, the bridge and the swap routing around the analytics
engine.

Live: https://stellar-integrations-blush.vercel.app

## Stack

React 19, Vite 6, Tailwind v4, TypeScript strict.
`@stellar/stellar-sdk` v14 for Horizon + Soroban RPC.
`@creit-tech/stellar-wallets-kit` v2 via JSR (Freighter, xBull, Albedo,
LOBSTR + WalletConnect).
SDKs in the tree: `@soroswap/sdk`, `@allbridge/bridge-core-sdk`,
`@stellar-broker/client`, `@dfns/sdk`.
`@tanstack/react-query` for caching, `zod` for runtime checks.
Playwright + Vitest.

## Run it

```bash
nvm use                  # Node 24 from .nvmrc
npm install -g yarn      # a transitive postinstall needs yarn on PATH
npm install
npm run dev              # http://localhost:5173
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check then bundle |
| `npm run preview` | Serve the bundle locally |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:unit` | Vitest |
| `npm run test:e2e` | Playwright against the live deploy |
| `npm run probe:rpc` | Sanity-check Stellar RPC reachability |

## Layout

```
src/
  components/   UI: Sidebar, TopBar, DepositModal, charts
  config/       contracts.ts (addresses by network)
  contexts/     Wallet + Network
  integrations/ allbridge, lobster, horizon (SDK wrappers + hooks)
  pages/        Overview, Performance, Activity, Allocation, Bridges, Positions
  data/         Seeded mock for the strategy preview pages
tests/          Playwright suites
scripts/        CLI helpers
```

## House rules

- No address hardcoded outside `src/config/contracts.ts`.
- No secrets committed. `.env*` is gitignored, `.env.example` shows the keys.
- Conventional commits.

## Security

Reports go to security@lobster-protocol.com, not the public issue
tracker. See `SECURITY.md`.
