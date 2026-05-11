# Contributing

Thanks for considering a contribution. Bug fixes, docs and test
coverage are welcome.

## Development setup

```bash
nvm use                                 # Node 24, see .nvmrc
npm install -g yarn                     # a transitive postinstall needs it
npm install
npm run dev                             # http://localhost:5173
npm run test:unit                       # vitest
npx playwright install chromium
npx playwright test                     # against the live deploy
npm run build
node scripts/probe-stellar-rpc.mjs      # sanity check the RPCs
```

## Branching and PRs

- Open feature branches from `main`. Keep names short and imperative
  (`fix/wallet-reconnect`, `feat/allbridge-bridge-call`).
- Conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`,
  `docs:`, `test:`).
- Open a PR against `main`. CI runs typecheck, build, and Playwright.
- Squash merges for small PRs, merge commits for larger feature work.

## Conventions

- No hardcoded C/G addresses outside `src/config/contracts.ts`.
- No secrets. `.env` is gitignored. Only `.env.example` is committed.
- No `VITE_*` prefix for anything sensitive (bundles into client JS).
- TypeScript strict mode. New code must pass `tsc --noEmit`.
- Comments explain the why, not the what.

## Reporting issues

- Bugs: open a GitHub issue with reproduction steps, browser/OS, and
  the commit hash.
- Security: do not open a public issue. Email
  security@lobster-protocol.com (see `SECURITY.md`).

## Testing

- Playwright targets the live Vercel URL by default. Run it before
  opening a PR.
- New components should add at least one Vitest unit test for the
  happy path. Test files live next to the source as `*.test.ts(x)`.
