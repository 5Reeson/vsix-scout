# VSIX Scout

Find the right extension version for your VS Code.

VSIX Scout will resolve the newest compatible historical VSIX for a target VS
Code version and platform, explain the choice, and download only from validated
official Marketplace sources.

The project has completed **Phase 2: Marketplace provider**. It can normalize
official Marketplace references, query and validate historical metadata, and
recover missing engine metadata from official manifests. User-facing CLI
commands are planned for Phase 3 and are not implemented yet.

## Repository layout

```text
apps/cli/            CLI package boundary
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

## Documentation

- [Project definition and roadmap](PROJECT.md)
- [Marketplace protocol notes](docs/marketplace-protocol.md)
- [Marketplace provider policy](docs/marketplace-provider.md)
- [Resolver policy](docs/resolver-policy.md)
- [Fixture provenance](tests/fixtures/README.md)

## Security boundary

VSIX Scout does not install or execute extensions, does not operate a mirror,
and does not accept arbitrary download hosts. Marketplace compatibility metadata
is necessary evidence, not a guarantee that an extension's external runtime
dependencies will work.

## License

[MIT](LICENSE)
