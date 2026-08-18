import { describe, expect, it } from 'vitest';

import {
  ScoutError,
  compareVersionsDescending,
  isNewerVersion,
  needsManifestForNewerCandidate,
  resolveExtension,
  type ExtensionRecord,
  type ExtensionVersionCandidate,
  type ReleaseChannel,
  type ResolutionRequest,
} from '../src/index.js';

interface CandidateInput {
  readonly version: string;
  readonly engine?: string | null;
  readonly platform?: string;
  readonly channel?: ReleaseChannel;
  readonly publishedAt?: string;
  readonly engineSource?: ExtensionVersionCandidate['engineSource'];
  readonly withVsix?: boolean;
}

function candidate({
  version,
  engine = '^1.80.0',
  platform = 'universal',
  channel = 'stable',
  publishedAt = '2026-01-01T00:00:00.000Z',
  engineSource = engine === null ? 'missing' : 'property',
  withVsix = true,
}: CandidateInput): ExtensionVersionCandidate {
  return {
    version,
    targetPlatform: platform,
    publishedAt,
    channel,
    ...(engine === null ? {} : { engine }),
    engineSource,
    dependencies: [],
    extensionPack: [],
    assets: withVsix
      ? {
          vsix: {
            primaryUri:
              'https://publisher.gallerycdn.vsassets.io/extensions/publisher/name/file',
          },
        }
      : {},
  };
}

function record(
  versions: readonly ExtensionVersionCandidate[],
): ExtensionRecord {
  return {
    extension: {
      id: 'publisher.extension',
      publisher: 'publisher',
      name: 'extension',
    },
    source: 'visual-studio-marketplace',
    versions,
  };
}

const defaultRequest: ResolutionRequest = {
  vscode: '1.85.2',
  platform: 'win32-x64',
};

function errorCode(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof ScoutError) {
      return error.code;
    }
    throw error;
  }
  throw new Error('Expected resolver to throw.');
}

describe('resolveExtension SemVer compatibility', () => {
  it.each([
    ['^1.84.0', '1.85.2', true],
    ['>=1.80.0 <1.90.0', '1.85.2', true],
    ['1.85.x', '1.85.2', true],
    ['1.80.0 - 1.89.0', '1.85.2', true],
    ['^1.86.0 || ^1.85.0', '1.85.2', true],
    ['~1.84.0', '1.85.2', false],
    ['>=1.90.0', '1.85.2', false],
  ])(
    'evaluates engine range %s against VS Code %s',
    (engine, vscode, compatible) => {
      const action = () =>
        resolveExtension(record([candidate({ version: '1.0.0', engine })]), {
          ...defaultRequest,
          vscode,
        });

      if (compatible) {
        expect(action().selected.version).toBe('1.0.0');
      } else {
        expect(errorCode(action)).toBe('NO_COMPATIBLE_VERSION');
      }
    },
  );

  it('selects an older version when the latest engine is incompatible', () => {
    const result = resolveExtension(
      record([
        candidate({ version: '2.0.0', engine: '^1.90.0' }),
        candidate({ version: '1.5.0', engine: '^1.80.0' }),
      ]),
      defaultRequest,
    );

    expect(result.selected.version).toBe('1.5.0');
    expect(result.diagnostics.rejectionCounts['incompatible-engine']).toBe(1);
  });

  it('sorts extension versions with SemVer rather than lexically', () => {
    const result = resolveExtension(
      record([
        candidate({ version: '2.0.0' }),
        candidate({ version: '10.0.0' }),
      ]),
      defaultRequest,
    );

    expect(result.selected.version).toBe('10.0.0');
  });

  it('orders SemVer pre-release identifiers correctly within the channel', () => {
    const result = resolveExtension(
      record([
        candidate({ version: '2.0.0-beta.1', channel: 'pre-release' }),
        candidate({ version: '2.0.0-beta.2', channel: 'pre-release' }),
      ]),
      { ...defaultRequest, channel: 'pre-release' },
    );

    expect(result.selected.version).toBe('2.0.0-beta.2');
  });
});

