# Changelog

This project follows [Semantic Versioning](https://semver.org/). Before 1.0,
minor releases may change CLI behavior; the versioned JSON compatibility policy
is documented separately in the CLI guide.

## 0.2.0 - 2026-08-18

### Added

- Keyword search across CLI (`search` command, "Did you mean?" suggestions) and
  web (suggestion list under failed queries).
- About page on the web with background and privacy notes (zh/en), plus a
  multi-line footer.
- Deterministic `marketplace.visualstudio.com` VSIX download endpoint (Pattern
  B) as the primary download location; the metadata CDN asset (Pattern A) is
  shown and used as a fallback. CLI `resolve`/JSON now expose both links via
  `selected.marketplaceUrl` and `selected.assetUrl`.
- CLI invalid-input errors now include a complete, copy-pasteable example
  command.

### Changed

- Download and download-link selection prefer the Marketplace endpoint (Pattern
  B), falling back to the CDN asset URL.
- Web copy updated to "Visual Studio Code" and clearer query section wording;
  required-field validation messages follow the selected page language.

## 0.1.0 - 2026-08-11

### Added

- Compatibility resolver for VS Code engine ranges, release channels, target
  platforms, universal fallback, exact versions, and deterministic ordering.
- Visual Studio Marketplace provider with schema validation, manifest fallback,
  bounded retries, timeouts, caching, and official URL validation.
- `resolve`, `versions`, `inspect`, and `download` commands with human and JSON
  output.
- Safe streaming downloads with no-overwrite publication, SHA-256 reporting,
  upstream hash verification, ZIP signature checks, limits, and cleanup.
- Node.js 20/22/24 CI across Linux, macOS, and Windows; dependency audit,
  reproducible package checks, clean-install tests, and tag-driven release flow.
