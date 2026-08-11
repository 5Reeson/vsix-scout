import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ExtensionAsset, ScoutError } from '@vsix-scout/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SafeVsixDownloader } from '../src/index.js';

const asset: ExtensionAsset = {
  primaryUri:
    'https://example.gallerycdn.vsassets.io/extensions/example/extension/file',
  fallbackUri:
    'https://example.gallery.vsassets.io/_apis/public/gallery/publisher/example/extension/extension/1.0.0/assetbyname/Microsoft.VisualStudio.Services.VSIXPackage',
};
const directories: string[] = [];
const zipHeader = Uint8Array.from([0x50, 0x4b, 0x03, 0x04]);

function vsixBytes(payload: string): Uint8Array {
  const suffix = new TextEncoder().encode(payload);
  const bytes = new Uint8Array(zipHeader.byteLength + suffix.byteLength);
  bytes.set(zipHeader);
  bytes.set(suffix, zipHeader.byteLength);
  return bytes;
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'vsix-scout-test-'));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('SafeVsixDownloader', () => {
  it('validates redirects, streams bytes, and calculates SHA-256', async () => {
    const directory = await temporaryDirectory();
    const bytes = vsixBytes('valid-vsix-content');
    const expectedSha256 = createHash('sha256').update(bytes).digest('hex');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            Location:
              'https://example.gallerycdn.vsassets.io/extensions/example/extension/download',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(bytes, {
          headers: { 'Content-Length': String(bytes.byteLength) },
        }),
      );
    const downloader = new SafeVsixDownloader({
      fetch: fetchMock,
      createId: () => 'fixed',
    });

    const result = await downloader.download({
      asset,
      expectedSha256,
      outputDirectory: directory,
      fileName: 'example.vsix',
    });

    expect(await readFile(join(directory, 'example.vsix'))).toEqual(
      Buffer.from(bytes),
    );
    expect(result).toMatchObject({
      fileName: 'example.vsix',
      size: bytes.byteLength,
      sha256: expectedSha256,
      sourceUrl:
        'https://example.gallerycdn.vsassets.io/extensions/example/extension/download',
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('redirect=true');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
    expect(await readdir(directory)).toEqual(['example.vsix']);
  });

  it('rejects invalid content and removes the temporary file', async () => {
    const directory = await temporaryDirectory();
    const downloader = new SafeVsixDownloader({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response('not-a-zip')),
      createId: () => 'invalid',
    });

    await expect(
      downloader.download({
        asset: { primaryUri: asset.primaryUri },
        outputDirectory: directory,
        fileName: 'example.vsix',
      }),
    ).rejects.toMatchObject<ScoutError>({
      code: 'DOWNLOAD_FAILED',
      details: { reason: 'invalid-vsix-format' },
    });
    expect(await readdir(directory)).toEqual([]);
  });

  it('enforces an upstream SHA-256 before publishing the file', async () => {
    const directory = await temporaryDirectory();
    const downloader = new SafeVsixDownloader({
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(vsixBytes('valid-content'))),
      createId: () => 'mismatch',
    });

    await expect(
      downloader.download({
        asset,
        expectedSha256: 'f'.repeat(64),
        outputDirectory: directory,
        fileName: 'example.vsix',
      }),
    ).rejects.toMatchObject<ScoutError>({
      code: 'DOWNLOAD_FAILED',
      details: { reason: 'checksum-mismatch' },
    });
    expect(await readdir(directory)).toEqual([]);
  });

  it('rejects malformed upstream checksums without making a request', async () => {
    const directory = await temporaryDirectory();
    const fetchMock = vi.fn<typeof fetch>();
    const downloader = new SafeVsixDownloader({ fetch: fetchMock });

    await expect(
      downloader.download({
        asset,
        expectedSha256: 'not-a-sha256',
        outputDirectory: directory,
        fileName: 'example.vsix',
      }),
    ).rejects.toMatchObject<ScoutError>({
      code: 'DOWNLOAD_FAILED',
      details: { reason: 'invalid-upstream-checksum' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await readdir(directory)).toEqual([]);
  });

  it('rejects a redirect outside the official allowlist', async () => {
    const directory = await temporaryDirectory();
    const downloader = new SafeVsixDownloader({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { Location: 'https://evil.example/payload.vsix' },
        }),
      ),
    });

    await expect(
      downloader.download({
        asset,
        outputDirectory: directory,
        fileName: 'example.vsix',
      }),
    ).rejects.toMatchObject<ScoutError>({ code: 'UNSAFE_RESOURCE_URL' });
    expect(await readdir(directory)).toEqual([]);
  });

  it('enforces the redirect count limit', async () => {
    const directory = await temporaryDirectory();
    const downloader = new SafeVsixDownloader({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: {
            Location:
              'https://example.gallerycdn.vsassets.io/extensions/example/extension/again',
          },
        }),
      ),
      maxRedirects: 0,
    });

    await expect(
      downloader.download({
        asset,
        outputDirectory: directory,
        fileName: 'example.vsix',
      }),
    ).rejects.toMatchObject<ScoutError>({
      code: 'DOWNLOAD_FAILED',
      details: { reason: 'redirect-limit', maxRedirects: 0 },
    });
    expect(await readdir(directory)).toEqual([]);
  });

  it('enforces declared and streamed size limits', async () => {
    const declaredDirectory = await temporaryDirectory();
    const streamedDirectory = await temporaryDirectory();
    const declared = new SafeVsixDownloader({
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response('small', { headers: { 'Content-Length': '100' } }),
        ),
      maxBytes: 10,
    });
    const streamed = new SafeVsixDownloader({
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('01234567890')),
      maxBytes: 10,
    });

    await expect(
      declared.download({
        asset,
        outputDirectory: declaredDirectory,
        fileName: 'declared.vsix',
      }),
    ).rejects.toMatchObject<ScoutError>({
      code: 'DOWNLOAD_FAILED',
      details: { reason: 'size-limit', contentLength: 100 },
    });
    await expect(
      streamed.download({
        asset,
        outputDirectory: streamedDirectory,
        fileName: 'streamed.vsix',
      }),
    ).rejects.toMatchObject<ScoutError>({
      code: 'DOWNLOAD_FAILED',
      details: { reason: 'size-limit', receivedBytes: 11 },
    });
    expect(await readdir(declaredDirectory)).toEqual([]);
    expect(await readdir(streamedDirectory)).toEqual([]);
  });

  it('cleans partial files after an interrupted body', async () => {
    const directory = await temporaryDirectory();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('partial'));
          controller.error(new Error('connection interrupted'));
        },
      });
      return new Response(body);
    });
    const downloader = new SafeVsixDownloader({
      fetch: fetchMock,
      createId: () => 'partial',
    });

    await expect(
      downloader.download({
        asset,
        outputDirectory: directory,
        fileName: 'example.vsix',
      }),
    ).rejects.toMatchObject<ScoutError>({ code: 'DOWNLOAD_FAILED' });
    expect(await readdir(directory)).toEqual([]);
  });

  it('times out stalled downloads and removes temporary files', async () => {
    const directory = await temporaryDirectory();
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
    const downloader = new SafeVsixDownloader({
      fetch: fetchMock,
      timeoutMs: 5,
    });

    await expect(
      downloader.download({
        asset,
        outputDirectory: directory,
        fileName: 'example.vsix',
      }),
    ).rejects.toMatchObject<ScoutError>({
      code: 'DOWNLOAD_FAILED',
      details: { reason: 'timeout' },
    });
    expect(await readdir(directory)).toEqual([]);
  });

  it('refuses to overwrite an existing output before making a request', async () => {
    const directory = await temporaryDirectory();
    const destination = join(directory, 'example.vsix');
    await writeFile(destination, 'existing');
    const fetchMock = vi.fn<typeof fetch>();
    const downloader = new SafeVsixDownloader({ fetch: fetchMock });

    await expect(
      downloader.download({
        asset,
        outputDirectory: directory,
        fileName: 'example.vsix',
      }),
    ).rejects.toMatchObject<ScoutError>({
      code: 'DOWNLOAD_FAILED',
      details: { reason: 'output-exists', fileName: 'example.vsix' },
    });
    expect(await readFile(destination, 'utf8')).toBe('existing');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
