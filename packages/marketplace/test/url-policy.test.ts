import { describe, expect, it } from 'vitest';

import { isAllowedMarketplaceUrl } from '../src/index.js';

describe('isAllowedMarketplaceUrl', () => {
  it.each([
    'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery',
    'https://ms-python.gallery.vsassets.io/_apis/public/gallery/assetbyname',
    'https://ms-python.gallerycdn.vsassets.io/extensions/ms-python/python/file',
  ])('allows official Marketplace hosts: %s', (url) => {
    expect(isAllowedMarketplaceUrl(url)).toBe(true);
  });

  it.each([
    'http://marketplace.visualstudio.com/file',
    'https://marketplace.visualstudio.com.evil.example/file',
    'https://gallery.vsassets.io/file',
    'https://user:password@marketplace.visualstudio.com/file',
    'https://marketplace.visualstudio.com:444/file',
    'https://example.com/file',
    'not a URL',
  ])('rejects unsafe or malformed hosts: %s', (url) => {
    expect(isAllowedMarketplaceUrl(url)).toBe(false);
  });
});
