import { readFile } from 'node:fs/promises';

import type { ScoutError } from '@vsix-scout/core';
import { describe, expect, it } from 'vitest';

import { normalizeMarketplaceResponse } from '../src/index.js';

const fixtureRoot = new URL('../../../tests/fixtures/', import.meta.url);

async function readJson(relativePath: string): Promise<unknown> {
  return JSON.parse(
    await readFile(new URL(relativePath, fixtureRoot), 'utf8'),
  ) as unknown;
}

describe('normalizeMarketplaceResponse', () => {
  it('normalizes a missing targetPlatform as universal', async () => {
    const response = await readJson('marketplace/universal-prettier.json');
    const record = normalizeMarketplaceResponse(
      response,
      'esbenp.prettier-vscode',
    );

    expect(record.extension.id).toBe('esbenp.prettier-vscode');
    expect(record.versions).toHaveLength(1);
    expect(record.versions[0]).toMatchObject({
      version: '12.4.0',
      targetPlatform: 'universal',
      channel: 'stable',
      engine: '^1.101.0',
      engineSource: 'property',
      upstreamSha256:
        '46d22a567b35ebe5bdffd7280457742cd67e65d7e1b250bb775ab2be86479a42',
    });
  });

  it('preserves platform variants as separate candidates', async () => {
    const response = await readJson('marketplace/multi-platform-python.json');
    const record = normalizeMarketplaceResponse(response, 'ms-python.python');

    expect(record.versions.map((version) => version.targetPlatform)).toEqual([
      'win32-arm64',
      'win32-x64',
      'linux-x64',
    ]);
    expect(new Set(record.versions.map((version) => version.version))).toEqual(
      new Set(['2026.4.0']),
    );
    expect(record.versions[1]?.assets.vsix?.fallbackUri).toContain(
      'targetPlatform=win32-x64',
    );
    expect(record.versions[1]?.extensionPack).toEqual([
      'ms-python.vscode-pylance',
      'ms-python.debugpy',
      'ms-python.vscode-python-envs',
    ]);
  });

  it('derives stable and pre-release channels from version properties', async () => {
    const response = await readJson('marketplace/prerelease-python.json');
    const record = normalizeMarketplaceResponse(response, 'ms-python.python');

    expect(record.versions.map((version) => version.channel)).toEqual([
      'pre-release',
      'stable',
    ]);
  });

  it('uses a manifest when the Engine property is absent', async () => {
    const response = await readJson('marketplace/engine-fallback-python.json');
    const manifest = await readJson('manifests/python-0.7.0.json');
    const fallbackManifestUri =
      'https://ms-python.gallery.vsassets.io/_apis/public/gallery/publisher/ms-python/extension/python/0.7.0/assetbyname/Microsoft.VisualStudio.Code.Manifest';
    const record = normalizeMarketplaceResponse(response, 'ms-python.python', {
      [fallbackManifestUri]: manifest,
    });

    expect(record.versions[0]).toMatchObject({
      version: '0.7.0',
      targetPlatform: 'universal',
      engine: '^1.9.0',
      engineSource: 'manifest',
    });
  });

  it('reports invalid upstream data with a stable error code', () => {
    expect(() =>
      normalizeMarketplaceResponse({ results: [{}] }, 'ms-python.python'),
    ).toThrowError(
      expect.objectContaining<ScoutError>({
        code: 'UPSTREAM_INVALID_RESPONSE',
      }),
    );
  });

  it('rejects asset URLs outside the Marketplace allowlist', async () => {
    const response = (await readJson(
      'marketplace/universal-prettier.json',
    )) as {
      results: Array<{
        extensions: Array<{
          versions: Array<{
            files: Array<{ assetType: string; source: string }>;
          }>;
        }>;
      }>;
    };
    const file = response.results[0]?.extensions[0]?.versions[0]?.files[0];

    if (file === undefined) {
      throw new Error('Fixture did not contain the expected asset file.');
    }
    file.source = 'https://example.com/untrusted-vsix';

    expect(() =>
      normalizeMarketplaceResponse(response, 'esbenp.prettier-vscode'),
    ).toThrowError(
      expect.objectContaining<ScoutError>({ code: 'UNSAFE_RESOURCE_URL' }),
    );
  });
});
