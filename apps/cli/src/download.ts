import { createHash, randomUUID } from 'node:crypto';
import {
  link,
  lstat,
  mkdir,
  open,
  unlink,
  type FileHandle,
} from 'node:fs/promises';
import { join } from 'node:path';

import { ScoutError, type ExtensionAsset } from '@vsix-scout/core';
import { assertAllowedMarketplaceUrl } from '@vsix-scout/marketplace';
import { PROJECT_VERSION } from '@vsix-scout/shared';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

type FetchImplementation = typeof globalThis.fetch;

export interface SafeVsixDownloaderOptions {
  readonly fetch?: FetchImplementation;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly maxRedirects?: number;
  readonly userAgent?: string;
  readonly createId?: () => string;
}

export interface VsixDownloadRequest {
  readonly asset: ExtensionAsset;
  readonly expectedSha256?: string;
  readonly outputDirectory: string;
  readonly fileName: string;
}

export interface VsixDownloadResult {
  readonly fileName: string;
  readonly path: string;
  readonly sourceUrl: string;
  readonly size: number;
  readonly sha256: string;
}

export interface VsixDownloader {
  download(request: VsixDownloadRequest): Promise<VsixDownloadResult>;
}

interface DownloadedResponse {
  readonly response: Response;
  readonly finalUrl: string;
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
      { details: { option: name, value } },
    );
  }
  return value;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isFileExistsError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'EEXIST'
  );
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

async function writeAll(file: FileHandle, value: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < value.byteLength) {
    const { bytesWritten } = await file.write(
      value,
      offset,
      value.byteLength - offset,
    );
    if (bytesWritten === 0) {
      throw new Error('File write made no progress.');
    }
    offset += bytesWritten;
  }
}

function downloadError(
  message: string,
  options: {
    readonly retryable?: boolean;
    readonly details?: Readonly<Record<string, unknown>>;
    readonly cause?: unknown;
  } = {},
): ScoutError {
  return new ScoutError('DOWNLOAD_FAILED', message, options);
}

function withRedirectAccounting(urlValue: string): string {
  const url = new URL(urlValue);
  url.searchParams.set('redirect', 'true');
  return url.toString();
}

function downloadCandidates(asset: ExtensionAsset): readonly string[] {
  if (asset.fallbackUri !== undefined) {
    assertAllowedMarketplaceUrl(asset.fallbackUri);
  }
  if (asset.primaryUri !== undefined) {
    assertAllowedMarketplaceUrl(asset.primaryUri);
  }
  const candidates = [
    ...(asset.fallbackUri === undefined
      ? []
      : [withRedirectAccounting(asset.fallbackUri)]),
    ...(asset.primaryUri === undefined ? [] : [asset.primaryUri]),
  ];

  for (const candidate of candidates) {
    assertAllowedMarketplaceUrl(candidate);
  }

  return [...new Set(candidates)];
}

function redirectUrl(location: string, currentUrl: string): string {
  try {
    return new URL(location, currentUrl).toString();
  } catch (error) {
    throw new ScoutError(
      'UNSAFE_RESOURCE_URL',
      'Marketplace returned a malformed redirect URL.',
      { cause: error },
    );
  }
}

function validateFileName(fileName: string): void {
  if (
    fileName === '' ||
    fileName === '.' ||
    fileName === '..' ||
    fileName.includes('/') ||
    fileName.includes('\\') ||
    fileName.includes('\0')
  ) {
    throw downloadError('The generated VSIX filename is unsafe.', {
      details: { reason: 'unsafe-filename' },
    });
  }
}

function normalizeExpectedSha256(
  value: string | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw downloadError('The upstream VSIX checksum is malformed.', {
      details: { reason: 'invalid-upstream-checksum' },
    });
  }
  return normalized;
}

function hasZipSignature(prefix: Uint8Array): boolean {
  return (
    prefix.byteLength >= 4 &&
    prefix[0] === 0x50 &&
    prefix[1] === 0x4b &&
    ((prefix[2] === 0x03 && prefix[3] === 0x04) ||
      (prefix[2] === 0x05 && prefix[3] === 0x06) ||
      (prefix[2] === 0x07 && prefix[3] === 0x08))
  );
}

