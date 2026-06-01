# Lobster Stellar dashboard

[![CI](https://github.com/Lobster-Protocol/stellar-integrations/actions/workflows/ci.yml/badge.svg)](https://github.com/Lobster-Protocol/stellar-integrations/actions/workflows/ci.yml)

React frontend that talks to our Soroban contracts on Stellar. Wires up
the wallets, the bridge and the swap routing around the analytics
engine.

Live: https://stellar-instit.lobster-protocol.com

## Contracts (testnet)

The Soroban contracts come from [Lobster-Protocol/Stellar](https://github.com/Lobster-Protocol/Stellar)
(our 2025 Build Award). They're deployed and callable on testnet.

| what | link |
| --- | --- |
| Factory | [`CACIPDGS...2LXO`](https://stellar.expert/explorer/testnet/contract/CACIPDGSEGB3C5FHINR3S5V6F7BMVH5IWVQ2U3BUHHTP4BVSRRPE2LXO) |
| deploy | [`f30b3152`](https://stellar.expert/explorer/testnet/tx/f30b315298668c4cc4d9e38856014b0cfcafe6d8179118637684afd0e51e78b1) |
| create_pool | [`a200fdd2`](https://stellar.expert/explorer/testnet/tx/a200fdd22fb95283ca5f13733fdb3cad8aff1a2bcc1993ad31413c35afab39da) |
| signed via Freighter (Ping from /positions) | [`28f03cbb`](https://stellar.expert/explorer/testnet/tx/28f03cbbbb4d8d5b109ef9f944cda71039f4bee7f43db36df23098de24947b10) |
| signed via xBull (Ping from /positions) | [`0593e786`](https://stellar.expert/explorer/testnet/tx/0593e786078f1f71a476c2705fcf1fbf122ce2e479e7ebff144503560ebe3af2) |

Read the state back yourself:

```bash
stellar contract invoke --id CACIPDGSEGB3C5FHINR3S5V6F7BMVH5IWVQ2U3BUHHTP4BVSRRPE2LXO \
  --source <funded-testnet-key> --network testnet -- get_pool_count
# 1
```

## Stack

React 19, Vite 6, Tailwind v4, TypeScript strict.
`@stellar/stellar-sdk` v14 for Horizon + Soroban RPC.
`@creit-tech/stellar-wallets-kit` v2 via JSR (Freighter, xBull, Albedo,
LOBSTR + WalletConnect).
SDKs in the tree: `@soroswap/sdk`, `@allbridge/bridge-core-sdk`.
`@tanstack/react-query` for caching, `zod` for runtime checks.
Playwright + Vitest.

## Run it

```bash
nvm use                  # Node 24 from .nvmrc
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

Found something? Email security@lobster-protocol.com rather than
opening a public issue.
