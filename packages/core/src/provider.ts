import type { ExtensionReference } from '@vsix-scout/shared';

import type { ExtensionRecord, MarketplaceSource } from './model.js';

export interface ExtensionProvider {
  readonly source: MarketplaceSource;
  getExtension(reference: ExtensionReference): Promise<ExtensionRecord>;
}
