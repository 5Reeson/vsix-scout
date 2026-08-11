# Resolver policy

> Status: Phase 1 baseline
>
> The resolver is pure: it performs no network, filesystem, download, or CLI
> operations.

## Contract

`resolveExtension(record, request)` accepts normalized provider metadata and a
target request:

```ts
interface ResolutionRequest {
  vscode: string;
  platform: string;
  channel?: 'stable' | 'pre-release';
  version?: string;
}
```

The target VS Code version and optional exact extension version must be valid,
complete SemVer values. The channel defaults to `stable`. Requesting
`pre-release` is strict: stable candidates are not silently substituted.

## Candidate evaluation

Every version/platform variant is evaluated independently. A candidate is
rejected at its first failing rule:

1. extension version is not valid SemVer;
2. exact extension version does not match, when requested;
3. channel does not match;
4. target platform is neither exact nor universal;
5. `engines.vscode` is missing;
6. the engine range is invalid;
7. the target VS Code version does not satisfy the engine range.

The resolver fails closed when engine evidence is missing or malformed. It does
not infer compatibility from release dates, changelogs, or neighboring versions.

SemVer range handling is delegated to the `semver` package and covers caret,
tilde, comparators, wildcard ranges, hyphen ranges, and OR expressions.

## Ordering and platform fallback

Eligible candidates are ordered deterministically:

1. extension SemVer descending;
2. for the same extension version, exact platform before universal;
3. publication timestamp descending;
4. original provider order as the final stable tie-breaker.

This means a newer compatible universal package is selected over an older exact
platform package. Exact-platform preference only changes which variant wins for
the same extension version. Packages for any other platform are never treated as
compatible.

## Result explanation

A successful result includes:

- the normalized target and selected full candidate metadata;
- exact or universal platform-match classification;
- structured reason codes for channel, engine, platform, and version choice;
- an explicit marker when engine data came from manifest fallback;
- the standard limitation that engine compatibility cannot prove external
  runtime dependencies;
- counts for examined, compatible, and rejected candidates.

If the selected metadata lacks a VSIX asset, compatibility can still be resolved,
but the result includes a limitation. Asset availability is verified by the
provider/download phases.

## Failure behavior

Invalid user input raises `INVALID_INPUT`. When no candidate survives filtering,
the resolver raises `NO_COMPATIBLE_VERSION` with categorized first-rejection
counts. These errors use the same versioned JSON envelope defined by the core
package.
