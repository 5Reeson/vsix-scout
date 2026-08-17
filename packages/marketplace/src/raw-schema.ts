import { z } from 'zod';

export const MarketplacePropertySchema = z
  .object({
    key: z.string().min(1),
    value: z.string(),
  })
  .passthrough();

export const MarketplaceFileSchema = z
  .object({
    assetType: z.string().min(1),
    source: z.string().min(1),
  })
  .passthrough();

export const MarketplaceVersionSchema = z
  .object({
    version: z.string().min(1),
    lastUpdated: z.string().min(1),
    assetUri: z.string().min(1).optional(),
    fallbackAssetUri: z.string().min(1).optional(),
    targetPlatform: z.string().min(1).optional(),
    properties: z.array(MarketplacePropertySchema).optional(),
    files: z.array(MarketplaceFileSchema).optional(),
  })
  .passthrough();

export const MarketplaceExtensionSchema = z
  .object({
    extensionId: z.string().min(1),
    extensionName: z.string().min(1),
    displayName: z.string().optional(),
    publisher: z
      .object({
        publisherName: z.string().min(1),
        displayName: z.string().optional(),
      })
      .passthrough(),
    versions: z.array(MarketplaceVersionSchema),
  })
  .passthrough();

export const MarketplaceExtensionQueryResponseSchema = z
  .object({
    results: z.array(
      z
        .object({
          extensions: z.array(MarketplaceExtensionSchema),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const MarketplaceManifestSchema = z
  .object({
    name: z.string().optional(),
    version: z.string().optional(),
    engines: z
      .object({
        vscode: z.string().min(1),
      })
      .passthrough()
      .optional(),
    extensionDependencies: z.array(z.string()).optional(),
    extensionPack: z.array(z.string()).optional(),
  })
  .passthrough();

export const MarketplaceStatisticSchema = z
  .object({
    statisticName: z.string().min(1),
    value: z.number(),
  })
  .passthrough();

/**
 * Lightweight extension shape for keyword search. Search hits are ranked by
 * install count, so `statistics` carries the `install` statistic that powers
 * the shared `MarketplaceSearchResult` model. Version variants are not
 * needed for the recommendation list and are left to passthrough.
 */
export const MarketplaceSearchExtensionSchema = z
  .object({
    extensionName: z.string().min(1),
    displayName: z.string().optional(),
    publisher: z
      .object({
        publisherName: z.string().min(1),
        displayName: z.string().optional(),
      })
      .passthrough(),
    lastUpdated: z.string().min(1).optional(),
    statistics: z.array(MarketplaceStatisticSchema).optional(),
  })
  .passthrough();

export const MarketplaceSearchResponseSchema = z
  .object({
    results: z.array(
      z
        .object({
          extensions: z.array(MarketplaceSearchExtensionSchema),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export type MarketplaceExtension = z.infer<typeof MarketplaceExtensionSchema>;
export type MarketplaceVersion = z.infer<typeof MarketplaceVersionSchema>;
export type MarketplaceManifest = z.infer<typeof MarketplaceManifestSchema>;
export type MarketplaceSearchExtension = z.infer<
  typeof MarketplaceSearchExtensionSchema
>;
