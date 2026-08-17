import { readFile } from 'node:fs/promises';

import {
  marketplaceVspackageUrl,
  resolveExtension,
  ScoutError,
} from '@vsix-scout/core';
import type { ExtensionProvider, ExtensionRecord } from '@vsix-scout/core';
import { normalizeMarketplaceResponse } from '@vsix-scout/marketplace';
import { describe, expect, it, vi } from 'vitest';

import {
  isBareKeyword,
  resolveWebQuery,
  shouldSuggestForError,
} from './web-resolution.js';

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
        marketplaceVspackageUrl(
          expected.extension.publisher,
          expected.extension.name,
          expected.selected.version,
          expected.selected.targetPlatform,
        ),
      );
      expect(web.selected.alternateUrl).toBe(
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

describe('isBareKeyword', () => {
  it.each([
    ['python', true],
    ['  python  ', true],
    ['ms-python.python', false],
    [
      'https://marketplace.visualstudio.com/items?itemName=ms-python.python',
      false,
    ],
    ['', false],
    ['   ', false],
  ] as const)('classifies %j as %s', (input, expected) => {
    expect(isBareKeyword(input)).toBe(expected);
  });
});

describe('shouldSuggestForError', () => {
  it('suggests on EXTENSION_NOT_FOUND for any extension input', () => {
    const error = new ScoutError('EXTENSION_NOT_FOUND', 'missing');
    expect(shouldSuggestForError(error, 'ms-python.python')).toBe(true);
    expect(shouldSuggestForError(error, 'python')).toBe(true);
  });

  it('suggests on INVALID_INPUT when the input is a bare keyword', () => {
    const error = new ScoutError('INVALID_INPUT', 'bad input', {
      details: { input: 'python' },
    });
    expect(shouldSuggestForError(error, 'python')).toBe(true);
  });

  it('does not suggest on INVALID_INPUT for a full publisher.extension', () => {
    const error = new ScoutError('INVALID_INPUT', 'bad input', {
      details: { input: 'ms-python.python' },
    });
    expect(shouldSuggestForError(error, 'ms-python.python')).toBe(false);
  });

  it('does not suggest on INVALID_INPUT for a Marketplace URL', () => {
    const error = new ScoutError('INVALID_INPUT', 'bad input', {
      details: {
        input:
          'https://marketplace.visualstudio.com/items?itemName=ms-python.python',
      },
    });
    expect(
      shouldSuggestForError(
        error,
        'https://marketplace.visualstudio.com/items?itemName=ms-python.python',
      ),
    ).toBe(false);
  });

  it('ignores non-ScoutError failures', () => {
    expect(shouldSuggestForError(new Error('boom'), 'python')).toBe(false);
    expect(shouldSuggestForError('string error', 'python')).toBe(false);
  });

  it('ignores other ScoutError codes even for bare keywords', () => {
    const error = new ScoutError('UPSTREAM_UNAVAILABLE', 'network down');
    expect(shouldSuggestForError(error, 'python')).toBe(false);
  });
});
