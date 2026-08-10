import { resolveExtension } from '@vsix-scout/core';
import { describe, expect, it } from 'vitest';

import {
  MarketplaceProvider,
  parseMarketplaceExtensionReference,
} from '../src/index.js';

const LIVE_EXTENSIONS = [
  'esbenp.prettier-vscode',
  'dbaeumer.vscode-eslint',
  'redhat.vscode-yaml',
] as const;
const liveDescribe =
  process.env.VSIX_SCOUT_LIVE_MARKETPLACE === '1' ? describe : describe.skip;

liveDescribe('MarketplaceProvider live service', () => {
  it('normalizes three representative extensions end to end', async () => {
    const provider = new MarketplaceProvider({ timeoutMs: 20_000 });

    for (const extensionId of LIVE_EXTENSIONS) {
      const record = await provider.getExtension(
        parseMarketplaceExtensionReference(extensionId),
      );
      expect(record.extension.id).toBe(extensionId);
      expect(record.versions.length).toBeGreaterThan(0);
      expect(
        record.versions.some(
          (version) =>
            version.assets.vsix?.primaryUri !== undefined ||
            version.assets.vsix?.fallbackUri !== undefined,
        ),
      ).toBe(true);

      const resolution = resolveExtension(record, {
        vscode: '1.200.0',
        platform: 'linux-x64',
      });
      expect(resolution.extension.id).toBe(extensionId);
      expect(resolution.compatibility.compatible).toBe(true);
      expect(resolution.selected.assets.vsix).toBeDefined();
    }
  }, 120_000);
});