describe('resolveExtension channel policy', () => {
  const mixedRecord = record([
    candidate({
      version: '2.0.0',
      channel: 'pre-release',
    }),
    candidate({ version: '1.0.0', channel: 'stable' }),
  ]);

  it('defaults to stable and excludes newer pre-release candidates', () => {
    const result = resolveExtension(mixedRecord, defaultRequest);

    expect(result.target.channel).toBe('stable');
    expect(result.selected.version).toBe('1.0.0');
    expect(result.diagnostics.rejectionCounts['channel-mismatch']).toBe(1);
  });

  it('treats pre-release as an explicit strict channel', () => {
    const result = resolveExtension(mixedRecord, {
      ...defaultRequest,
      channel: 'pre-release',
    });

    expect(result.selected.version).toBe('2.0.0');
    expect(result.selected.channel).toBe('pre-release');
  });
});

describe('resolveExtension platform policy', () => {
  it('prefers an exact platform variant over universal for the same version', () => {
    const result = resolveExtension(
      record([
        candidate({ version: '2.0.0', platform: 'universal' }),
        candidate({ version: '2.0.0', platform: 'win32-x64' }),
      ]),
      defaultRequest,
    );

    expect(result.selected.targetPlatform).toBe('win32-x64');
    expect(result.compatibility.platformMatch).toBe('exact');
  });

  it('uses universal when no exact variant exists for the selected version', () => {
    const result = resolveExtension(
      record([candidate({ version: '2.0.0', platform: 'universal' })]),
      defaultRequest,
    );

    expect(result.compatibility.platformMatch).toBe('universal');
    expect(result.compatibility.reasons).toContainEqual(
      expect.objectContaining({ code: 'universal-platform-fallback' }),
    );
  });

  it('selects a newer universal version over an older exact-platform version', () => {
    const result = resolveExtension(
      record([
        candidate({ version: '2.0.0', platform: 'universal' }),
        candidate({ version: '1.9.0', platform: 'win32-x64' }),
      ]),
      defaultRequest,
    );

    expect(result.selected.version).toBe('2.0.0');
    expect(result.compatibility.platformMatch).toBe('universal');
  });

  it('never treats a package for another platform as compatible', () => {
    const action = () =>
      resolveExtension(
        record([candidate({ version: '2.0.0', platform: 'linux-x64' })]),
        defaultRequest,
      );

    expect(errorCode(action)).toBe('NO_COMPATIBLE_VERSION');
  });
});

describe('resolveExtension exact version and deterministic selection', () => {
  it('selects the requested exact extension version', () => {
    const result = resolveExtension(
      record([
        candidate({ version: '2.0.0' }),
        candidate({ version: '1.5.0' }),
      ]),
      { ...defaultRequest, version: '1.5.0' },
    );

    expect(result.selected.version).toBe('1.5.0');
    expect(result.compatibility.reasons).toContainEqual(
      expect.objectContaining({ code: 'exact-version-selected' }),
    );
  });

  it('uses publication time as a deterministic tie-breaker', () => {
    const result = resolveExtension(
      record([
        candidate({
          version: '2.0.0',
          publishedAt: '2026-01-01T00:00:00.000Z',
        }),
        candidate({
          version: '2.0.0',
          publishedAt: '2026-02-01T00:00:00.000Z',
        }),
      ]),
      defaultRequest,
    );

    expect(result.selected.publishedAt).toBe('2026-02-01T00:00:00.000Z');
  });
});

describe('resolveExtension explanations and errors', () => {
  it('explains manifest engine fallback and metadata limitations', () => {
    const result = resolveExtension(
      record([
        candidate({
          version: '1.0.0',
          engine: '^1.80.0',
          engineSource: 'manifest',
          withVsix: false,
        }),
      ]),
      defaultRequest,
    );

    expect(result.compatibility.reasons).toContainEqual(
      expect.objectContaining({ code: 'engine-from-manifest' }),
    );
    expect(result.compatibility.limitations).toHaveLength(2);
  });

  it.each([
    [{ ...defaultRequest, vscode: '1.85' }, 'vscode'],
    [{ ...defaultRequest, platform: '   ' }, 'platform'],
    [{ ...defaultRequest, version: 'not-semver' }, 'version'],
  ])('rejects invalid request input for %s', (request) => {
    expect(errorCode(() => resolveExtension(record([]), request))).toBe(
      'INVALID_INPUT',
    );
  });

  it('returns categorized rejection diagnostics when nothing matches', () => {
    const action = () =>
      resolveExtension(
        record([
          candidate({ version: 'invalid' }),
          candidate({ version: '1.0.0', engine: null }),
          candidate({ version: '1.1.0', engine: 'not-a-range' }),
          candidate({ version: '1.2.0', engine: '^1.90.0' }),
          candidate({
            version: '1.3.0',
            engine: '^1.80.0',
            platform: 'linux-x64',
          }),
        ]),
        defaultRequest,
      );

    try {
      action();
      throw new Error('Expected resolver to throw.');
    } catch (error) {
      expect(error).toBeInstanceOf(ScoutError);
      const details = (error as ScoutError).toJSON().error.details;
      expect(details).toMatchObject({
        diagnostics: {
          examinedCandidates: 5,
          compatibleCandidates: 0,
          rejectionCounts: {
            'invalid-extension-version': 1,
            'platform-mismatch': 1,
            'missing-engine': 1,
            'invalid-engine-range': 1,
            'incompatible-engine': 1,
          },
        },
      });
    }
  });
});

