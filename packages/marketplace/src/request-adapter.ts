import { assertAllowedMarketplaceUrl } from './url-policy.js';

export interface MarketplaceRequestAdapter {
  readonly environment: 'node' | 'browser';
  validateRequest(requestedUrl: string): void;
  prepareRequest(init: RequestInit, userAgent: string): RequestInit;
  validateResponse(response: Response, requestedUrl: string): void;
}

export const nodeMarketplaceRequestAdapter: MarketplaceRequestAdapter = {
  environment: 'node',
  validateRequest: assertAllowedMarketplaceUrl,
  prepareRequest(init, userAgent) {
    const headers = new Headers(init.headers);
    headers.set('User-Agent', userAgent);
    return { ...init, headers, redirect: 'manual' };
  },
  validateResponse() {
    // Node keeps redirects manual. Non-2xx redirect responses are handled by
    // the provider without following an unvalidated location.
  },
};

export const browserMarketplaceRequestAdapter: MarketplaceRequestAdapter = {
  environment: 'browser',
  validateRequest: assertAllowedMarketplaceUrl,
  prepareRequest(init) {
    const headers = new Headers(init.headers);
    headers.delete('User-Agent');
    return { ...init, headers, redirect: 'follow' };
  },
  validateResponse(response) {
    if (response.url !== '') {
      assertAllowedMarketplaceUrl(response.url);
    }
  },
};
