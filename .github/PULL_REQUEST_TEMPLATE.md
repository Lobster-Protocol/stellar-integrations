<!-- Keep the description short and useful. -->

## Summary

<!-- One or two sentences on what changed and why. -->

## Scope

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup
- [ ] Documentation
- [ ] CI / tooling

## Test plan

- [ ] `npx tsc --noEmit` passes locally
- [ ] `npm run build` succeeds
- [ ] `npx playwright test` is green against the live deploy
- [ ] New code has at least one Vitest unit test

## Security checklist

- [ ] No new `.env` variables committed
- [ ] No new hardcoded Stellar / EVM addresses outside `src/config/`
