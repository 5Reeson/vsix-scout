import type {
  ExtensionReference,
  MarketplaceSearchResult,
  SearchRequestOptions,
} from '@vsix-scout/shared';

import type { ExtensionRecord, MarketplaceSource } from './model.js';

export interface ExtensionProvider {
  readonly source: MarketplaceSource;
  getExtension(reference: ExtensionReference): Promise<ExtensionRecord>;
  /**
   * Optional keyword search. Kept optional so existing providers and test
   * doubles that only resolve extension identifiers continue to satisfy the
   * interface; callers that need suggestions feature-detect with
   * `provider.searchExtensions`. This matches the existing optional-method
   * precedent (`hasPendingManifests`) used by the Web provider.
   */
  searchExtensions?(
    keyword: string,
    options?: SearchRequestOptions,
  ): Promise<readonly MarketplaceSearchResult[]>;
}
