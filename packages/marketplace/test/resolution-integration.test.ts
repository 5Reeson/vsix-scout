import { readFile } from 'node:fs/promises';

import { resolveExtension } from '@vsix-scout/core';
import { describe, expect, it } from 'vitest';

import { normalizeMarketplaceResponse } from '../src/index.js';

const fixtureRoot = new URL(
  '../../../tests/fixtures/marketplace/',
  import.meta.url,
);

async function normalizedFixture(filename: string, extensionId: string) {
  const raw = JSON.parse(
    await readFile(new URL(filename, fixtureRoot), 'utf8'),
  ) as unknown;
  return normalizeMarketplaceResponse(raw, extensionId);
}

describe('Marketplace normalization to core resolution', () => {
  it('resolves a real universal Prettier snapshot', async () => {
    const record = await normalizedFixture(
      'universal-prettier.json',
      'esbenp.prettier-vscode',
    );
    const result = resolveExtension(record, {
      vscode: '1.101.0',
      platform: 'darwin-arm64',
    });

    expect(result.selected.version).toBe('12.4.0');
    expect(result.compatibility.platformMatch).toBe('universal');
  });

  it('selects the exact platform from a real multi-platform snapshot', async () => {
    const record = await normalizedFixture(
      'multi-platform-python.json',
      'ms-python.python',
    );
    const result = resolveExtension(record, {
      vscode: '1.95.0',
      platform: 'win32-x64',
    });

    expect(result.selected).toMatchObject({
      version: '2026.4.0',
      targetPlatform: 'win32-x64',
    });
    expect(result.compatibility.platformMatch).toBe('exact');
  });

  it.each([
    ['stable', '2026.4.0'],
    ['pre-release', '2026.7.2026080801'],
  ] as const)(
    'selects the %s channel from a real mixed snapshot',
    async (channel, version) => {
      const record = await normalizedFixture(
        'prerelease-python.json',
        'ms-python.python',
      );
      const result = resolveExtension(record, {
        vscode: '1.95.0',
        platform: 'win32-x64',
        channel,
      });

      expect(result.selected.version).toBe(version);
      expect(result.selected.channel).toBe(channel);
    },
  );
});
