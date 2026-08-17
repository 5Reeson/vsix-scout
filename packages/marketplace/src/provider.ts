import {
  ScoutError,
  type ExtensionAsset,
  type ExtensionProvider,
  type ExtensionRecord,
  type MarketplaceSource,
} from '@vsix-scout/core';
import {
  PROJECT_VERSION,
  type ExtensionReference,
  type MarketplaceSearchResult,
  type SearchRequestOptions,
} from '@vsix-scout/shared';
import { ZodError } from 'zod';

import {
  ASSET_TYPES,
  EXTENSION_QUERY_FILTER_NAME,
  EXTENSION_QUERY_FILTER_SEARCH,
  EXTENSION_QUERY_FILTER_TARGET,
  EXTENSION_QUERY_SORT_BY_INSTALLS,
  EXTENSION_QUERY_SORT_ORDER_DESCENDING,
  EXTENSION_QUERY_TARGET_VALUE,
  HISTORY_QUERY_FLAGS,
  MARKETPLACE_API_VERSION,
  MARKETPLACE_QUERY_URL,
  SEARCH_QUERY_FLAGS,
} from './constants.js';
import {
  normalizeMarketplaceResponse,
  normalizeSearchResults,
  type ManifestFixtureMap,
} from './normalize.js';
import { MarketplaceManifestSchema } from './raw-schema.js';
import { parseMarketplaceExtensionReference } from './reference.js';
import {
  nodeMarketplaceRequestAdapter,
  type MarketplaceRequestAdapter,
} from './request-adapter.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_METADATA_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_CACHE_ENTRIES = 32;
const DEFAULT_MANIFEST_CONCURRENCY = 4;
const DEFAULT_MAX_RETRY_DELAY_MS = 2_000;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

type FetchImplementation = typeof globalThis.fetch;

export interface MarketplaceProviderOptions {
  readonly fetch?: FetchImplementation;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly maxMetadataBytes?: number;
  readonly maxManifestBytes?: number;
  readonly cacheTtlMs?: number;
  readonly maxCacheEntries?: number;
  readonly manifestConcurrency?: number;
  readonly maxRetryDelayMs?: number;
  readonly userAgent?: string;
  readonly requestAdapter?: MarketplaceRequestAdapter;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

interface CacheEntry {
  readonly expiresAt: number;
  readonly record: ExtensionRecord;
  readonly attemptedManifestKeys: ReadonlySet<string>;
}

export interface MarketplaceExtensionRequestOptions {
  /** Maximum number of missing manifest assets to inspect in this request. */
  readonly manifestLimit?: number;
  /** Limit manifest fallback work to one release channel. */
  readonly channel?: 'stable' | 'pre-release';
  /** Limit manifest fallback work to an exact platform plus universal builds. */
  readonly platform?: string;
}

export type MarketplaceSearchRequestOptions = SearchRequestOptions;

const DEFAULT_SEARCH_LIMIT = 8;

interface ManifestLoadResult {
  readonly manifests: ManifestFixtureMap;
  readonly attemptedKeys: ReadonlySet<string>;
}

interface RequestJsonOptions {
  readonly resource: 'metadata' | 'manifest';
  readonly maxBytes: number;
  readonly allowNotFound?: boolean;
}

function requireIntegerOption(
  name: string,
  value: number,
  minimum: number,
): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new ScoutError(
      'INVALID_INPUT',
      `${name} must be an integer >= ${minimum}.`,
      {
        details: { option: name, value },
      },
    );
  }

  return value;
}

function parseRetryAfter(
  value: string | null,
  now: number,
): number | undefined {
  if (value === null) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function readResponseText(
  response: Response,
  maxBytes: number,
  resource: RequestJsonOptions['resource'],
): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));

  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new ScoutError(
      'UPSTREAM_INVALID_RESPONSE',
      `Marketplace ${resource} response exceeded the configured size limit.`,
      {
        details: {
          resource,
          maxBytes,
          contentLength: declaredLength,
        },
      },
    );
  }

  if (response.body === null) {
    return '';
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ScoutError(
          'UPSTREAM_INVALID_RESPONSE',
          `Marketplace ${resource} response exceeded the configured size limit.`,
          { details: { resource, maxBytes, receivedBytes: totalBytes } },
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(body);
}

function parseJson(
  text: string,
  resource: RequestJsonOptions['resource'],
): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ScoutError(
      'UPSTREAM_INVALID_RESPONSE',
      `Marketplace ${resource} response was not valid JSON.`,
      { cause: error, details: { resource } },
    );
  }
}