export class SafeVsixDownloader implements VsixDownloader {
  readonly #fetch: FetchImplementation;
  readonly #timeoutMs: number;
  readonly #maxBytes: number;
  readonly #maxRedirects: number;
  readonly #userAgent: string;
  readonly #createId: () => string;

  constructor(options: SafeVsixDownloaderOptions = {}) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = requireIntegerOption(
      'timeoutMs',
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      1,
    );
    this.#maxBytes = requireIntegerOption(
      'maxBytes',
      options.maxBytes ?? DEFAULT_MAX_BYTES,
      1,
    );
    this.#maxRedirects = requireIntegerOption(
      'maxRedirects',
      options.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
      0,
    );
    this.#userAgent = options.userAgent ?? `vsix-scout/${PROJECT_VERSION}`;
    this.#createId = options.createId ?? randomUUID;
  }

  async download(request: VsixDownloadRequest): Promise<VsixDownloadResult> {
    validateFileName(request.fileName);
    const expectedSha256 = normalizeExpectedSha256(request.expectedSha256);
    const candidates = downloadCandidates(request.asset);
    if (candidates.length === 0) {
      throw downloadError('The selected extension version has no VSIX asset.', {
        details: { reason: 'missing-asset' },
      });
    }

    try {
      await mkdir(request.outputDirectory, { recursive: true });
    } catch (error) {
      throw downloadError('Could not create the output directory.', {
        cause: error,
        details: { reason: 'output-directory' },
      });
    }

    const destinationPath = join(request.outputDirectory, request.fileName);
    try {
      await lstat(destinationPath);
      throw downloadError(
        `Refusing to overwrite existing file "${request.fileName}".`,
        { details: { reason: 'output-exists', fileName: request.fileName } },
      );
    } catch (error) {
      if (error instanceof ScoutError) {
        throw error;
      }
      if (!isFileNotFoundError(error)) {
        throw downloadError('Could not inspect the output destination.', {
          cause: error,
          details: { reason: 'output-destination' },
        });
      }
    }

    let lastError: ScoutError | undefined;
    for (const candidate of candidates) {
      try {
        return await this.#downloadCandidate(
          candidate,
          request,
          expectedSha256,
        );
      } catch (error) {
        if (error instanceof ScoutError) {
          if (error.code === 'UNSAFE_RESOURCE_URL') {
            throw error;
          }
          if (
            [
              'size-limit',
              'output-exists',
              'publish-file',
              'checksum-mismatch',
              'invalid-upstream-checksum',
            ].includes(String(error.details?.reason))
          ) {
            throw error;
          }
          lastError = error;
          continue;
        }
        throw error;
      }
    }

    throw (
      lastError ??
      downloadError('All official VSIX download locations failed.', {
        details: { reason: 'all-candidates-failed' },
      })
    );
  }

  async #downloadCandidate(
    initialUrl: string,
    request: VsixDownloadRequest,
    expectedSha256: string | undefined,
  ): Promise<VsixDownloadResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    let temporaryPath: string | undefined;

    try {
      const { response, finalUrl } = await this.#fetchWithRedirects(
        initialUrl,
        controller.signal,
      );
      const declaredLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > this.#maxBytes) {
        await response.body?.cancel();
        throw downloadError('The VSIX exceeds the configured size limit.', {
          details: {
            reason: 'size-limit',
            maxBytes: this.#maxBytes,
            contentLength: declaredLength,
          },
        });
      }
      if (response.body === null) {
        throw downloadError('The Marketplace returned an empty VSIX body.', {
          details: { reason: 'empty-body' },
        });
      }

      temporaryPath = join(
        request.outputDirectory,
        `.${request.fileName}.${this.#createId()}.tmp`,
      );
      const destinationPath = join(request.outputDirectory, request.fileName);
      const file = await open(temporaryPath, 'wx', 0o600);
      const reader = response.body.getReader();
      const hash = createHash('sha256');
      let size = 0;
      const prefix = new Uint8Array(4);
      let prefixLength = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          size += value.byteLength;
          if (size > this.#maxBytes) {
            await reader.cancel().catch(() => undefined);
            throw downloadError('The VSIX exceeds the configured size limit.', {
              details: {
                reason: 'size-limit',
                maxBytes: this.#maxBytes,
                receivedBytes: size,
              },
            });
          }
          if (prefixLength < prefix.byteLength) {
            const prefixBytes = value.subarray(
              0,
              Math.min(value.byteLength, prefix.byteLength - prefixLength),
            );
            prefix.set(prefixBytes, prefixLength);
            prefixLength += prefixBytes.byteLength;
          }
          await writeAll(file, value);
          hash.update(value);
        }
        await file.sync();
      } finally {
        reader.releaseLock();
        await file.close();
      }

      if (!hasZipSignature(prefix)) {
        throw downloadError('The downloaded resource is not a VSIX ZIP file.', {
          details: { reason: 'invalid-vsix-format' },
        });
      }

      const sha256 = hash.digest('hex');
      if (expectedSha256 !== undefined && sha256 !== expectedSha256) {
        throw downloadError(
          'The downloaded VSIX does not match the Marketplace SHA-256.',
          { details: { reason: 'checksum-mismatch' } },
        );
      }

      try {
        await link(temporaryPath, destinationPath);
      } catch (error) {
        if (isFileExistsError(error)) {
          throw downloadError(
            `Refusing to overwrite existing file "${request.fileName}".`,
            {
              details: { reason: 'output-exists', fileName: request.fileName },
            },
          );
        }
        throw downloadError('Could not publish the downloaded VSIX.', {
          cause: error,
          details: { reason: 'publish-file', fileName: request.fileName },
        });
      }

      await unlink(temporaryPath).catch(() => undefined);
      temporaryPath = undefined;
      return {
        fileName: request.fileName,
        path: destinationPath,
        sourceUrl: finalUrl,
        size,
        sha256,
      };
    } catch (error) {
      if (error instanceof ScoutError) {
        throw error;
      }

      const timedOut = controller.signal.aborted || isAbortError(error);
      throw downloadError(
        timedOut ? 'The VSIX download timed out.' : 'The VSIX download failed.',
        {
          cause: error,
          retryable: timedOut || error instanceof TypeError,
          details: { reason: timedOut ? 'timeout' : 'network' },
        },
      );
    } finally {
      clearTimeout(timeout);
      if (temporaryPath !== undefined) {
        await unlink(temporaryPath).catch(() => undefined);
      }
    }
  }

  async #fetchWithRedirects(
    initialUrl: string,
    signal: AbortSignal,
  ): Promise<DownloadedResponse> {
    let currentUrl = initialUrl;

    for (let redirectCount = 0; ; redirectCount += 1) {
      assertAllowedMarketplaceUrl(currentUrl);
      const response = await this.#fetch(currentUrl, {
        headers: {
          Accept: 'application/octet-stream',
          'User-Agent': this.#userAgent,
        },
        redirect: 'manual',
        signal,
      });

      if (!REDIRECT_STATUS_CODES.has(response.status)) {
        if (!response.ok) {
          await response.body?.cancel();
          throw downloadError(
            `The Marketplace returned HTTP ${response.status} for the VSIX.`,
            {
              retryable: response.status >= 500 || response.status === 429,
              details: { reason: 'http', status: response.status },
            },
          );
        }
        return { response, finalUrl: currentUrl };
      }

      await response.body?.cancel();
      if (redirectCount >= this.#maxRedirects) {
        throw downloadError('The VSIX download exceeded the redirect limit.', {
          details: {
            reason: 'redirect-limit',
            maxRedirects: this.#maxRedirects,
          },
        });
      }

      const location = response.headers.get('location');
      if (location === null) {
        throw downloadError(
          'The Marketplace returned a redirect without a location.',
          {
            details: { reason: 'redirect-location' },
          },
        );
      }
      currentUrl = redirectUrl(location, currentUrl);
      assertAllowedMarketplaceUrl(currentUrl);
    }
  }
}
