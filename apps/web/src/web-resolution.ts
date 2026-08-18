import {
  ScoutError,
  marketplaceVspackageUrl,
  needsManifestForNewerCandidate,
  resolveExtension,
  validateResolutionRequest,
  type ExtensionRecord,
  type ReleaseChannel,
  type ResolutionResult,
} from '@vsix-scout/core';
import {
  assertAllowedMarketplaceUrl,
  parseMarketplaceExtensionReference,
  type IncrementalExtensionProvider,
  type MarketplaceExtensionRequestOptions,
} from '@vsix-scout/marketplace';
import {
  REQUESTED_TARGET_PLATFORMS,
  type RequestedTargetPlatform,
} from '@vsix-scout/shared';

/**
 * True when the input is a non-empty bare keyword that is not a Marketplace
 * URL and not a parseable `publisher.extension` reference. Such input fails
 * `parseMarketplaceExtensionReference` with INVALID_INPUT and is a candidate
 * for keyword search suggestions.
 */
export function isBareKeyword(input: string): boolean {
  const value = input.trim();
  if (value === '' || value.includes('://')) {
    return false;
  }
  try {
    parseMarketplaceExtensionReference(value);
    return false;
  } catch {
    return true;
  }
}

/**
 * True when a resolve failure should trigger keyword suggestions: either the
 * extension lookup reported EXTENSION_NOT_FOUND, or the input was a bare
 * keyword that validation rejected as INVALID_INPUT.
 */
export function shouldSuggestForError(
  error: unknown,
  extension: string,
): boolean {
  if (!(error instanceof ScoutError)) {
    return false;
  }
  if (error.code === 'EXTENSION_NOT_FOUND') {
    return true;
  }
  return error.code === 'INVALID_INPUT' && isBareKeyword(extension);
}

export interface WebResolutionQuery {
  readonly extension: string;
  readonly vscode: string;
  readonly platform: RequestedTargetPlatform;
  readonly channel: ReleaseChannel;
}

export interface WebResolvedVersion {
  readonly resolution: ResolutionResult;
  /** Pattern B: Marketplace vspackage endpoint (primary, always present). */
  readonly downloadUrl: string;
  /** Pattern A: CDN asset URL from Marketplace metadata, when available. */
  readonly alternateUrl?: string;
}

export interface WebResolution {
  readonly record: ExtensionRecord;
  readonly selected: WebResolvedVersion;
  readonly compatibleVersions: readonly WebResolvedVersion[];
  readonly hasPendingManifests: boolean;
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

/**
 * The two download locations for a resolved version. The deterministic
 * Marketplace endpoint (Pattern B) is the primary download link; the metadata
 * CDN asset URL (Pattern A) is kept as an alternate for networks where the
 * Marketplace host itself is unreachable. Pattern A still passes the allowlist
 * check so off-policy upstream URLs are rejected.
 */
function webDownloadLinks(resolution: ResolutionResult): {
  readonly downloadUrl: string;
  readonly alternateUrl?: string;
} {
  const downloadUrl = marketplaceVspackageUrl(
    resolution.extension.publisher,
    resolution.extension.name,
    resolution.selected.version,
    resolution.selected.targetPlatform,
  );
  const alternateUrl = preferredWebAssetUrl(resolution);
  return {
    downloadUrl,
    ...(alternateUrl === undefined ? {} : { alternateUrl }),
  };
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
      const links = webDownloadLinks(resolution);
      compatible.push({
        resolution,
        downloadUrl: links.downloadUrl,
        ...(links.alternateUrl === undefined
          ? {}
          : { alternateUrl: links.alternateUrl }),
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

const DEFAULT_MANIFEST_BATCH_SIZE = 20;

// TODO(display): "other compatible versions" only reveals missing-engine
// versions after the user clicks Show more (each batch issues manifest
// requests that can be slow or fail on CDN-blocked networks). Consider
// revealing all known-engine compatible versions first and enriching
// manifests only when the user scrolls past them.
export interface WebResolutionOptions extends MarketplaceExtensionRequestOptions {
  /** Enrich the display list with one extra manifest batch (Show more). */
  readonly loadForDisplay?: boolean;
}

export async function resolveWebQuery(
  provider: IncrementalExtensionProvider,
  query: WebResolutionQuery,
  options: WebResolutionOptions = {},
): Promise<WebResolution> {
  validateWebQuery(query);
  const reference = parseMarketplaceExtensionReference(query.extension);
  const baseOptions = {
    channel: query.channel,
    platform: query.platform,
  } satisfies Omit<MarketplaceExtensionRequestOptions, 'manifestLimit'>;
  const batchSize = options.manifestLimit ?? DEFAULT_MANIFEST_BATCH_SIZE;

  // Phase 1: resolve from known Engine properties only, without any manifest
  // requests. If the newest compatible version is newer than every
  // missing-engine version, the selection is already final.
  let record = await provider.getExtension(reference, {
    ...baseOptions,
    manifestLimit: 0,
  });
  let compatibleVersions = compatibleWebVersions(record, query);
  let selected = compatibleVersions[0];

  // Phase 2: fetch missing manifests (newest first) until the selection is
  // certain. Show more also forces at least one extra batch for the display
  // list. Manifest failures are tolerated by the provider (the version stays
  // 'missing' and is rejected), so this loop degrades gracefully.
  let batchLoaded = false;
  for (;;) {
    const selectionCertain =
      selected !== undefined &&
      !needsManifestForNewerCandidate(
        record,
        query,
        selected.resolution.selected.version,
      );
    if (selectionCertain && (!options.loadForDisplay || batchLoaded)) {
      break;
    }
    const hasPending =
      provider.hasPendingManifests?.(reference, baseOptions) ?? false;
    if (!hasPending) break;
    record = await provider.getExtension(reference, {
      ...baseOptions,
      manifestLimit: batchSize,
    });
    compatibleVersions = compatibleWebVersions(record, query);
    selected = compatibleVersions[0];
    batchLoaded = true;
  }

  if (selected === undefined) {
    resolveExtension(record, query);
    throw new Error('Resolver returned no result and no domain error.');
  }

  return {
    record,
    selected,
    compatibleVersions,
    hasPendingManifests:
      provider.hasPendingManifests?.(reference, baseOptions) ?? false,
  };
}
