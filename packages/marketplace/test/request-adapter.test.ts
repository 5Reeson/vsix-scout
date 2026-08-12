import type { ScoutError } from '@vsix-scout/core';
import { describe, expect, it } from 'vitest';

import { browserMarketplaceRequestAdapter } from '../src/index.js';

describe('browserMarketplaceRequestAdapter', () => {
  it('rejects a request URL outside the Marketplace allowlist before fetch', () => {
    expect(() =>
      browserMarketplaceRequestAdapter.validateRequest(
        'https://example.com/metadata',
      ),
    ).toThrowError(
      expect.objectContaining<ScoutError>({ code: 'UNSAFE_RESOURCE_URL' }),
    );
  });

  it('accepts an allowlisted final response URL', () => {
    const response = new Response('{}');
    Object.defineProperty(response, 'url', {
      value:
        'https://publisher.gallery.vsassets.io/extensions/publisher/name/file',
    });

    expect(() =>
      browserMarketplaceRequestAdapter.validateResponse(
        response,
        'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery',
      ),
    ).not.toThrow();
  });

  it('rejects a final response URL outside the Marketplace allowlist', () => {
    const response = new Response('{}');
    Object.defineProperty(response, 'url', {
      value: 'https://example.com/redirected',
    });

    expect(() =>
      browserMarketplaceRequestAdapter.validateResponse(
        response,
        'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery',
      ),
    ).toThrowError(
      expect.objectContaining<ScoutError>({ code: 'UNSAFE_RESOURCE_URL' }),
    );
  });
});