describe('version helpers', () => {
  it('isNewerVersion compares SemVer numerically, not lexically', () => {
    expect(isNewerVersion('2026.4.0', '2.1.0')).toBe(true);
    expect(isNewerVersion('2025.20.1', '2025.3.0')).toBe(true);
    expect(isNewerVersion('2.1.0', '2.1.0-beta.1')).toBe(true);
    expect(isNewerVersion('1.0.0', '2.1.0')).toBe(false);
    expect(isNewerVersion('1.0.0', 'nonsense')).toBe(false);
    expect(isNewerVersion('nonsense', '1.0.0')).toBe(false);
  });

  it('compareVersionsDescending sorts newest first', () => {
    const sorted = [
      '0.6.9',
      '2.1.0-beta.1',
      '2025.3.0',
      '2026.4.0',
      '2025.20.1',
    ].sort(compareVersionsDescending);
    expect(sorted).toEqual([
      '2026.4.0',
      '2025.20.1',
      '2025.3.0',
      '2.1.0-beta.1',
      '0.6.9',
    ]);
  });

  it('needsManifestForNewerCandidate flags newer matching missing-engine versions', () => {
    const rec = record([
      candidate({
        version: '2026.4.0',
        engine: '^1.95.0',
        platform: 'linux-arm64',
      }),
      candidate({
        version: '2025.10.0',
        engine: null,
        platform: 'linux-arm64',
      }),
      candidate({ version: '0.7.0', engine: null, platform: 'universal' }),
      candidate({ version: '1.0.0', engine: null, platform: 'win32-x64' }),
      candidate({ version: '1.5.0', engine: null, channel: 'pre-release' }),
    ]);
    const request = {
      vscode: '1.95.0',
      platform: 'linux-arm64',
      channel: 'stable',
    } as const;

    // Selected 2026.4.0: newer than every matching missing version → no manifest needed.
    expect(needsManifestForNewerCandidate(rec, request, '2026.4.0')).toBe(
      false,
    );
    // Selected 2024.0.0: the missing linux-arm64 2025.10.0 is newer → manifest needed.
    expect(needsManifestForNewerCandidate(rec, request, '2024.0.0')).toBe(true);
    // Selected 1.0.0: the linux-arm64 2025.10.0 (or universal 0.7.0) is newer → needed.
    expect(needsManifestForNewerCandidate(rec, request, '1.0.0')).toBe(true);
    // A different platform (win32-x64): only universal 0.7.0 matches, which is older → none needed.
    expect(
      needsManifestForNewerCandidate(
        rec,
        { ...request, platform: 'win32-x64' },
        '1.0.0',
      ),
    ).toBe(false);
    // A pre-release missing version (1.5.0) is excluded by channel: with a
    // selected 1.4.0 it would otherwise force a manifest fetch.
    expect(
      needsManifestForNewerCandidate(
        rec,
        { ...request, platform: 'universal' },
        '1.4.0',
      ),
    ).toBe(false);
  });

  it('an exact-version request is always final', () => {
    const rec = record([
      candidate({ version: '2.0.0', engine: '^1.80.0' }),
      candidate({ version: '2026.4.0', engine: null }),
    ]);
    expect(
      needsManifestForNewerCandidate(
        rec,
        {
          vscode: '1.95.0',
          platform: 'linux-x64',
          channel: 'stable',
          version: '2.0.0',
        },
        '2.0.0',
      ),
    ).toBe(false);
  });
});
