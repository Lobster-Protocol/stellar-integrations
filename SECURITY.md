# Security Policy

## Reporting a vulnerability

If you find a vulnerability in this repository, please do not open a
public GitHub issue or PR.

Email **security@lobster-protocol.com** with:

- A short description of the issue and its impact.
- Steps to reproduce, ideally with a minimal proof of concept.
- The commit hash or version where you observed the issue.

We will acknowledge receipt within 48 hours, share a remediation plan
within 7 days, and credit reporters in the release notes once a fix is
public (unless you prefer to stay anonymous).

## Scope

In scope:

- Anything in `src/`, `tests/`, `scripts/`, and configuration files
  (`vercel.json`, `vite.config.ts`, etc.).
- Dashboard deployment at https://stellar-integrations-blush.vercel.app.
- The wallet connection flow (Stellar Wallets Kit v2 integration).
- The configuration layer (`src/config/contracts.ts`).

Out of scope:

- Issues in upstream dependencies (`@stellar/stellar-sdk`,
  `@creit-tech/stellar-wallets-kit`, `@allbridge/bridge-core-sdk`,
  `@dfns/sdk`). Report to the relevant project.
- Soroban contracts of Soroswap / Aquarius / Phoenix. Report to those
  teams.
- Browser extensions (Freighter, xBull, Albedo, LOBSTR). Report to
  their maintainers.

## Supported versions

`main` is the only production branch. Security fixes land on `main`
and ship automatically to Vercel on every push.

## Hardening already in place

- No secrets in the repository. `.env` files are gitignored.
- All Stellar contract addresses are centralised in
  `src/config/contracts.ts` and indexed by network.
- The WalletConnect project id is the only credential and is public
  by design (Reown uses it as a rate-limit key, not a secret).
- The CI workflow blocks merges that fail TypeScript checks, build,
  or Playwright E2E.
