import { readFile } from 'node:fs/promises';

import type { ScoutError } from '@vsix-scout/core';
import { describe, expect, it, vi } from 'vitest';

import {
  EXTENSION_QUERY_FILTER_SEARCH,
  EXTENSION_QUERY_FILTER_TARGET,
  EXTENSION_QUERY_SORT_BY_INSTALLS,
  EXTENSION_QUERY_SORT_ORDER_DESCENDING,
  EXTENSION_QUERY_TARGET_VALUE,
  MARKETPLACE_QUERY_URL,
  MarketplaceProvider,
  SEARCH_QUERY_FLAGS,
  normalizeSearchResults,
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

describe('normalizeSearchResults', () => {
  it('normalizes search hits with install statistics', async () => {
    const fixture = await readFixture('marketplace/search-python.json');
    const results = normalizeSearchResults(fixture);

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({
      id: 'ms-python.python',
      publisher: 'ms-python',
      name: 'python',
      displayName: 'Python',
      installCount: 232_356_114,
      lastUpdated: '2026-08-08T00:47:12.777+00:00',
    });
    expect(results.map((result) => result.installCount)).toEqual([
      232_356_114, 199_246_817, 137_735_413,
    ]);
  });

  it('reports zero installs when the install statistic is absent', () => {
    const result = normalizeSearchResults({
      results: [
        {
          extensions: [
            {
              extensionName: 'example',
              publisher: { publisherName: 'publisher' },
              statistics: [{ statisticName: 'ratingcount', value: 3 }],
            },
          ],
        },
      ],
    });

    expect(result[0]).toMatchObject({
      id: 'publisher.example',
      installCount: 0,
    });
    expect(result[0]?.lastUpdated).toBeUndefined();
    expect(result[0]?.displayName).toBeUndefined();
  });

  it('normalizes publisher and extension names to lowercase', () => {
    const result = normalizeSearchResults({
      results: [
        {
          extensions: [
            {
              extensionName: 'Prettier-VSCode',
              publisher: { publisherName: 'Esbenp' },
            },
          ],
        },
      ],
    });

    expect(result[0]?.id).toBe('esbenp.prettier-vscode');
    expect(result[0]?.publisher).toBe('esbenp');
    expect(result[0]?.name).toBe('prettier-vscode');
  });

  it('reports schema drift as invalid upstream data', () => {
    expect(() => normalizeSearchResults({ results: [{}] })).toThrowError(
      expect.objectContaining<ScoutError>({
        code: 'UPSTREAM_INVALID_RESPONSE',
      }),
    );
  });
});

describe('MarketplaceProvider.searchExtensions', () => {
  it('queries with the verified search contract and normalized results', async () => {
    const fixture = await readFixture('marketplace/search-python.json');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(fixture));
    const provider = new MarketplaceProvider({ fetch: fetchMock });

    const results = await provider.searchExtensions('python');

    expect(results.map((result) => result.id)).toEqual([
      'ms-python.python',
      'ms-python.vscode-pylance',
      'ms-python.debugpy',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(MARKETPLACE_QUERY_URL);
    expect(JSON.parse(String(init?.body))).toEqual({
      filters: [
        {
          criteria: [
            { filterType: EXTENSION_QUERY_FILTER_SEARCH, value: 'python' },
            {
              filterType: EXTENSION_QUERY_FILTER_TARGET,
              value: EXTENSION_QUERY_TARGET_VALUE,
            },
          ],
          pageNumber: 1,
          pageSize: 8,
          sortBy: EXTENSION_QUERY_SORT_BY_INSTALLS,
          sortOrder: EXTENSION_QUERY_SORT_ORDER_DESCENDING,
        },
      ],
      flags: SEARCH_QUERY_FLAGS,
    });
  });

  it('honors the requested result limit as the page size', async () => {
    const fixture = await readFixture('marketplace/search-python.json');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(fixture));
    const provider = new MarketplaceProvider({ fetch: fetchMock });

    await provider.searchExtensions('python', { limit: 5 });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body)) as {
      filters: Array<{ pageSize: number }>;
    };
    expect(body.filters[0]?.pageSize).toBe(5);
  });

  it('rejects an empty keyword before making a request', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const provider = new MarketplaceProvider({ fetch: fetchMock });

    await expect(
      provider.searchExtensions('   '),
    ).rejects.toMatchObject<ScoutError>({
      code: 'INVALID_INPUT',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reuses the shared request machinery for retries', async () => {
    const fixture = await readFixture('marketplace/search-python.json');
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

    const results = await provider.searchExtensions('python');

    expect(results).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(0);
  });

  it('classifies an invalid JSON search body as invalid upstream data', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{bad json'));
    const provider = new MarketplaceProvider({ fetch: fetchMock });

    await expect(
      provider.searchExtensions('python'),
    ).rejects.toMatchObject<ScoutError>({
      code: 'UPSTREAM_INVALID_RESPONSE',
      retryable: false,
      details: { resource: 'metadata' },
    });
  });

  it('classifies a transport failure with the shared error model', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('socket closed'));
    const provider = new MarketplaceProvider({
      fetch: fetchMock,
      maxRetries: 1,
      sleep: async () => undefined,
    });

    await expect(
      provider.searchExtensions('python'),
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
});