async function mapWithConcurrency<T, U>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value !== undefined) {
        results[index] = await operation(value);
      }
    }
  }

  const workerCount = Math.min(concurrency, values.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export class MarketplaceProvider implements ExtensionProvider {
  readonly source: MarketplaceSource = 'visual-studio-marketplace';

  readonly #fetch: FetchImplementation;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;
  readonly #maxMetadataBytes: number;
  readonly #maxManifestBytes: number;
  readonly #cacheTtlMs: number;
  readonly #maxCacheEntries: number;
  readonly #manifestConcurrency: number;
  readonly #maxRetryDelayMs: number;
  readonly #userAgent: string;
  readonly #requestAdapter: MarketplaceRequestAdapter;
  readonly #now: () => number;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #cache = new Map<string, CacheEntry>();
  readonly #inFlight = new Map<
    string,
    Promise<Omit<CacheEntry, 'expiresAt'>>
  >();

  constructor(options: MarketplaceProviderOptions = {}) {
    this.#fetch = (options.fetch ?? globalThis.fetch).bind(globalThis);
    this.#timeoutMs = requireIntegerOption(
      'timeoutMs',
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      1,
    );
    this.#maxRetries = requireIntegerOption(
      'maxRetries',
      options.maxRetries ?? DEFAULT_MAX_RETRIES,
      0,
    );
    this.#maxMetadataBytes = requireIntegerOption(
      'maxMetadataBytes',
      options.maxMetadataBytes ?? DEFAULT_MAX_METADATA_BYTES,
      1,
    );
    this.#maxManifestBytes = requireIntegerOption(
      'maxManifestBytes',
      options.maxManifestBytes ?? DEFAULT_MAX_MANIFEST_BYTES,
      1,
    );
    this.#cacheTtlMs = requireIntegerOption(
      'cacheTtlMs',
      options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
      0,
    );
    this.#maxCacheEntries = requireIntegerOption(
      'maxCacheEntries',
      options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES,
      0,
    );
    this.#manifestConcurrency = requireIntegerOption(
      'manifestConcurrency',
      options.manifestConcurrency ?? DEFAULT_MANIFEST_CONCURRENCY,
      1,
    );
    this.#maxRetryDelayMs = requireIntegerOption(
      'maxRetryDelayMs',
      options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS,
      0,
    );
    this.#userAgent = options.userAgent ?? `vsix-scout/${PROJECT_VERSION}`;
    this.#requestAdapter =
      options.requestAdapter ?? nodeMarketplaceRequestAdapter;
    this.#now = options.now ?? Date.now;
    this.#sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => {
          setTimeout(resolve, milliseconds);
        }));
  }

  clearCache(): void {
    this.#cache.clear();
  }

  async getExtension(
    reference: ExtensionReference,
    options: MarketplaceExtensionRequestOptions = {},
  ): Promise<ExtensionRecord> {
    const normalizedReference = parseMarketplaceExtensionReference(
      reference.id,
    );
    const cached = this.#cache.get(normalizedReference.id);
    if (cached !== undefined && cached.expiresAt > this.#now()) {
      this.#cache.delete(normalizedReference.id);
      const enriched = await this.#enrichRecord(cached, options);
      this.#cache.set(normalizedReference.id, enriched);
      return enriched.record;
    }
    if (cached !== undefined) {
      this.#cache.delete(normalizedReference.id);
    }

    const existingRequest = this.#inFlight.get(normalizedReference.id);
    if (existingRequest !== undefined) {
      const entry = await existingRequest;
      const cachedAfterRequest = this.#cache.get(normalizedReference.id);
      const baseEntry =
        cachedAfterRequest !== undefined
          ? cachedAfterRequest
          : { ...entry, expiresAt: this.#now() + this.#cacheTtlMs };
      const enriched = await this.#enrichRecord(baseEntry, options);
      if (cachedAfterRequest !== undefined) {
        this.#cache.set(normalizedReference.id, enriched);
      }
      return enriched.record;
    }

    const request = this.#loadExtension(normalizedReference, options);
    this.#inFlight.set(normalizedReference.id, request);

    try {
      const entry = await request;
      this.#cacheRecord(normalizedReference.id, entry);
      return entry.record;
    } finally {
      this.#inFlight.delete(normalizedReference.id);
    }
  }

  async searchExtensions(
    keyword: string,
    options: MarketplaceSearchRequestOptions = {},
  ): Promise<readonly MarketplaceSearchResult[]> {
    const term = keyword.trim();
    if (term === '') {
      throw new ScoutError(
        'INVALID_INPUT',
        'Search keyword must not be empty.',
        { details: { field: 'keyword' } },
      );
    }
    const limit =
      options.limit === undefined
        ? DEFAULT_SEARCH_LIMIT
        : requireIntegerOption('limit', options.limit, 1);

    const rawResponse = await this.#requestJson(
      MARKETPLACE_QUERY_URL,
      {
        method: 'POST',
        headers: {
          Accept: `application/json;api-version=${MARKETPLACE_API_VERSION}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filters: [
            {
              criteria: [
                { filterType: EXTENSION_QUERY_FILTER_SEARCH, value: term },
                {
                  filterType: EXTENSION_QUERY_FILTER_TARGET,
                  value: EXTENSION_QUERY_TARGET_VALUE,
                },
              ],
              pageNumber: 1,
              pageSize: limit,
              sortBy: EXTENSION_QUERY_SORT_BY_INSTALLS,
              sortOrder: EXTENSION_QUERY_SORT_ORDER_DESCENDING,
            },
          ],
          flags: SEARCH_QUERY_FLAGS,
        }),
      },
      { resource: 'metadata', maxBytes: this.#maxMetadataBytes },
    );

    return normalizeSearchResults(rawResponse);
  }

  hasPendingManifests(
    reference: ExtensionReference,
    options: Omit<MarketplaceExtensionRequestOptions, 'manifestLimit'> = {},
  ): boolean {
    const normalizedReference = parseMarketplaceExtensionReference(
      reference.id,
    );
    const cached = this.#cache.get(normalizedReference.id);
    if (cached === undefined || cached.expiresAt <= this.#now()) {
      return false;
    }
    return (
      this.#missingManifestAssets(
        cached.record,
        options,
        cached.attemptedManifestKeys,
      ).length > 0
    );
  }

  #cacheRecord(
    extensionId: string,
    entry: Omit<CacheEntry, 'expiresAt'>,
  ): void {
    if (this.#cacheTtlMs === 0 || this.#maxCacheEntries === 0) {
      return;
    }

    const now = this.#now();
    for (const [key, entry] of this.#cache) {
      if (entry.expiresAt <= now) {
        this.#cache.delete(key);
      }
    }

    while (this.#cache.size >= this.#maxCacheEntries) {
      const oldestKey = this.#cache.keys().next().value as string | undefined;
      if (oldestKey === undefined) {
        break;
      }
      this.#cache.delete(oldestKey);
    }

    this.#cache.set(extensionId, {
      expiresAt: now + this.#cacheTtlMs,
      ...entry,
    });
  }

  async #loadExtension(
    reference: ExtensionReference,
    options: MarketplaceExtensionRequestOptions,
  ): Promise<Omit<CacheEntry, 'expiresAt'>> {
    const rawResponse = await this.#requestJson(
      MARKETPLACE_QUERY_URL,
      {
        method: 'POST',
        headers: {
          Accept: `application/json;api-version=${MARKETPLACE_API_VERSION}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filters: [
            {
              criteria: [
                {
                  filterType: EXTENSION_QUERY_FILTER_NAME,
                  value: reference.id,
                },
              ],
              pageNumber: 1,
              pageSize: 1,
            },
          ],
          assetTypes: [ASSET_TYPES.manifest, ASSET_TYPES.vsix],
          flags: HISTORY_QUERY_FLAGS,
        }),
      },
      { resource: 'metadata', maxBytes: this.#maxMetadataBytes },
    );

    const initialRecord = normalizeMarketplaceResponse(
      rawResponse,
      reference.id,
    );
    const loaded = await this.#loadMissingManifests(
      initialRecord,
      options,
      new Set(),
    );
    return {
      record:
        Object.keys(loaded.manifests).length === 0
          ? initialRecord
          : normalizeMarketplaceResponse(
              rawResponse,
              reference.id,
              loaded.manifests,
            ),
      attemptedManifestKeys: loaded.attemptedKeys,
    };
  }

  async #enrichRecord(
    cached: CacheEntry,
    options: MarketplaceExtensionRequestOptions,
  ): Promise<CacheEntry> {
    const loaded = await this.#loadMissingManifests(
      cached.record,
      options,
      cached.attemptedManifestKeys,
    );
    if (loaded.attemptedKeys.size === 0) {
      return cached;
    }

    const manifests = loaded.manifests;
    const versions = cached.record.versions.map((version) => {
      if (version.engineSource !== 'missing') return version;
      const asset = version.assets.manifest;
      const rawManifest = [asset?.primaryUri, asset?.fallbackUri]
        .filter((url): url is string => url !== undefined)
        .map((url) => manifests[url])
        .find((manifest) => manifest !== undefined);
      if (rawManifest === undefined) return version;
      const manifest = MarketplaceManifestSchema.parse(rawManifest);
      const engine = manifest.engines?.vscode.trim();
      if (engine === undefined || engine === '') return version;
      return {
        ...version,
        engine,
        engineSource: 'manifest' as const,
        dependencies: manifest.extensionDependencies ?? version.dependencies,
        extensionPack: manifest.extensionPack ?? version.extensionPack,
      };
    });

    return {
      expiresAt: cached.expiresAt,
      record: { ...cached.record, versions },
      attemptedManifestKeys: new Set([
        ...cached.attemptedManifestKeys,
        ...loaded.attemptedKeys,
      ]),
    };
  }

  #missingManifestAssets(
    record: ExtensionRecord,
    options: Omit<MarketplaceExtensionRequestOptions, 'manifestLimit'>,
    attemptedKeys: ReadonlySet<string>,
  ): readonly { readonly key: string; readonly asset: ExtensionAsset }[] {
    const assetsByKey = new Map<string, ExtensionAsset>();
    const platform = options.platform?.trim().toLowerCase();

    for (const version of record.versions) {
      const asset = version.assets.manifest;
      const candidatePlatform = version.targetPlatform.toLowerCase();
      if (
        version.engineSource !== 'missing' ||
        asset === undefined ||
        (options.channel !== undefined &&
          version.channel !== options.channel) ||
        (platform !== undefined &&
          candidatePlatform !== platform &&
          candidatePlatform !== 'universal')
      ) {
        continue;
      }
      const key = `${asset.primaryUri ?? ''}\n${asset.fallbackUri ?? ''}`;
      if (!attemptedKeys.has(key)) assetsByKey.set(key, asset);
    }

    return [...assetsByKey].map(([key, asset]) => ({ key, asset }));
  }

  async #loadMissingManifests(
    record: ExtensionRecord,
    options: MarketplaceExtensionRequestOptions,
    attemptedKeys: ReadonlySet<string>,
  ): Promise<ManifestLoadResult> {
    const limit =
      options.manifestLimit === undefined
        ? undefined
        : requireIntegerOption('manifestLimit', options.manifestLimit, 0);
    const pending = this.#missingManifestAssets(record, options, attemptedKeys);
    const selected = limit === undefined ? pending : pending.slice(0, limit);

    const loaded = await mapWithConcurrency(
      selected,
      this.#manifestConcurrency,
      ({ asset }) => this.#loadManifest(asset),
    );
    const manifests: Record<string, unknown> = {};

    for (const result of loaded) {
      if (result !== undefined) {
        manifests[result.url] = result.manifest;
      }
    }

    return {
      manifests,
      attemptedKeys: new Set(selected.map(({ key }) => key)),
    };
  }

  async #loadManifest(
    asset: ExtensionAsset,
  ): Promise<{ readonly url: string; readonly manifest: unknown } | undefined> {
    const urls = [asset.primaryUri, asset.fallbackUri].filter(
      (url): url is string => url !== undefined,
    );
    let lastError: ScoutError | undefined;

    for (const url of urls) {
      try {
        const rawManifest = await this.#requestJson(
          url,
          {
            headers: {
              Accept: 'application/json',
            },
          },
          {
            resource: 'manifest',
            maxBytes: this.#maxManifestBytes,
            allowNotFound: true,
          },
        );

        if (rawManifest === undefined) {
          continue;
        }

        try {
          return {
            url,
            manifest: MarketplaceManifestSchema.parse(rawManifest),
          };
        } catch (error) {
          if (error instanceof ZodError) {
            lastError = new ScoutError(
              'UPSTREAM_INVALID_RESPONSE',
              'A Marketplace manifest did not match the expected shape.',
              {
                cause: error,
                details: {
                  resource: 'manifest',
                  url,
                  issues: error.issues.map((issue) => ({
                    path: issue.path.join('.'),
                    message: issue.message,
                  })),
                },
              },
            );
            continue;
          }
          throw error;
        }
      } catch (error) {
        if (error instanceof ScoutError) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }

    if (lastError !== undefined) {
      throw lastError;
    }
    return undefined;
  }

  async #requestJson(
    url: string,
    init: RequestInit,
    options: RequestJsonOptions,
  ): Promise<unknown | undefined> {
    this.#requestAdapter.validateRequest(url);

    for (let attempt = 0; attempt <= this.#maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);

      try {
        const response = await this.#fetch(
          url,
          this.#requestAdapter.prepareRequest(
            { ...init, signal: controller.signal },
            this.#userAgent,
          ),
        );
        this.#requestAdapter.validateResponse(response, url);

        if (
          options.allowNotFound === true &&
          [404, 410].includes(response.status)
        ) {
          await response.body?.cancel();
          return undefined;
        }

        if (!response.ok) {
          await response.body?.cancel();
          const retryAfterMs = parseRetryAfter(
            response.headers.get('retry-after'),
            this.#now(),
          );
          const retryable = RETRYABLE_STATUS_CODES.has(response.status);

          if (retryable && attempt < this.#maxRetries) {
            const delay = Math.min(
              retryAfterMs ?? 250 * 2 ** attempt,
              this.#maxRetryDelayMs,
            );
            await this.#sleep(delay);
            continue;
          }

          throw new ScoutError(
            'UPSTREAM_UNAVAILABLE',
            response.status === 429
              ? 'Visual Studio Marketplace rate limit was exceeded.'
              : `Visual Studio Marketplace returned HTTP ${response.status}.`,
            {
              retryable,
              details: {
                resource: options.resource,
                status: response.status,
                attempts: attempt + 1,
                ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
              },
            },
          );
        }

        const text = await readResponseText(
          response,
          options.maxBytes,
          options.resource,
        );
        return parseJson(text, options.resource);
      } catch (error) {
        if (error instanceof ScoutError) {
          throw error;
        }

        const timedOut = controller.signal.aborted || isAbortError(error);
        if (attempt < this.#maxRetries) {
          await this.#sleep(
            Math.min(250 * 2 ** attempt, this.#maxRetryDelayMs),
          );
          continue;
        }

        throw new ScoutError(
          'UPSTREAM_UNAVAILABLE',
          timedOut
            ? `Visual Studio Marketplace ${options.resource} request timed out.`
            : `Visual Studio Marketplace ${options.resource} request failed.`,
          {
            cause: error,
            retryable: true,
            details: {
              resource: options.resource,
              reason: timedOut ? 'timeout' : 'network',
              attempts: attempt + 1,
            },
          },
        );
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error('Marketplace request retry loop ended unexpectedly.');
  }
}
