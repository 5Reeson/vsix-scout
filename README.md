# VSIX Scout

Find the right extension version for your VS Code.

VSIX Scout will resolve the newest compatible historical VSIX for a target VS
Code version and platform, explain the choice, and download only from validated
official Marketplace sources.

**VSIX Scout 0.1.0** is published. The CLI can resolve, list, and inspect
historical extension metadata, then safely download the selected official VSIX
with a locally calculated and, when available, upstream-verified SHA-256.

Phase 5 adds a pure static Web UI for the `0.2.0` target. The browser queries
Visual Studio Marketplace directly, reuses the same resolver, and provides a
validated Microsoft download link without reading the VSIX into application
memory.

- [Open the VSIX Scout Web app](https://5reeson.github.io/vsix-scout/)
- [View `vsix-scout` on npm](https://www.npmjs.com/package/vsix-scout)

## Install

```bash
npm install --global vsix-scout
vsix-scout --version
```

The release candidate can be tested from this repository with
`pnpm release:check`, which builds the same dependency-free CLI tarball and
installs it into a clean temporary directory.

## Repository layout

```text
apps/cli/            CLI package boundary
apps/web/            React/Vite static Web application
packages/core/       Pure resolver, domain models, explanations, and errors
packages/marketplace Marketplace schemas, normalization, and URL policy
packages/shared/     Cross-package constants and types
tests/fixtures/      Minimized real Marketplace samples
docs/                Protocol and architecture evidence
```

## Development

Requirements:

- Node.js 20 or newer
- pnpm 10.x (`10.34.5` is pinned by the repository)

```bash
pnpm install
pnpm check
pnpm build
pnpm build:web
pnpm cli -- --help
```

Resolve without downloading:

```bash
pnpm cli -- resolve esbenp.prettier-vscode \
  --vscode 1.101.0 \
  --platform darwin-arm64
```

Download to a directory:

```bash
pnpm cli -- download esbenp.prettier-vscode \
  --vscode 1.101.0 \
  --platform darwin-arm64 \
  --output ./artifacts
```

Optional live metadata probe:

```bash
pnpm probe:marketplace
```

Optional live provider smoke test:

```bash
pnpm test:live:marketplace
```

The probe does not download or execute an extension. Automated tests use local
fixtures and do not require network access.

Run the Web application locally:

```bash
pnpm web
```

The production build uses the GitHub Pages project base `/vsix-scout/`. See the
[Web architecture and deployment guide](docs/web.md) for local preview and
repository settings.

The offline suite covers every workspace boundary: `packages/core`,
`packages/marketplace`, and `apps/cli` (including the downloader). The optional
live test resolves Prettier, ESLint, and YAML against the real service. CI runs
the offline suite on Node.js 20, 22, and 24 across Linux, macOS, and Windows,
then verifies a clean install of the packed CLI on all three operating systems.

## Documentation

- [Project definition and roadmap](PROJECT.md)
- [Marketplace protocol notes](docs/marketplace-protocol.md)
- [Marketplace provider policy](docs/marketplace-provider.md)
- [Resolver policy](docs/resolver-policy.md)
- [CLI and safe download guide](docs/cli.md)
- [CLI JSON schema v1](schemas/v1/cli-output.schema.json)
- [Static Web UI](docs/web.md)
- [Fixture provenance](tests/fixtures/README.md)
- [Threat model](docs/threat-model.md)
- [Release process](docs/releasing.md)
- [Marketplace terms review](docs/marketplace-terms-review.md)
- [Security policy](SECURITY.md)
- [Contributing guide](CONTRIBUTING.md)

## Security boundary

VSIX Scout does not install or execute extensions, does not operate a mirror,
and does not accept arbitrary download hosts. Marketplace compatibility metadata
is necessary evidence, not a guarantee that an extension's external runtime
dependencies will work.

## License

[MIT](LICENSE)
