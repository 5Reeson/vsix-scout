# Threat model and security review

Reviewed: 2026-08-10. Scope: the 0.1.0 CLI, Marketplace provider, resolver,
download path, terminal/JSON output, and npm/GitHub release workflow.

This is an engineering threat model, not a claim that Marketplace extensions
are trusted or safe.

## Assets and trust boundaries

VSIX Scout protects the user's filesystem, network boundary, automation output,
and confidence that the selected bytes came from an allowed official endpoint.
All CLI input, Marketplace metadata, manifests, HTTP responses, redirects, and
VSIX bytes are untrusted. The resolver operates only on normalized data; the
downloaded VSIX is opaque and is never executed.

## Threats and controls

| Threat                                     | Control                                                                                                                              | Residual risk                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| SSRF or redirect to an attacker host       | Accepted extension references are constrained; every asset and redirect must be HTTPS and match the explicit Marketplace host policy | Microsoft/CDN compromise or DNS/TLS infrastructure compromise is outside this process      |
| Malformed or oversized metadata            | Zod schemas, response byte limits, timeouts, and bounded retries                                                                     | Upstream may change valid fields and cause a fail-closed availability error                |
| HTML/error body saved as `.vsix`           | Require a ZIP signature before publishing                                                                                            | A syntactically valid malicious ZIP remains possible                                       |
| Corrupted/substituted bytes                | Stream SHA-256 and compare with Marketplace SHA-256 when supplied                                                                    | Some historical records do not publish a checksum; hash equality is not publisher trust    |
| Partial or overwritten files               | Same-directory temporary file, `0600` mode, fsync, hard-link no-clobber publication, and cleanup                                     | Destination directory permissions remain the user's responsibility                         |
| Resource exhaustion                        | 512 MiB decoded limit, 120-second per-location timeout, five redirects, bounded metadata/manifest sizes                              | A permitted download can still consume the configured maximum                              |
| Secret or path disclosure                  | No credential options; serialized errors omit causes; JSON returns only filename or user-supplied output path                        | A user can explicitly include sensitive text in command arguments or output paths          |
| Dependency or CI compromise                | Minimal runtime bundle, production audit, lockfile, least-privilege workflow permissions, SHA-pinned actions, clean-package tests    | Registry, runner, maintainer account, or allowed action commit compromise remains possible |
| Tag/package mismatch or incomplete release | Tag/version check, full release check, artifact SHA-256, draft GitHub release, npm provenance support                                | First npm publication requires a credential bootstrap and maintainer action                |

## Explicit non-goals

VSIX Scout does not scan extension source, validate publisher identity beyond
Marketplace metadata, verify VSIX signatures in 0.1.0, decide whether an
extension license permits redistribution, or guarantee runtime compatibility.
It does not mirror, unpack, install, or execute third-party extensions.

## Regression evidence

Offline tests cover unsafe redirects, redirect limits, declared and streamed
size limits, stalled and interrupted bodies, cleanup, existing destinations,
non-ZIP content, malformed and mismatched hashes, provider schema failures,
limited retries, SemVer/channel/platform selection, CLI exit codes, and output
path privacy. The live Marketplace smoke test is opt-in because network state is
not deterministic.
