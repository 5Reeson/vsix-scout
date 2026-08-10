import {
  ScoutError,
  type ExtensionAsset,
  type ExtensionProvider,
  type ExtensionRecord,
  type MarketplaceSource,
} from '@vsix-scout/core';
import { PROJECT_VERSION, type ExtensionReference } from '@vsix-scout/shared';
import { ZodError } from 'zod';

import {
  ASSET_TYPES,
  EXTENSION_QUERY_FILTER_NAME,
  HISTORY_QUERY_FLAGS,
  MARKETPLACE_API_VERSION,
  MARKETPLACE_QUERY_URL,
} from './constants.js';
import {
  normalizeMarketplaceResponse,
  type ManifestFixtureMap,
} from './normalize.js';
import { MarketplaceManifestSchema } from './raw-schema.js';
import { parseMarketplaceExtensionReference } from './reference.js';

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
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

interface CacheEntry {
  readonly expiresAt: number;
  readonly record: ExtensionRecord;
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
  readonly #now: () => number;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #cache = new Map<string, CacheEntry>();
  readonly #inFlight = new Map<string, Promise<ExtensionRecord>>();

  constructor(options: MarketplaceProviderOptions = {}) {
    this.#fetch = options.fetch ?? globalThis.fetch;
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

  async getExtension(reference: ExtensionReference): Promise<ExtensionRecord> {
    const normalizedReference = parseMarketplaceExtensionReference(
      reference.id,
    );
    const cached = this.#cache.get(normalizedReference.id);
    if (cached !== undefined && cached.expiresAt > this.#now()) {
      this.#cache.delete(normalizedReference.id);
      this.#cache.set(normalizedReference.id, cached);
      return cached.record;
    }
    if (cached !== undefined) {
      this.#cache.delete(normalizedReference.id);
    }

    const existingRequest = this.#inFlight.get(normalizedReference.id);
    if (existingRequest !== undefined) {
      return existingRequest;
    }

    const request = this.#loadExtension(normalizedReference);
    this.#inFlight.set(normalizedReference.id, request);

    try {
      const record = await request;
      this.#cacheRecord(normalizedReference.id, record);
      return record;
    } finally {
      this.#inFlight.delete(normalizedReference.id);
    }
  }

  #cacheRecord(extensionId: string, record: ExtensionRecord): void {
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
      record,
    });
  }

  async #loadExtension(
    reference: ExtensionReference,
  ): Promise<ExtensionRecord> {
    const rawResponse = await this.#requestJson(
      MARKETPLACE_QUERY_URL,
      {
        method: 'POST',
        headers: {
          Accept: `application/json;api-version=${MARKETPLACE_API_VERSION}`,
          'Content-Type': 'application/json',
          'User-Agent': this.#userAgent,
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
    const manifests = await this.#loadMissingManifests(initialRecord);
    return Object.keys(manifests).length === 0
      ? initialRecord
      : normalizeMarketplaceResponse(rawResponse, reference.id, manifests);
  }

  async #loadMissingManifests(
    record: ExtensionRecord,
  ): Promise<ManifestFixtureMap> {
    const assetsByKey = new Map<string, ExtensionAsset>();

    for (const version of record.versions) {
      const asset = version.assets.manifest;
      if (version.engineSource === 'missing' && asset !== undefined) {
        assetsByKey.set(
          `${asset.primaryUri ?? ''}\n${asset.fallbackUri ?? ''}`,
          asset,
        );
      }
    }

    const loaded = await mapWithConcurrency(
      [...assetsByKey.values()],
      this.#manifestConcurrency,
      (asset) => this.#loadManifest(asset),
    );
    const manifests: Record<string, unknown> = {};

    for (const result of loaded) {
      if (result !== undefined) {
        manifests[result.url] = result.manifest;
      }
    }

    return manifests;
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
              'User-Agent': this.#userAgent,
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
    for (let attempt = 0; attempt <= this.#maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);

      try {
        const response = await this.#fetch(url, {
          ...init,
          redirect: 'manual',
          signal: controller.signal,
        });

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
