# Static Web UI

VSIX Scout Web is a React and Vite single-page application in `apps/web`. It
builds to static files and is designed for the GitHub Pages project path
`/vsix-scout/`.

## Architecture boundary

The browser sends the Marketplace `extensionquery` POST directly to the fixed
Visual Studio Marketplace endpoint. The existing Marketplace Zod schemas and
normalization logic convert the response to the shared core model. The existing
core resolver selects versions; the Web application does not copy compatibility
rules.

Node and browser requests share timeout, retry, response-size, streaming JSON,
schema, normalization, and cache behavior. The request adapter is the only
environment-specific boundary:

- Node retains its explicit `User-Agent` and `redirect: manual` behavior.
- Browser requests omit the forbidden `User-Agent`, use the browser redirect
  implementation, and validate any final response URL against the Marketplace
  allowlist.

The page prefers the normalized primary `Microsoft.VisualStudio.Services.VSIXPackage`
URL from Marketplace metadata. It validates that URL again before rendering a
normal anchor. The Web application never fetches the VSIX, reads it into a Blob
or ArrayBuffer, computes its hash, proxies it, or stores it.

## Local development

```bash
pnpm install
pnpm web
```

Production build and preview:

```bash
pnpm build:web
pnpm web:preview
```

The production HTML must reference assets under `/vsix-scout/assets/`. A local
preview therefore serves the app at `http://localhost:4173/vsix-scout/`.

## Browser state

Shareable query parameters store only the extension input, VS Code version,
platform, and channel. `localStorage` stores only the last VS Code version and
platform. Raw Marketplace payloads and normalized records are not persisted.

## GitHub Pages

`.github/workflows/pages.yml` builds and uploads `apps/web/dist`, then uses the
official GitHub Pages deployment action. The repository owner must configure
Settings, Pages, Build and deployment, Source to **GitHub Actions** before the
first production deployment.
