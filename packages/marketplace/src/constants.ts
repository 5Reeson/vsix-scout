export const MARKETPLACE_QUERY_URL =
  'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';
export const MARKETPLACE_API_VERSION = '3.0-preview.1';

export const EXTENSION_QUERY_FILTER_NAME = 7;

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
