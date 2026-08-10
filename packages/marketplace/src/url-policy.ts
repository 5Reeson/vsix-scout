import { ScoutError } from '@vsix-scout/core';

const EXACT_ALLOWED_HOSTS = new Set(['marketplace.visualstudio.com']);
const ASSET_HOST_SUFFIXES = [
  '.gallery.vsassets.io',
  '.gallerycdn.vsassets.io',
] as const;

export function isAllowedMarketplaceUrl(value: string): boolean {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  return (
    EXACT_ALLOWED_HOSTS.has(hostname) ||
    ASSET_HOST_SUFFIXES.some(
      (suffix) => hostname.endsWith(suffix) && hostname.length > suffix.length,
    )
  );
}

export function assertAllowedMarketplaceUrl(value: string): void {
  if (!isAllowedMarketplaceUrl(value)) {
    throw new ScoutError(
      'UNSAFE_RESOURCE_URL',
      'Marketplace metadata contained a resource URL outside the allowlist.',
      { details: { url: value } },
    );
  }
}
