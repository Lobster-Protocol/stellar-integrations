# Lobster Protocol — Stellar Integrations

Institutional liquidity management dashboard for Stellar DEXs. Built as part of the SCF Integration Track submission.

This dashboard connects to the Lobster analytics engine and provides portfolio monitoring, performance tracking, and cross-DEX liquidity management for institutional clients operating on Soroswap, Aquarius, and Phoenix.

## What this repo covers

This is the frontend layer of the Integration Track submission. It demonstrates wallet connectivity and the institutional dashboard UI. The four ecosystem integrations it prepares for:

- **Allbridge Core** — programmatic USDC bridging from EVM chains to Stellar
- **Stellar Broker** — best-execution swap routing across all Stellar liquidity sources
- **DFNS** — MPC wallet infrastructure for institutional custody
- **Stellar Wallets Kit** — direct wallet connectivity (Freighter, xBull, Albedo)

The existing Stellar infrastructure (DEX indexer, AMM V2 analytics engine, Soroban smart contracts) was built under the 2025 SCF Build Award and lives in the [main Stellar repo](https://github.com/Lobster-Protocol/Stellar).

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Building for production

```bash
npm run build
npm run preview
```

## Stack

- React 19 + TypeScript
- Vite 6
- Tailwind CSS v4
- Recharts (charts)
- Stellar Wallets Kit v2 (wallet connectivity)
- Stellar SDK
- Lucide React (icons)

## Project structure

```
src/
  components/    Sidebar, TopBar, DepositModal, charts
  contexts/      WalletContext, NetworkContext
  pages/         Overview, Performance, Activity, Allocation, Bridges
  data/          Mock data (will be replaced by indexer API)
  utils/         Formatting helpers
tests/           Playwright smoke tests
```

## Tests

```bash
npx playwright install chromium
npx playwright test
```

## Deployment

Deployed on Vercel. Every push to `main` triggers a redeploy.

## Related repos

- [Lobster-Protocol/Stellar](https://github.com/Lobster-Protocol/Stellar) — DEX indexer, analytics engine, Soroban contracts (2025 Build Award)
- [lobster-protocol.com](https://www.lobster-protocol.com) — main website

## Team

- **Alexis Mailley** — CEO, quantitative modeling ([LinkedIn](https://linkedin.com/in/alexis-mailley/))
- **Nathan Hervier** — CTO, Soroban/Rust ([GitHub](https://github.com/Elli610))
- **Marc Beaudoin** — Lead Quant ([GitHub](https://github.com/MrGabjea))
