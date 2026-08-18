import type { ResolutionResult } from './resolver.js';

/**
 * Pattern B: the deterministic Marketplace download endpoint on
 * `marketplace.visualstudio.com` — the host that corporate allowlists (which
 * often block the `*.gallery*.vsassets.io` CDN) can reach. The URL is fully
 * derivable from publisher / extension / version / targetPlatform, so it does
 * not need Marketplace metadata to exist.
 *
 * The `targetPlatform` query is omitted for universal builds: the endpoint
 * returns HTTP 500 when asked for `targetPlatform=universal`, and serves the
 * universal build when the parameter is absent.
 */
export function marketplaceVspackageUrl(
  publisher: string,
  extension: string,
  version: string,
  targetPlatform: string,
): string {
  const path = [
    'https://marketplace.visualstudio.com/_apis/public/gallery/publishers',
    encodeURIComponent(publisher),
    'vsextensions',
    encodeURIComponent(extension),
    encodeURIComponent(version),
    'vspackage',
  ].join('/');
  return targetPlatform !== 'universal'
    ? `${path}?targetPlatform=${encodeURIComponent(targetPlatform)}`
    : path;
}

export interface DownloadLinks {
  /** Pattern B: Marketplace vspackage endpoint (primary, preferred). */
  readonly primary: string;
  /** Pattern A: the CDN asset URL from Marketplace metadata, when present. */
  readonly alternate?: string;
}

/**
 * The two official download locations for a resolved version: the
 * deterministic Marketplace endpoint (B) first, then the CDN asset URL (A)
 * that came back in the Marketplace metadata.
 */
export function resolutionDownloadLinks(
  result: ResolutionResult,
): DownloadLinks {
  const primary = marketplaceVspackageUrl(
    result.extension.publisher,
    result.extension.name,
    result.selected.version,
    result.selected.targetPlatform,
  );
  const asset = result.selected.assets.vsix;
  const alternate = asset?.primaryUri ?? asset?.fallbackUri;
  return { primary, ...(alternate === undefined ? {} : { alternate }) };
}
