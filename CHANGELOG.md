# Changelog

This project follows [Semantic Versioning](https://semver.org/). Before 1.0,
minor releases may change CLI behavior; the versioned JSON compatibility policy
is documented separately in the CLI guide.

## 0.1.0 - Unreleased

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
