# VSIX Scout

Find the right extension version for your VS Code.

VSIX Scout will resolve the newest compatible historical VSIX for a target VS
Code version and platform, explain the choice, and download only from validated
official Marketplace sources.

The project is currently at **Phase 0: protocol validation and engineering
baseline**. The resolver and user-facing CLI commands are planned for later
phases and are not implemented yet.

## Repository layout

```text
apps/cli/            CLI package boundary
packages/core/       Provider-independent domain models and errors
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

The probe does not download or execute an extension. Automated tests use local
fixtures and do not require network access.

## Documentation

- [Project definition and roadmap](PROJECT.md)
- [Marketplace protocol notes](docs/marketplace-protocol.md)
- [Fixture provenance](tests/fixtures/README.md)

## Security boundary

VSIX Scout does not install or execute extensions, does not operate a mirror,
and does not accept arbitrary download hosts. Marketplace compatibility metadata
is necessary evidence, not a guarantee that an extension's external runtime
dependencies will work.

## License

[MIT](LICENSE)
