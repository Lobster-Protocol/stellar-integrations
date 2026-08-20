# Lobster Stellar dashboard

[![CI](https://github.com/Lobster-Protocol/stellar-integrations/actions/workflows/ci.yml/badge.svg)](https://github.com/Lobster-Protocol/stellar-integrations/actions/workflows/ci.yml)

React frontend that talks to our Soroban contracts on Stellar. Wires up
the wallets, the bridge, the swap routing and the DFNS custody backend
around the analytics engine.

Live: https://stellar-instit.lobster-protocol.com

## Contracts (testnet)

The Soroban contracts come from [Lobster-Protocol/Stellar](https://github.com/Lobster-Protocol/Stellar)
(our 2025 Build Award). They're deployed and callable on testnet.

Soroswap, Aquarius and Allbridge are mainnet-only, so testnet ships the
lobster Factory alone. Their addresses live under `mainnet` in
`src/config/contracts.ts`.

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

## Integration proofs

Best-execution routing goes through Stellar Broker, which only runs on mainnet,
so the two routing proofs are mainnet. The DFNS custody proofs are on testnet.

| what | link |
| --- | --- |
| live swap on Soroswap testnet, XLM to USDC, the route the swap modal runs | [`23112a47`](https://stellar.expert/explorer/testnet/tx/23112a4791f2c364874395900401421ec4985bc5b47676bd1947efe7801b7533) |
| multi-DEX route, one Soroswap pool and two Aquarius pools in a single ledger | [`f5a3533f`](https://stellar.expert/explorer/public/tx/f5a3533f2b92a3159d7eedcb443806f6ef998159b39e8556c65fed73d7b4bea6) |
| fallback straight to the Soroswap router, no broker in the path | [`766cd060`](https://stellar.expert/explorer/public/tx/766cd0602dfb2f59f812397331dac4121480c84b6a1104c3462541fb786096e6) |
| Soroban call signed by DFNS MPC, not a local key | [`bd5db00a`](https://stellar.expert/explorer/testnet/tx/bd5db00a38a40327cdf906f27af94afcce39e679fd81d01a93bacf3479f3ef41) |
| DFNS policy, auto-approved under the limit | [`e379a0d3`](https://stellar.expert/explorer/testnet/tx/e379a0d33452495abefce7277fa17324be1d44b506df36203ea2ba8eaa62fc5a) |
| DFNS policy, cleared over the limit only after a second approver | [`90023887`](https://stellar.expert/explorer/testnet/tx/90023887d0980bba1a48309d1236b28e6884a944de0d65cf561dd94e457d2f74) |

## Stack

React 19, Vite 6, Tailwind v4, TypeScript strict.
`@stellar/stellar-sdk` v14 for Horizon + Soroban RPC.
`@creit-tech/stellar-wallets-kit` v2 via JSR (Freighter, xBull, Albedo,
LOBSTR + WalletConnect).
SDKs in the tree: `@allbridge/bridge-core-sdk`, `@stellar-broker/client`,
`@dfns/sdk`. Soroswap is called through its on-chain router via
`@stellar/stellar-sdk`, no dedicated SDK.
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
| `npm run server` | Hono DFNS service: signing, webhook, MiCA export |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc -b` |
| `npm run test:unit` | Vitest |
| `npm run test:e2e` | Playwright against a local preview build (set `PLAYWRIGHT_BASE_URL` for a deploy) |
| `npm run probe:rpc` | Sanity-check Stellar RPC reachability |

## Layout

```
src/
  components/   UI: Sidebar, TopBar, DepositModal, charts
  config/       contracts.ts (addresses by network)
  contexts/     Wallet + Network
  integrations/ allbridge, broker, dfns, evm, horizon, lobster, pricing, routing, signer, stellar, ttl
  pages/        Overview, Performance, Activity, Allocation, Bridges, Positions, Audit
server/         Hono service: DFNS signing, webhook, MiCA export, policies
tests/          Playwright suites
scripts/        CLI helpers
```

## House rules

- No address hardcoded outside `src/config/contracts.ts`.
- No secrets committed. `.env*` is gitignored, `.env.example` shows the keys.

## Security

Found something? Email security@lobster-protocol.com rather than
opening a public issue.
