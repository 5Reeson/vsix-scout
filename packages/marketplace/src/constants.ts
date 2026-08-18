export const MARKETPLACE_QUERY_URL =
  'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';
export const MARKETPLACE_API_VERSION = '3.0-preview.1';

export const EXTENSION_QUERY_FILTER_NAME = 7;
export const EXTENSION_QUERY_FILTER_SEARCH = 10;
export const EXTENSION_QUERY_FILTER_TARGET = 8;
export const EXTENSION_QUERY_TARGET_VALUE = 'Microsoft.VisualStudio.Code';
export const EXTENSION_QUERY_SORT_BY_INSTALLS = 4;
export const EXTENSION_QUERY_SORT_ORDER_DESCENDING = 0;

export const EXTENSION_QUERY_FLAGS = {
  includeVersions: 1,
  includeFiles: 2,
  includeVersionProperties: 16,
  includeAssetUri: 128,
} as const;

export const HISTORY_QUERY_FLAGS = Object.values(EXTENSION_QUERY_FLAGS).reduce(
  (flags, value) => flags | value,
  0,
);

export const EXTENSION_QUERY_FLAG_INCLUDE_STATISTICS = 256;

/** History flags plus IncludeStatistics; used by keyword search only. */
export const SEARCH_QUERY_FLAGS =
  HISTORY_QUERY_FLAGS | EXTENSION_QUERY_FLAG_INCLUDE_STATISTICS;

export const ASSET_TYPES = {
  manifest: 'Microsoft.VisualStudio.Code.Manifest',
  vsix: 'Microsoft.VisualStudio.Services.VSIXPackage',
} as const;

export const PROPERTY_KEYS = {
  engine: 'Microsoft.VisualStudio.Code.Engine',
  preRelease: 'Microsoft.VisualStudio.Code.PreRelease',
  dependencies: 'Microsoft.VisualStudio.Code.ExtensionDependencies',
  extensionPack: 'Microsoft.VisualStudio.Code.ExtensionPack',
  vsixSha256: 'Microsoft.VisualStudio.Services.VsixSha256',
} as const;
