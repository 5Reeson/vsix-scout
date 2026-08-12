import { readFile } from 'node:fs/promises';

import type { ScoutError } from '@vsix-scout/core';
import { describe, expect, it, vi } from 'vitest';

import {
  HISTORY_QUERY_FLAGS,
  MARKETPLACE_QUERY_URL,
  MarketplaceProvider,
  browserMarketplaceRequestAdapter,
  parseMarketplaceExtensionReference,
} from '../src/index.js';

const fixtureRoot = new URL('../../../tests/fixtures/', import.meta.url);

async function readFixture(relativePath: string): Promise<unknown> {
  return JSON.parse(
    await readFile(new URL(relativePath, fixtureRoot), 'utf8'),
  ) as unknown;
}

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(value), { ...init, headers });
}

describe('MarketplaceProvider', () => {
  it('queries historical metadata with the verified Marketplace contract', async () => {
    const fixture = await readFixture('marketplace/universal-prettier.json');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(fixture));
    const provider = new MarketplaceProvider({ fetch: fetchMock });

    const record = await provider.getExtension(
      parseMarketplaceExtensionReference('esbenp.prettier-vscode'),
    );

    expect(record.extension.id).toBe('esbenp.prettier-vscode');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(MARKETPLACE_QUERY_URL);
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual' });
    expect(new Headers(init?.headers).get('accept')).toBe(
      'application/json;api-version=3.0-preview.1',
    );
    expect(new Headers(init?.headers).get('user-agent')).toMatch(
      /^vsix-scout\//,
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({
      filters: [
        {
          criteria: [{ filterType: 7, value: 'esbenp.prettier-vscode' }],
          pageNumber: 1,
          pageSize: 1,
        },
      ],
      flags: HISTORY_QUERY_FLAGS,
    });
  });

  it('uses browser-safe headers and redirect behavior through the browser adapter', async () => {
    const fixture = await readFixture('marketplace/universal-prettier.json');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(fixture));
    const provider = new MarketplaceProvider({
      fetch: fetchMock,
      requestAdapter: browserMarketplaceRequestAdapter,
    });

    await provider.getExtension(
      parseMarketplaceExtensionReference('esbenp.prettier-vscode'),
    );

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.redirect).toBe('follow');
    expect(new Headers(init?.headers).has('user-agent')).toBe(false);
  });

  it('binds fetch to globalThis for browser native fetch compatibility', async () => {
    const fixture = await readFixture('marketplace/universal-prettier.json');
    const fetchMock = vi.fn(function (this: unknown) {
      if (this !== globalThis) {
        throw new TypeError('Illegal invocation');
      }
      return Promise.resolve(jsonResponse(fixture));
    });
    const provider = new MarketplaceProvider({
      fetch: fetchMock as typeof fetch,
      requestAdapter: browserMarketplaceRequestAdapter,
    });

    const record = await provider.getExtension(
      parseMarketplaceExtensionReference('esbenp.prettier-vscode'),
    );

    expect(record.extension.id).toBe('esbenp.prettier-vscode');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches a missing engine manifest and falls back after a stale CDN URL', async () => {
    const metadata = await readFixture(
      'marketplace/engine-fallback-python.json',
    );
    const manifest = await readFixture('manifests/python-0.7.0.json');
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === MARKETPLACE_QUERY_URL) {
        return jsonResponse(metadata);
      }
      if (url.includes('gallerycdn.vsassets.io')) {
        return new Response(null, { status: 404 });
      }
      if (url.includes('gallery.vsassets.io')) {
        return jsonResponse(manifest);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    const provider = new MarketplaceProvider({ fetch: fetchMock });

    const record = await provider.getExtension(
      parseMarketplaceExtensionReference('ms-python.python'),
    );

    expect(record.versions[0]).toMatchObject({
      version: '0.7.0',
      engine: '^1.9.0',
      engineSource: 'manifest',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('leaves the engine explicitly missing when both manifest locations are gone', async () => {
    const metadata = await readFixture(
      'marketplace/engine-fallback-python.json',
    );
    const fetchMock = vi.fn<typeof fetch>(async (input) =>
      String(input) === MARKETPLACE_QUERY_URL
        ? jsonResponse(metadata)
        : new Response(null, { status: 404 }),
    );
    const provider = new MarketplaceProvider({ fetch: fetchMock });

    const record = await provider.getExtension(
      parseMarketplaceExtensionReference('ms-python.python'),
    );

    expect(record.versions[0]).toMatchObject({ engineSource: 'missing' });
    expect(record.versions[0]?.engine).toBeUndefined();
  });

  it('loads missing manifests in non-repeating batches scoped to the requested channel', async () => {
    const metadata = structuredClone(
      await readFixture('marketplace/engine-fallback-python.json'),
    ) as {
      results: Array<{
        extensions: Array<{ versions: Array<Record<string, unknown>> }>;
      }>;
    };
    const versions = metadata.results[0]?.extensions[0]?.versions;
    if (versions === undefined || versions[0] === undefined) {
      throw new Error('Manifest batching fixture is incomplete.');
    }
    const template = versions[0];
    versions.splice(
      0,
      1,
      ...['3.0.0', '2.0.0', '1.0.0'].map((version, index) => ({
        ...template,
        version,
        assetUri: `https://ms-python.gallerycdn.vsassets.io/extensions/ms-python/python/${version}/${index}`,
        fallbackAssetUri: `https://ms-python.gallery.vsassets.io/_apis/public/gallery/publisher/ms-python/extension/python/${version}/assetbyname`,
        files: undefined,
        properties:
          index === 1
            ? [
                {
                  key: 'Microsoft.VisualStudio.Code.PreRelease',
                  value: 'true',
                },
              ]
            : [],
      })),
    );

    const manifestRequests: string[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === MARKETPLACE_QUERY_URL) return jsonResponse(metadata);
      manifestRequests.push(url);
      return jsonResponse({ engines: { vscode: '^1.90.0' } });
    });
    const provider = new MarketplaceProvider({ fetch: fetchMock });
    const reference = parseMarketplaceExtensionReference('ms-python.python');

    const first = await provider.getExtension(reference, {
      channel: 'stable',
      platform: 'win32-x64',
      manifestLimit: 1,
    });
    expect(
      first.versions.filter((version) => version.engine !== undefined),
    ).toHaveLength(1);
    expect(
      provider.hasPendingManifests(reference, {
        channel: 'stable',
        platform: 'win32-x64',
      }),
    ).toBe(true);

    const second = await provider.getExtension(reference, {
      channel: 'stable',
      platform: 'win32-x64',
      manifestLimit: 1,
    });
    expect(
      second.versions.filter((version) => version.engine !== undefined),
    ).toHaveLength(2);
    expect(
      provider.hasPendingManifests(reference, {
        channel: 'stable',
        platform: 'win32-x64',
      }),
    ).toBe(false);
    expect(manifestRequests).toHaveLength(2);
    expect(new Set(manifestRequests).size).toBe(2);
  });

  it('honors Retry-After and succeeds after a transient rate limit', async () => {
    const fixture = await readFixture('marketplace/universal-prettier.json');
    const sleep = vi.fn(async () => undefined);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { 'Retry-After': '0' } }),
      )
      .mockResolvedValueOnce(jsonResponse(fixture));
    const provider = new MarketplaceProvider({
      fetch: fetchMock,
      maxRetries: 1,
      sleep,
    });

    await provider.getExtension(
      parseMarketplaceExtensionReference('esbenp.prettier-vscode'),
    );

    expect(sleep).toHaveBeenCalledWith(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('classifies exhausted rate limits with stable diagnostic details', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 429,
        headers: { 'Retry-After': '3' },
      }),
    );
    const provider = new MarketplaceProvider({
      fetch: fetchMock,
      maxRetries: 1,
      sleep: async () => undefined,
    });

    await expect(
      provider.getExtension(
        parseMarketplaceExtensionReference('esbenp.prettier-vscode'),
      ),
    ).rejects.toMatchObject<ScoutError>({
      code: 'UPSTREAM_UNAVAILABLE',
      retryable: true,
      details: {
        resource: 'metadata',
        status: 429,
        attempts: 2,
        retryAfterMs: 3000,
      },
    });
  });

  it('classifies a request timeout separately from other network failures', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    const provider = new MarketplaceProvider({
      fetch: fetchMock,
      maxRetries: 0,
      timeoutMs: 5,
    });

    await expect(
      provider.getExtension(
        parseMarketplaceExtensionReference('esbenp.prettier-vscode'),
      ),
    ).rejects.toMatchObject<ScoutError>({
      code: 'UPSTREAM_UNAVAILABLE',
      retryable: true,
      details: {
        resource: 'metadata',
        reason: 'timeout',
        attempts: 1,
      },
    });
  });

  it('retries and classifies an exhausted transport failure', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('socket closed'));
    const provider = new MarketplaceProvider({
      fetch: fetchMock,
      maxRetries: 1,
      sleep: async () => undefined,
    });

    await expect(
      provider.getExtension(
        parseMarketplaceExtensionReference('esbenp.prettier-vscode'),
      ),
    ).rejects.toMatchObject<ScoutError>({
      code: 'UPSTREAM_UNAVAILABLE',
      retryable: true,
      details: {
        resource: 'metadata',
        reason: 'network',
        attempts: 2,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports schema drift and response-size violations as invalid upstream data', async () => {
    const invalidProvider = new MarketplaceProvider({
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ results: [{}] })),
    });
    const oversizedProvider = new MarketplaceProvider({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response('{}', {
          headers: { 'Content-Length': '100' },
        }),
      ),
      maxMetadataBytes: 10,
    });
    const streamedOversizedProvider = new MarketplaceProvider({
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('0123456789')),
      maxMetadataBytes: 5,
    });
    const reference = parseMarketplaceExtensionReference(
      'esbenp.prettier-vscode',
    );

    await expect(
      invalidProvider.getExtension(reference),
    ).rejects.toMatchObject<ScoutError>({
      code: 'UPSTREAM_INVALID_RESPONSE',
      details: {
        issues: expect.arrayContaining([
          expect.objectContaining({ path: 'results.0.extensions' }),
        ]),
      },
    });
    await expect(
      oversizedProvider.getExtension(reference),
    ).rejects.toMatchObject<ScoutError>({
      code: 'UPSTREAM_INVALID_RESPONSE',
      details: {
        resource: 'metadata',
        maxBytes: 10,
        contentLength: 100,
      },
    });
    await expect(
      streamedOversizedProvider.getExtension(reference),
    ).rejects.toMatchObject<ScoutError>({
      code: 'UPSTREAM_INVALID_RESPONSE',
      details: {
        resource: 'metadata',
        maxBytes: 5,
        receivedBytes: 10,
      },
    });
  });

  it('deduplicates concurrent requests and caches successful records', async () => {
    const fixture = await readFixture('marketplace/universal-prettier.json');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(fixture));
    const provider = new MarketplaceProvider({ fetch: fetchMock });
    const reference = parseMarketplaceExtensionReference(
      'esbenp.prettier-vscode',
    );

    const [first, second] = await Promise.all([
      provider.getExtension(reference),
      provider.getExtension(reference),
    ]);
    const third = await provider.getExtension(reference);

    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
