# Contributing to VSIX Scout

Thank you for helping improve VSIX Scout. By participating, you agree to follow
the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

Use Node.js 20 or newer and pnpm 10.34.5:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build:release
pnpm package:check
```

The default test suite is fully offline and covers the core resolver,
Marketplace provider, CLI, and downloader. `pnpm test:live:marketplace` is an
explicit network test and is not part of normal CI.

## Pull requests

- Keep changes focused and add regression tests for behavior changes.
- Do not commit downloaded VSIX files, credentials, tokens, or raw responses
  containing user-specific data.
- Update user-facing documentation and `CHANGELOG.md` when behavior changes.
- Preserve the provider/core/CLI boundaries: network shapes belong in
  `packages/marketplace`; compatibility decisions belong in `packages/core`.
- Ensure `pnpm check` and `pnpm release:check` pass before requesting review.

Bug reports should contain a minimized reproduction when possible. Security
reports must follow [SECURITY.md](SECURITY.md), not the public issue tracker.
