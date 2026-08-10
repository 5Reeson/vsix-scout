import type { ExtensionReference } from '@vsix-scout/shared';

export type ReleaseChannel = 'stable' | 'pre-release';
export type EngineSource = 'property' | 'manifest' | 'missing';
export type MarketplaceSource = 'visual-studio-marketplace';

export interface ExtensionAsset {
  readonly primaryUri?: string;
  readonly fallbackUri?: string;
}

export interface ExtensionVersionCandidate {
  /** Extension version. Multiple candidates may share it when platform builds exist. */
  readonly version: string;
  /** Missing upstream targetPlatform is normalized to universal. */
  readonly targetPlatform: string;
  readonly publishedAt: string;
  readonly channel: ReleaseChannel;
  readonly engine?: string;
  readonly engineSource: EngineSource;
  readonly dependencies: readonly string[];
  readonly extensionPack: readonly string[];
  readonly assets: {
    readonly manifest?: ExtensionAsset;
    readonly vsix?: ExtensionAsset;
  };
  readonly upstreamSha256?: string;
}

export interface ExtensionRecord {
  readonly extension: ExtensionReference & {
    readonly displayName?: string;
  };
  readonly source: MarketplaceSource;
  readonly versions: readonly ExtensionVersionCandidate[];
}
