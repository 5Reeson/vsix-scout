# Marketplace provider policy

The `@vsix-scout/marketplace` package is the only layer that reads the raw
Visual Studio Marketplace protocol. It implements the core `ExtensionProvider`
interface and returns normalized domain records; callers never depend on raw
gallery response fields.

## Accepted input

`parseMarketplaceExtensionReference` accepts either:

- a canonical `publisher.extension` identifier; or
- an HTTPS `marketplace.visualstudio.com/items?itemName=publisher.extension`
  URL.

Publisher and extension names are normalized to lowercase. Other hosts,
protocols, paths, credentials, malformed identifiers, and arbitrary URLs are
rejected with `INVALID_INPUT`. The input URL is parsed only to obtain the ID;
the provider always sends its query to the fixed Marketplace endpoint.

## Network defaults

| Policy                        | Default                           |
| ----------------------------- | --------------------------------- |
| Request timeout               | 10 seconds per attempt            |
| Retries after the first try   | 2                                 |
| Retryable HTTP responses      | 408, 425, 429, 500, 502, 503, 504 |
| Backoff                       | 250 ms exponential, max 2 s       |
| `Retry-After`                 | Honored, capped at 2 s            |
| Metadata response limit       | 16 MiB                            |
| Manifest response limit       | 2 MiB                             |
| Manifest request concurrency  | 4                                 |
| Successful metadata cache TTL | 5 minutes                         |
| Maximum cache entries         | 32                                |

Response limits are enforced against both `Content-Length` and the decoded
stream. Errors are never cached, the cache is size-bounded with least-recently
used eviction, and simultaneous requests for the same ID share one in-flight
operation. Automatic redirects are disabled in the metadata provider so an
upstream response cannot silently move a request outside the official host
policy.

## Manifest fallback

The historical metadata response is normalized first. Only candidates whose
Engine property is absent and which expose a manifest asset trigger manifest
requests. The provider tries the primary CDN URL and then the official gallery
fallback URL. Duplicate asset pairs are fetched once per provider operation.

- A valid manifest supplies `engines.vscode` and is marked with
  `engineSource: "manifest"`.
- If both official URLs return 404 or 410, the candidate remains explicitly
  `engineSource: "missing"`; the resolver then fails closed for that candidate.
- Invalid manifest JSON/schema or exhausted network/rate-limit failures are
  reported rather than being confused with missing compatibility metadata.

## Error classification

- `INVALID_INPUT`: unsupported ID or Marketplace URL.
- `EXTENSION_NOT_FOUND`: a valid query returned no matching extension.
- `UPSTREAM_UNAVAILABLE`: timeout, network failure, rate limit, or HTTP service
  failure. Diagnostics include resource type, attempts, status/reason, and a
  parsed `retryAfterMs` when supplied.
- `UPSTREAM_INVALID_RESPONSE`: invalid JSON, schema drift, invalid manifest, or
  a response over its configured size limit. Zod issue paths are retained.
- `UNSAFE_RESOURCE_URL`: metadata exposes a non-HTTPS or non-allowlisted asset.

These errors use the shared serializable `ScoutError` model.

## Tests

Normal CI is deterministic and only uses minimized fixtures. A live smoke test
for three representative public extensions is opt-in:

```bash
pnpm test:live:marketplace
```

The live test requests public metadata and manifests only. It does not download,
install, extract, or execute VSIX packages.
