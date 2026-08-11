import {
  ScoutError,
  type ExtensionAsset,
  type ExtensionRecord,
  type ExtensionVersionCandidate,
} from '@vsix-scout/core';
import { ZodError } from 'zod';

import { ASSET_TYPES, PROPERTY_KEYS } from './constants.js';
import {
  MarketplaceExtensionQueryResponseSchema,
  MarketplaceManifestSchema,
  type MarketplaceExtension,
  type MarketplaceManifest,
  type MarketplaceVersion,
} from './raw-schema.js';
import { assertAllowedMarketplaceUrl } from './url-policy.js';

export type ManifestFixtureMap = Readonly<Record<string, unknown>>;

function propertyValue(
  version: MarketplaceVersion,
  key: string,
): string | undefined {
  return version.properties?.find((property) => property.key === key)?.value;
}

function splitExtensionIds(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim() === '') {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function buildAssetUri(
  baseUri: string,
  assetType: string,
  targetPlatform: string | undefined,
): string {
  const url = new URL(baseUri);
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${assetType}`;

  if (targetPlatform !== undefined) {
    url.searchParams.set('targetPlatform', targetPlatform);
  }

  return url.toString();
}

function normalizeAsset(
  version: MarketplaceVersion,
  assetType: string,
): ExtensionAsset | undefined {
  const fileUri = version.files?.find(
    (file) => file.assetType === assetType,
  )?.source;
  const primaryUri =
    fileUri ??
    (version.assetUri === undefined
      ? undefined
      : buildAssetUri(version.assetUri, assetType, version.targetPlatform));
  const fallbackUri =
    version.fallbackAssetUri === undefined
      ? undefined
      : buildAssetUri(
          version.fallbackAssetUri,
          assetType,
          version.targetPlatform,
        );

  if (primaryUri === undefined && fallbackUri === undefined) {
    return undefined;
  }

  if (primaryUri !== undefined) {
    assertAllowedMarketplaceUrl(primaryUri);
  }
  if (fallbackUri !== undefined) {
    assertAllowedMarketplaceUrl(fallbackUri);
  }

  return {
    ...(primaryUri === undefined ? {} : { primaryUri }),
    ...(fallbackUri === undefined ? {} : { fallbackUri }),
  };
}

function findManifest(
  asset: ExtensionAsset | undefined,
  manifests: ManifestFixtureMap,
): MarketplaceManifest | undefined {
  if (asset === undefined) {
    return undefined;
  }

  const rawManifest = [asset.primaryUri, asset.fallbackUri]
    .filter((uri): uri is string => uri !== undefined)
    .map((uri) => manifests[uri])
    .find((manifest) => manifest !== undefined);

  if (rawManifest === undefined) {
    return undefined;
  }

  try {
    return MarketplaceManifestSchema.parse(rawManifest);
  } catch (error) {
    throw new ScoutError(
      'UPSTREAM_INVALID_RESPONSE',
      'A Marketplace manifest did not match the expected shape.',
      { cause: error },
    );
  }
}

function normalizeVersion(
  version: MarketplaceVersion,
  manifests: ManifestFixtureMap,
): ExtensionVersionCandidate {
  const manifestAsset = normalizeAsset(version, ASSET_TYPES.manifest);
  const vsixAsset = normalizeAsset(version, ASSET_TYPES.vsix);
  const manifest = findManifest(manifestAsset, manifests);
  const propertyEngine = propertyValue(version, PROPERTY_KEYS.engine)?.trim();
  const manifestEngine = manifest?.engines?.vscode.trim();
  const engine = propertyEngine || manifestEngine;
  const dependenciesProperty = propertyValue(
    version,
    PROPERTY_KEYS.dependencies,
  );
  const extensionPackProperty = propertyValue(
    version,
    PROPERTY_KEYS.extensionPack,
  );
  const isPreRelease =
    propertyValue(version, PROPERTY_KEYS.preRelease)?.toLowerCase() === 'true';
  const upstreamSha256 = propertyValue(version, PROPERTY_KEYS.vsixSha256);

  return {
    version: version.version,
    targetPlatform: version.targetPlatform ?? 'universal',
    publishedAt: version.lastUpdated,
    channel: isPreRelease ? 'pre-release' : 'stable',
    ...(engine === undefined || engine === '' ? {} : { engine }),
    engineSource:
      propertyEngine !== undefined && propertyEngine !== ''
        ? 'property'
        : manifestEngine !== undefined && manifestEngine !== ''
          ? 'manifest'
          : 'missing',
    dependencies:
      dependenciesProperty === undefined
        ? (manifest?.extensionDependencies ?? [])
        : splitExtensionIds(dependenciesProperty),
    extensionPack:
      extensionPackProperty === undefined
        ? (manifest?.extensionPack ?? [])
        : splitExtensionIds(extensionPackProperty),
    assets: {
      ...(manifestAsset === undefined ? {} : { manifest: manifestAsset }),
      ...(vsixAsset === undefined ? {} : { vsix: vsixAsset }),
    },
    ...(upstreamSha256 === undefined ? {} : { upstreamSha256 }),
  };
}

function findExtension(
  extensions: readonly MarketplaceExtension[],
  requestedId: string,
): MarketplaceExtension {
  const normalizedRequestedId = requestedId.toLowerCase();
  const extension = extensions.find(
    (candidate) =>
      `${candidate.publisher.publisherName}.${candidate.extensionName}`.toLowerCase() ===
      normalizedRequestedId,
  );

  if (extension === undefined) {
    throw new ScoutError(
      'EXTENSION_NOT_FOUND',
      `Extension "${requestedId}" was not present in the Marketplace response.`,
      { details: { extensionId: requestedId } },
    );
  }

  return extension;
}

export function normalizeMarketplaceResponse(
  input: unknown,
  requestedId: string,
  manifests: ManifestFixtureMap = {},
): ExtensionRecord {
  try {
    const response = MarketplaceExtensionQueryResponseSchema.parse(input);
    const extensions = response.results.flatMap((result) => result.extensions);
    const extension = findExtension(extensions, requestedId);
    const publisher = extension.publisher.publisherName.toLowerCase();
    const name = extension.extensionName.toLowerCase();

    return {
      extension: {
        id: `${publisher}.${name}`,
        publisher,
        name,
        ...(extension.displayName === undefined
          ? {}
          : { displayName: extension.displayName }),
      },
      source: 'visual-studio-marketplace',
      versions: extension.versions.map((version) =>
        normalizeVersion(version, manifests),
      ),
    };
  } catch (error) {
    if (error instanceof ScoutError) {
      throw error;
    }

    if (error instanceof ZodError) {
      throw new ScoutError(
        'UPSTREAM_INVALID_RESPONSE',
        'The Marketplace response did not match the expected shape.',
        {
          cause: error,
          details: {
            issues: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          },
        },
      );
    }

    throw error;
  }
}
