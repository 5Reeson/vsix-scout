# CLI guide

VSIX Scout's Phase 3 CLI queries the official Visual Studio Marketplace,
selects versions with the pure compatibility resolver, and can safely download
the selected VSIX without installing or executing it.

## Run from source

```bash
pnpm install
pnpm build
pnpm cli -- --help
```

The package also declares the `vsix-scout` binary for future packaged releases.

## Resolve

Resolve requires a complete VS Code SemVer and one supported target platform.
It never writes a VSIX:

```bash
pnpm cli -- resolve esbenp.prettier-vscode \
  --vscode 1.101.0 \
  --platform darwin-arm64
```

Stable is the default channel. Use `--pre-release` for strict pre-release
selection or `--version <exact-semver>` to constrain the extension version.

## Versions and inspect

`versions` emits a compact historical variant list:

```bash
pnpm cli -- versions ms-python.python --platform linux-x64
```

`inspect` reports a human summary. Its JSON form contains complete normalized
candidate metadata including dependencies, extension-pack members, official
asset locations, and upstream hashes:

```bash
pnpm cli -- inspect ms-python.python --version 2026.4.0 --json
```

Both commands default to stable candidates and accept `--pre-release`,
`--platform`, and `--version` filters. A non-universal platform filter includes
that exact platform plus universal candidates.

## Download

`download` always runs the same resolver first:

```bash
pnpm cli -- download esbenp.prettier-vscode \
  --vscode 1.101.0 \
  --platform darwin-arm64 \
  --output ./artifacts
```

The default output directory is the current directory. Existing files are
never overwritten. `--no-download` prints the planned filename and official
source without making a VSIX request or writing a file.

On success, output includes the byte size and a locally calculated SHA-256.
The hash can be independently checked:

```bash
shasum -a 256 ./artifacts/*.vsix
```

```powershell
Get-FileHash .\artifacts\*.vsix -Algorithm SHA256
```

## Download safety policy

- Only HTTPS URLs on the Marketplace allowlist are accepted.
- Automatic redirects are disabled; each redirect target is parsed and
  revalidated, with at most five redirects.
- The default timeout is 120 seconds per official download location and the
  decoded VSIX limit is 512 MiB.
- Bytes are streamed to a mode-`0600` temporary file in the destination
  directory while SHA-256 is calculated.
- The file is synced and atomically published without overwriting an existing
  destination. Partial temporary files are removed after errors or interruption.
- VSIX Scout does not extract, load, install, or execute the downloaded file.

The provider prefers the official gallery fallback URL with `redirect=true` so
Marketplace download accounting is retained, then uses the official CDN URL as
a secondary location.

## JSON output

Use `--json` for automation. JSON output never includes the resolved current
working directory: download paths are either the filename alone or the path
explicitly supplied through `--output`.

The contract is versioned with `schemaVersion: 1` and documented by
[`schemas/v1/cli-output.schema.json`](../schemas/v1/cli-output.schema.json).
Breaking changes require a new schema version. Pre-1.0 releases may add optional
fields to an existing version when documented.

## Exit codes

| Code | Meaning                        |
| ---: | ------------------------------ |
|    0 | Success                        |
|    1 | Unexpected internal error      |
|    2 | Invalid input                  |
|    3 | Extension not found            |
|    4 | No compatible/matching version |
|    5 | Marketplace unavailable        |
|    6 | Invalid Marketplace response   |
|    7 | Unsafe resource URL            |
|    8 | Download failed                |

Errors emitted with `--json` use the same schema version and contain a stable
error code, message, retryable flag, and optional diagnostic details.
