import {
  ScoutError,
  resolveExtension,
  validateResolutionRequest,
  type ExtensionProvider,
  type ExtensionRecord,
  type ReleaseChannel,
  type ResolutionResult,
} from '@vsix-scout/core';
import {
  assertAllowedMarketplaceUrl,
  parseMarketplaceExtensionReference,
  type MarketplaceExtensionRequestOptions,
} from '@vsix-scout/marketplace';
import {
  REQUESTED_TARGET_PLATFORMS,
  type RequestedTargetPlatform,
} from '@vsix-scout/shared';

export interface WebResolutionQuery {
  readonly extension: string;
  readonly vscode: string;
  readonly platform: RequestedTargetPlatform;
  readonly channel: ReleaseChannel;
}

export interface WebResolvedVersion {
  readonly resolution: ResolutionResult;
  readonly downloadUrl?: string;
}

export interface WebResolution {
  readonly record: ExtensionRecord;
  readonly selected: WebResolvedVersion;
  readonly compatibleVersions: readonly WebResolvedVersion[];
  readonly hasPendingManifests: boolean;
}

interface IncrementalExtensionProvider extends ExtensionProvider {
  getExtension(
    reference: Parameters<ExtensionProvider['getExtension']>[0],
    options?: MarketplaceExtensionRequestOptions,
  ): Promise<ExtensionRecord>;
  hasPendingManifests?(
    reference: Parameters<ExtensionProvider['getExtension']>[0],
    options?: Omit<MarketplaceExtensionRequestOptions, 'manifestLimit'>,
  ): boolean;
}

function preferredWebAssetUrl(
  resolution: ResolutionResult,
): string | undefined {
  const asset = resolution.selected.assets.vsix;
  const url = asset?.primaryUri ?? asset?.fallbackUri;
  if (url !== undefined) {
    assertAllowedMarketplaceUrl(url);
  }
  return url;
}

function validateWebQuery(query: WebResolutionQuery): void {
  parseMarketplaceExtensionReference(query.extension);
  validateResolutionRequest(query);

  if (!REQUESTED_TARGET_PLATFORMS.includes(query.platform)) {
    throw new ScoutError('INVALID_INPUT', 'Unsupported target platform.', {
      details: { field: 'platform', value: query.platform },
    });
  }
}

export function compatibleWebVersions(
  record: ExtensionRecord,
  query: Omit<WebResolutionQuery, 'extension'>,
): readonly WebResolvedVersion[] {
  const compatible: WebResolvedVersion[] = [];
  let remaining = record.versions;

  while (remaining.length > 0) {
    try {
      const resolution = resolveExtension(
        { ...record, versions: remaining },
        query,
      );
      const downloadUrl = preferredWebAssetUrl(resolution);
      compatible.push({
        resolution,
        ...(downloadUrl === undefined ? {} : { downloadUrl }),
      });
      remaining = remaining.filter(
        (candidate) => candidate.version !== resolution.selected.version,
      );
    } catch (error) {
      if (
        error instanceof ScoutError &&
        error.code === 'NO_COMPATIBLE_VERSION'
      ) {
        break;
      }
      throw error;
    }
  }

  return compatible;
}

export async function resolveWebQuery(
  provider: IncrementalExtensionProvider,
  query: WebResolutionQuery,
  options: MarketplaceExtensionRequestOptions = {},
): Promise<WebResolution> {
  validateWebQuery(query);
  const reference = parseMarketplaceExtensionReference(query.extension);
  const manifestOptions = {
    channel: query.channel,
    platform: query.platform,
    ...options,
  } satisfies MarketplaceExtensionRequestOptions;
  const record = await provider.getExtension(reference, manifestOptions);
  const compatibleVersions = compatibleWebVersions(record, query);
  const selected = compatibleVersions[0];

  if (selected === undefined) {
    resolveExtension(record, query);
    throw new Error('Resolver returned no result and no domain error.');
  }

  return {
    record,
    selected,
    compatibleVersions,
    hasPendingManifests:
      provider.hasPendingManifests?.(reference, manifestOptions) ?? false,
  };
}
