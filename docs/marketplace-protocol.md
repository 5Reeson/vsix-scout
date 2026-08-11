# Visual Studio Marketplace protocol notes

> Verified: 2026-08-10
>
> Scope: public VS Code extension metadata only
>
> Status: Phase 0 evidence; the service contract may change

## Sources

The implementation was independently derived from public protocol behavior and
the following Microsoft sources:

- [ExtensionQueryFlags enum](https://learn.microsoft.com/en-us/javascript/api/azure-devops-extension-api/extensionqueryflags)
- [ExtensionQueryFilterType enum](https://learn.microsoft.com/en-us/javascript/api/azure-devops-extension-api/extensionqueryfiltertype)
- [`@vscode/vsce` public gallery client](https://github.com/microsoft/vscode-vsce/blob/main/src/publicgalleryapi.ts)
- [`@vscode/vsce show`](https://github.com/microsoft/vscode-vsce/blob/main/src/show.ts)
- [VS Code gallery service](https://github.com/microsoft/vscode/blob/main/src/vs/platform/extensionManagement/common/extensionGalleryService.ts)
- [VS Code extension manifest](https://code.visualstudio.com/api/references/extension-manifest)

The public endpoint is used by Microsoft tooling, but VSIX Scout treats its raw
shape as an upstream protocol rather than a stable domain model. All raw data is
validated and normalized behind the provider boundary.

## Query

```http
POST https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery
Accept: application/json;api-version=3.0-preview.1
Content-Type: application/json
```

Minimal historical query:

```json
{
  "filters": [
    {
      "criteria": [{ "filterType": 7, "value": "ms-python.python" }],
      "pageNumber": 1,
      "pageSize": 1
    }
  ],
  "assetTypes": [
    "Microsoft.VisualStudio.Code.Manifest",
    "Microsoft.VisualStudio.Services.VSIXPackage"
  ],
  "flags": 147
}
```

`filterType: 7` is the name-based extension identifier filter. `flags: 147` is
the bitwise combination below:

| Flag                     | Value | Purpose                                                  |
| ------------------------ | ----: | -------------------------------------------------------- |
| IncludeVersions          |     1 | Historical versions and platform variants                |
| IncludeFiles             |     2 | Requested asset file entries                             |
| IncludeVersionProperties |    16 | Engine, pre-release, dependencies and related properties |
| IncludeAssetUri          |   128 | Primary and fallback asset base URIs                     |

`IncludeMetadata` is not required by this probe. Microsoft's enum documentation
also says it is not applicable to VS Code extensions.

## Relevant raw fields

Each extension contains a `versions` array. A raw item is a **version variant**,
not necessarily a unique extension version: the same `version` can occur once
per `targetPlatform`.

Relevant version fields:

- `version`
- `lastUpdated`
- optional `targetPlatform`
- `assetUri` and `fallbackAssetUri`
- `files[].assetType` and `files[].source`
- `properties[].key` and `properties[].value`

Relevant properties:

- `Microsoft.VisualStudio.Code.Engine`
- `Microsoft.VisualStudio.Code.PreRelease`
- `Microsoft.VisualStudio.Code.ExtensionDependencies`
- `Microsoft.VisualStudio.Code.ExtensionPack`
- `Microsoft.VisualStudio.Services.VsixSha256`

Relevant asset types:

- `Microsoft.VisualStudio.Code.Manifest`
- `Microsoft.VisualStudio.Services.VSIXPackage`

An absent `targetPlatform` is normalized to `universal`. A pre-release variant
has the PreRelease property with the string value `true`; absence means stable.

## Asset URL behavior

The response provides both CDN file sources and a gallery fallback base URI.
VSIX Scout retains both:

```text
primary:  {assetUri}/{assetType}
fallback: {fallbackAssetUri}/{assetType}[?targetPlatform=...]
```

The current VS Code implementation deliberately uses the fallback gallery URL
for VSIX downloads so Marketplace download accounting occurs, with
`?redirect=true` for the primary download attempt. The redirect observed during
the probe stayed on the same publisher's `gallerycdn.vsassets.io` host.

An important historical failure mode was confirmed: the CDN manifest URL for
`ms-python.python` version `0.7.0` returned HTTP 404, while the corresponding
`gallery.vsassets.io` fallback returned a manifest containing
`engines.vscode: ^1.9.0`. Consumers therefore must not assume the CDN file source
is permanently available.

## Initial HTTPS host allowlist

- `marketplace.visualstudio.com`
- `*.gallery.vsassets.io`
- `*.gallerycdn.vsassets.io`

Matching is performed on the parsed hostname, never by arbitrary substring.
HTTP is rejected. Every future redirect must be checked again before it is
followed; redirect handling itself belongs to the download phase.

## Probe results

Captured on 2026-08-10:

| Extension                | Raw variants | Distinct versions | Notable facts                                                                          |
| ------------------------ | -----------: | ----------------: | -------------------------------------------------------------------------------------- |
| `esbenp.prettier-vscode` |          173 |               173 | All variants had no target platform and normalize to universal                         |
| `ms-python.python`       |        3,353 |               989 | Eleven observed platforms, stable/pre-release mix, 66 variants missing Engine property |

Observed Python platform values included `alpine-arm64`, `alpine-x64`,
`darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-armhf`, `linux-x64`,
`universal`, `web`, `win32-arm64`, and `win32-x64`. The provider therefore
accepts non-empty upstream platform strings; the user-facing supported-target
policy remains a separate core/CLI concern.

The Python response was about 8.7 MB. The Phase 2 provider therefore enforces a
16 MiB metadata limit, a 2 MiB manifest limit, per-attempt timeouts, finite
retries, bounded manifest concurrency, and a five-minute successful-result
cache. The `VsixSha256` property is useful evidence, but downloads will still be
hashed locally rather than trusting it as the sole integrity check. See the
[provider policy](marketplace-provider.md) for the exact behavior.

## Fixture policy

CI uses minimized snapshots under `tests/fixtures`; it never calls the live
Marketplace. Public IDs, versions, asset URLs, and hashes are retained because
they are essential test inputs. Presentation metadata, statistics, cookies,
headers, and unrelated historical versions are omitted.

Run the optional live probe with:

```bash
pnpm probe:marketplace
pnpm probe:marketplace dbaeumer.vscode-eslint
pnpm test:live:marketplace
```

The probe only requests public metadata. It does not download or execute VSIX
files.
