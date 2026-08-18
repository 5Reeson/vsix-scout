export const PROJECT_NAME = 'VSIX Scout';
export const CLI_NAME = 'vsix-scout';
export const PROJECT_VERSION = '0.3.0';
export const JSON_SCHEMA_VERSION = 1 as const;

export const REQUESTED_TARGET_PLATFORMS = [
  'win32-x64',
  'win32-arm64',
  'linux-x64',
  'linux-arm64',
  'darwin-x64',
  'darwin-arm64',
  'universal',
] as const;

export type RequestedTargetPlatform =
  (typeof REQUESTED_TARGET_PLATFORMS)[number];

export interface ExtensionReference {
  readonly id: string;
  readonly publisher: string;
  readonly name: string;
}

/** One normalized Marketplace search hit, ranked by install count. */
export interface MarketplaceSearchResult {
  readonly id: string;
  readonly publisher: string;
  readonly name: string;
  readonly displayName?: string;
  /** The upstream `install` statistic; 0 when the upstream statistic is absent. */
  readonly installCount: number;
  readonly lastUpdated?: string;
}

export interface SearchRequestOptions {
  /** Maximum number of results to request from the Marketplace. */
  readonly limit?: number;
}
