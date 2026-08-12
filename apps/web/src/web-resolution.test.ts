import { readFile } from 'node:fs/promises';

import { resolveExtension } from '@vsix-scout/core';
import type { ExtensionProvider, ExtensionRecord } from '@vsix-scout/core';
import { normalizeMarketplaceResponse } from '@vsix-scout/marketplace';
import { describe, expect, it, vi } from 'vitest';

import { resolveWebQuery } from './web-resolution.js';

const fixtureRoot = new URL(
  '../../../tests/fixtures/marketplace/',
  import.meta.url,
);

async function fixtureRecord(
  filename: string,
  extensionId: string,
): Promise<ExtensionRecord> {
  const raw = JSON.parse(
    await readFile(new URL(filename, fixtureRoot), 'utf8'),
  ) as unknown;
  return normalizeMarketplaceResponse(raw, extensionId);
}

function providerFor(record: ExtensionRecord): ExtensionProvider {
  return {
    source: 'visual-studio-marketplace',
    getExtension: vi.fn(async () => record),
  };
}

describe('resolveWebQuery fixture parity', () => {
  it.each([
    {
      fixture: 'universal-prettier.json',
      extension: 'esbenp.prettier-vscode',
      vscode: '1.101.0',
      platform: 'darwin-arm64',
      channel: 'stable',
    },
    {
      fixture: 'multi-platform-python.json',
      extension: 'ms-python.python',
      vscode: '1.95.0',
      platform: 'win32-x64',
      channel: 'stable',
    },
    {
      fixture: 'prerelease-python.json',
      extension: 'ms-python.python',
      vscode: '1.95.0',
      platform: 'win32-x64',
      channel: 'pre-release',
    },
  ] as const)(
    'matches the core resolver for $fixture / $channel',
    async ({ fixture, extension, vscode, platform, channel }) => {
      const record = await fixtureRecord(fixture, extension);
      const expected = resolveExtension(record, {
        vscode,
        platform,
        channel,
      });
      const web = await resolveWebQuery(providerFor(record), {
        extension,
        vscode,
        platform,
        channel,
      });

      expect(web.selected.resolution).toEqual(expected);
      expect(web.selected.downloadUrl).toBe(
        expected.selected.assets.vsix?.primaryUri ??
          expected.selected.assets.vsix?.fallbackUri,
      );
    },
  );

  it('validates input before making a Marketplace request', async () => {
    const getExtension = vi.fn<ExtensionProvider['getExtension']>();
    const provider: ExtensionProvider = {
      source: 'visual-studio-marketplace',
      getExtension,
    };

    await expect(
      resolveWebQuery(provider, {
        extension: 'not-an-extension-id',
        vscode: '1.95.0',
        platform: 'linux-x64',
        channel: 'stable',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(getExtension).not.toHaveBeenCalled();
  });

  it('rejects a selected download URL outside the Marketplace allowlist', async () => {
    const record: ExtensionRecord = {
      extension: {
        id: 'example.extension',
        publisher: 'example',
        name: 'extension',
      },
      source: 'visual-studio-marketplace',
      versions: [
        {
          version: '1.0.0',
          targetPlatform: 'universal',
          publishedAt: '2026-01-01T00:00:00Z',
          channel: 'stable',
          engine: '^1.90.0',
          engineSource: 'property',
          dependencies: [],
          extensionPack: [],
          assets: { vsix: { primaryUri: 'https://example.com/file.vsix' } },
        },
      ],
    };

    await expect(
      resolveWebQuery(providerFor(record), {
        extension: 'example.extension',
        vscode: '1.95.0',
        platform: 'linux-x64',
        channel: 'stable',
      }),
    ).rejects.toMatchObject({ code: 'UNSAFE_RESOURCE_URL' });
  });
});
