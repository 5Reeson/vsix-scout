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

export type MarketplaceExtension = z.infer<typeof MarketplaceExtensionSchema>;
export type MarketplaceVersion = z.infer<typeof MarketplaceVersionSchema>;
export type MarketplaceManifest = z.infer<typeof MarketplaceManifestSchema>;
