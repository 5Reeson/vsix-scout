import {
  ScoutError,
  type ExtensionProvider,
  type ExtensionRecord,
} from '@vsix-scout/core';
import type { MarketplaceSearchResult } from '@vsix-scout/shared';
import { describe, expect, it, vi } from 'vitest';

import {
  runCli,
  type CliDependencies,
  type CliIo,
  type VsixDownloader,
} from '../src/index.js';

const SEARCH_RESULTS: readonly MarketplaceSearchResult[] = [
  {
    id: 'ms-python.python',
    publisher: 'ms-python',
    name: 'python',
    displayName: 'Python',
    installCount: 232_356_114,
    lastUpdated: '2026-08-08T00:47:12.777+00:00',
  },
  {
    id: 'ms-python.vscode-pylance',
    publisher: 'ms-python',
    name: 'vscode-pylance',
    displayName: 'Pylance',
    installCount: 199_246_817,
  },
];

const record: ExtensionRecord = {
  extension: {
    id: 'example.extension',
    publisher: 'example',
    name: 'extension',
    displayName: 'Example Extension',
  },
  source: 'visual-studio-marketplace',
  versions: [
    {
      version: '2.0.0',
      targetPlatform: 'universal',
      publishedAt: '2026-01-02T00:00:00Z',
      channel: 'stable',
      engine: '^1.90.0',
      engineSource: 'property',
      dependencies: ['example.dependency'],
      extensionPack: [],
      upstreamSha256: 'b'.repeat(64),
      assets: {
        vsix: {
          primaryUri:
            'https://example.gallerycdn.vsassets.io/extensions/example/extension/2.0.0/file',
          fallbackUri:
            'https://example.gallery.vsassets.io/_apis/public/gallery/publisher/example/extension/extension/2.0.0/assetbyname/Microsoft.VisualStudio.Services.VSIXPackage',
        },
      },
    },
    {
      version: '2.1.0-beta.1',
      targetPlatform: 'linux-x64',
      publishedAt: '2026-01-03T00:00:00Z',
      channel: 'pre-release',
      engine: '^1.90.0',
      engineSource: 'property',
      dependencies: [],
      extensionPack: [],
      assets: {
        vsix: {
          primaryUri:
            'https://example.gallerycdn.vsassets.io/extensions/example/extension/2.1.0/file',
        },
      },
    },
  ],
};

function harness(overrides: Partial<CliDependencies> = {}) {
  let stdout = '';
  let stderr = '';
  const io: CliIo = {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  };
  const provider: ExtensionProvider =
    overrides.provider ??
    ({
      source: 'visual-studio-marketplace',
      getExtension: vi.fn(async () => record),
    } satisfies ExtensionProvider);
  const downloader: VsixDownloader =
    overrides.downloader ??
    ({
      download: vi.fn(async (request) => ({
        fileName: request.fileName,
        path: `/private/internal/${request.fileName}`,
        sourceUrl:
          'https://example.gallerycdn.vsassets.io/extensions/example/extension/file',
        size: 4,
        sha256: 'a'.repeat(64),
      })),
    } satisfies VsixDownloader);

  return {
    dependencies: {
      cwd: '/private/internal',
      ...overrides,
      provider,
      downloader,
      io,
    } satisfies CliDependencies,
    provider,
    downloader,
    output: () => ({ stdout, stderr }),
  };
}

describe('runCli', () => {
  it('resolves compatible metadata as stable versioned JSON', async () => {
    const test = harness();
    const exitCode = await runCli(
      [
        'resolve',
        'example.extension',
        '--vscode',
        '1.95.0',
        '--platform',
        'linux-x64',
        '--json',
      ],
      test.dependencies,
    );
    const output = JSON.parse(test.output().stdout) as {
      schemaVersion: number;
      command: string;
      selected: { version: string; targetPlatform: string };
    };

    expect(exitCode).toBe(0);
    expect(output).toMatchObject({
      schemaVersion: 1,
      command: 'resolve',
      selected: {
        version: '2.0.0',
        targetPlatform: 'universal',
        marketplaceUrl:
          'https://marketplace.visualstudio.com/_apis/public/gallery/publishers/example/vsextensions/extension/2.0.0/vspackage',
        assetUrl:
          'https://example.gallerycdn.vsassets.io/extensions/example/extension/2.0.0/file',
      },
    });
    expect(test.output().stderr).toBe('');
  });

  it('renders both official download links, Marketplace first', async () => {
    const test = harness();
    const exitCode = await runCli(
      [
        'resolve',
        'example.extension',
        '--vscode',
        '1.95.0',
        '--platform',
        'linux-x64',
      ],
      test.dependencies,
    );
    const stdout = test.output().stdout;
    const marketplaceIndex = stdout.indexOf('VSIX (Marketplace):');
    const cdnIndex = stdout.indexOf('VSIX (CDN):');

    expect(exitCode).toBe(0);
    expect(marketplaceIndex).toBeGreaterThan(-1);
    expect(cdnIndex).toBeGreaterThan(marketplaceIndex);
    expect(stdout).toContain(
      'https://marketplace.visualstudio.com/_apis/public/gallery/publishers/example/vsextensions/extension/2.0.0/vspackage',
    );
    expect(stdout).toContain(
      'https://example.gallerycdn.vsassets.io/extensions/example/extension/2.0.0/file',
    );
    expect(test.output().stderr).toBe('');
  });

  it('resolves from known Engine properties before requesting any manifest', async () => {
    const test = harness();
    const exitCode = await runCli(
      [
        'resolve',
        'example.extension',
        '--vscode',
        '1.95.0',
        '--platform',
        'linux-x64',
        '--json',
      ],
      test.dependencies,
    );
    expect(exitCode).toBe(0);
    expect(test.provider.getExtension).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'example.extension' }),
      { channel: 'stable', platform: 'linux-x64', manifestLimit: 0 },
    );
    // The fixture selection is certain from properties, so no manifest fetch.
    expect(test.provider.getExtension).toHaveBeenCalledTimes(1);
  });

  it('validates resolution input before calling the provider', async () => {
    const test = harness();
    const exitCode = await runCli(
      [
        'resolve',
        'example.extension',
        '--vscode',
        'latest',
        '--platform',
        'linux-x64',
        '--json',
      ],
      test.dependencies,
    );
    const output = JSON.parse(test.output().stderr) as {
      error: { code: string };
    };

    expect(exitCode).toBe(2);
    expect(output.error.code).toBe('INVALID_INPUT');
    expect(test.provider.getExtension).not.toHaveBeenCalled();
  });

  it('hints a full command example when the extension reference is missing', async () => {
    const test = harness();
    const exitCode = await runCli(
      ['resolve', '--vscode', '1.95.0', '--platform', 'linux-x64'],
      test.dependencies,
    );
    expect(exitCode).toBe(2);
    expect(test.output().stderr).toContain(
      'Example: vsix-scout resolve ms-python.python --vscode 1.95.0 --platform linux-x64',
    );
  });

  it('hints a full command example for an invalid extension reference', async () => {
    const test = harness();
    const exitCode = await runCli(
      [
        'resolve',
        'not-a-reference',
        '--vscode',
        '1.95.0',
        '--platform',
        'linux-x64',
      ],
      test.dependencies,
    );
    expect(exitCode).toBe(2);
    expect(test.output().stderr).toContain(
      'Example: vsix-scout resolve ms-python.python --vscode 1.95.0 --platform linux-x64',
    );
    expect(test.provider.getExtension).not.toHaveBeenCalled();
  });

  it('hints a complete example when --vscode is missing or malformed', async () => {
    const missing = harness();
    const malformed = harness();
    const exitCodeMissing = await runCli(
      ['resolve', 'example.extension', '--platform', 'linux-x64'],
      missing.dependencies,
    );
    const exitCodeMalformed = await runCli(
      [
        'resolve',
        'example.extension',
        '--vscode',
        'latest',
        '--platform',
        'linux-x64',
      ],
      malformed.dependencies,
    );
    expect(exitCodeMissing).toBe(2);
    expect(exitCodeMalformed).toBe(2);
    expect(missing.output().stderr).toContain(
      'Example: vsix-scout resolve ms-python.python --vscode 1.95.0 --platform linux-x64',
    );
    expect(malformed.output().stderr).toContain(
      'Example: vsix-scout resolve ms-python.python --vscode 1.95.0 --platform linux-x64',
    );
  });

  it('hints a complete example when --platform is missing or unsupported', async () => {
    const missing = harness();
    const unsupported = harness();
    const exitCodeMissing = await runCli(
      ['resolve', 'example.extension', '--vscode', '1.95.0'],
      missing.dependencies,
    );
    const exitCodeUnsupported = await runCli(
      [
        'resolve',
        'example.extension',
        '--vscode',
        '1.95.0',
        '--platform',
        'windows',
      ],
      unsupported.dependencies,
    );
    expect(exitCodeMissing).toBe(2);
    expect(exitCodeUnsupported).toBe(2);
    expect(missing.output().stderr).toContain(
      'Example: vsix-scout resolve ms-python.python --vscode 1.95.0 --platform linux-x64',
    );
    expect(unsupported.output().stderr).toContain(
      'Example: vsix-scout resolve ms-python.python --vscode 1.95.0 --platform linux-x64',
    );
  });

  it('hints a versions example when versions lacks an extension', async () => {
    const test = harness();
    const exitCode = await runCli(['versions'], test.dependencies);
    expect(exitCode).toBe(2);
    expect(test.output().stderr).toContain(
      'Example: vsix-scout versions ms-python.python --platform linux-x64',
    );
  });

  it('hints a download example when download lacks an extension', async () => {
    const test = harness();
    const exitCode = await runCli(
      ['download', '--vscode', '1.95.0', '--platform', 'linux-x64'],
      test.dependencies,
    );
    expect(exitCode).toBe(2);
    expect(test.output().stderr).toContain(
      'Example: vsix-scout download ms-python.python --vscode 1.95.0 --platform linux-x64',
    );
  });

  it('hints a search example for an empty search keyword', async () => {
    const test = harness();
    const exitCode = await runCli(['search'], test.dependencies);
    expect(exitCode).toBe(2);
    expect(test.output().stderr).toContain('Example: vsix-scout search python');
  });

  it('lists stable versions by default and supports pre-release filters', async () => {
    const stable = harness();
    const prerelease = harness();

    await runCli(
      ['versions', 'example.extension', '--json'],
      stable.dependencies,
    );
    await runCli(
      [
        'versions',
        'example.extension',
        '--pre-release',
        '--platform',
        'linux-x64',
        '--json',
      ],
      prerelease.dependencies,
    );
    const stableOutput = JSON.parse(stable.output().stdout) as {
      versions: Array<{ version: string }>;
    };
    const prereleaseOutput = JSON.parse(prerelease.output().stdout) as {
      versions: Array<{ version: string }>;
    };

    expect(stableOutput.versions.map((item) => item.version)).toEqual([
      '2.0.0',
    ]);
    expect(prereleaseOutput.versions.map((item) => item.version)).toEqual([
      '2.1.0-beta.1',
    ]);
  });

  it('returns complete normalized inspection metadata in JSON mode', async () => {
    const test = harness();
    await runCli(
      ['inspect', 'example.extension', '--version', '2.0.0', '--json'],
      test.dependencies,
    );
    const output = JSON.parse(test.output().stdout) as {
      command: string;
      summary: { variantCount: number };
      versions: Array<{ dependencies: string[] }>;
    };

    expect(output.command).toBe('inspect');
    expect(output.summary.variantCount).toBe(1);
    expect(output.versions[0]?.dependencies).toEqual(['example.dependency']);
  });

  it('downloads through the injected safe downloader without leaking cwd in JSON', async () => {
    const test = harness();
    const exitCode = await runCli(
      [
        'download',
        'example.extension',
        '--vscode',
        '1.95.0',
        '--platform',
        'linux-x64',
        '--json',
      ],
      test.dependencies,
    );
    const output = JSON.parse(test.output().stdout) as {
      download: {
        status: string;
        path: string;
        size: number;
        sha256: string;
      };
    };

    expect(exitCode).toBe(0);
    expect(output.download).toMatchObject({
      status: 'downloaded',
      path: 'example.extension-2.0.0-universal.vsix',
      size: 4,
      sha256: 'a'.repeat(64),
    });
    expect(output.download.path).not.toContain('/private/internal');
    expect(test.downloader.download).toHaveBeenCalledWith(
      expect.objectContaining({ expectedSha256: 'b'.repeat(64) }),
    );
  });

  it('supports a no-write download plan', async () => {
    const test = harness();
    const exitCode = await runCli(
      [
        'download',
        'example.extension',
        '--vscode',
        '1.95.0',
        '--platform',
        'linux-x64',
        '--no-download',
        '--json',
      ],
      test.dependencies,
    );
    const output = JSON.parse(test.output().stdout) as {
      download: { status: string };
    };

    expect(exitCode).toBe(0);
    expect(output.download.status).toBe('planned');
    expect(test.downloader.download).not.toHaveBeenCalled();
  });

  it('maps domain errors to stable exit codes', async () => {
    const test = harness({
      provider: {
        source: 'visual-studio-marketplace',
        getExtension: vi.fn(async () => {
          throw new ScoutError('EXTENSION_NOT_FOUND', 'Missing extension.');
        }),
      },
    });
    const exitCode = await runCli(
      ['versions', 'example.missing', '--json'],
      test.dependencies,
    );
    const output = JSON.parse(test.output().stderr) as {
      error: { code: string };
    };

    expect(exitCode).toBe(3);
    expect(output.error.code).toBe('EXTENSION_NOT_FOUND');
  });

  it('redacts unexpected causes from machine-readable errors', async () => {
    const secret = 'token=private-value /Users/example/private/file';
    const test = harness({
      provider: {
        source: 'visual-studio-marketplace',
        getExtension: vi.fn(async () => {
          throw new Error(secret);
        }),
      },
    });

    const exitCode = await runCli(
      ['versions', 'example.extension', '--json'],
      test.dependencies,
    );
    const serialized = test.output().stderr;

    expect(exitCode).toBe(1);
    expect(JSON.parse(serialized)).toMatchObject({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected internal error occurred.',
      },
    });
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('/Users/example');
    expect(serialized).not.toContain('private-value');
  });

  it('prints root and command help without network access', async () => {
    const root = harness();
    const command = harness();

    expect(await runCli(['--help'], root.dependencies)).toBe(0);
    expect(await runCli(['download', '--help'], command.dependencies)).toBe(0);
    expect(root.output().stdout).toContain('vsix-scout resolve');
    expect(command.output().stdout).toContain('vsix-scout download');
    expect(root.provider.getExtension).not.toHaveBeenCalled();
  });

  it('searches extensions ranked by installs in JSON mode', async () => {
    const searchExtensions = vi.fn(async () => SEARCH_RESULTS);
    const test = harness({
      provider: {
        source: 'visual-studio-marketplace',
        getExtension: vi.fn(),
        searchExtensions,
      },
    });
    const exitCode = await runCli(
      ['search', 'python', '--json'],
      test.dependencies,
    );
    const output = JSON.parse(test.output().stdout) as {
      schemaVersion: number;
      command: string;
      keyword: string;
      results: Array<{ id: string; installCount: number }>;
    };

    expect(exitCode).toBe(0);
    expect(output).toMatchObject({
      schemaVersion: 1,
      command: 'search',
      keyword: 'python',
    });
    expect(output.results[0]).toMatchObject({
      id: 'ms-python.python',
      installCount: 232_356_114,
    });
    expect(searchExtensions).toHaveBeenCalledWith('python', {});
  });

  it('renders search results as a human table', async () => {
    const test = harness({
      provider: {
        source: 'visual-studio-marketplace',
        getExtension: vi.fn(),
        searchExtensions: vi.fn(async () => SEARCH_RESULTS),
      },
    });
    const exitCode = await runCli(['search', 'python'], test.dependencies);
    const stdout = test.output().stdout;

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Search results for "python"');
    expect(stdout).toContain('ms-python.python');
    expect(stdout).toContain('232,356,114');
    expect(test.output().stderr).toBe('');
  });

  it('reports when the configured provider does not support search', async () => {
    const test = harness();
    const exitCode = await runCli(
      ['search', 'python', '--json'],
      test.dependencies,
    );
    const output = JSON.parse(test.output().stderr) as {
      error: { code: string };
    };

    expect(exitCode).toBe(1);
    expect(output.error.code).toBe('INTERNAL_ERROR');
  });

  it('rejects a non-positive search limit before calling the provider', async () => {
    const searchExtensions = vi.fn();
    const test = harness({
      provider: {
        source: 'visual-studio-marketplace',
        getExtension: vi.fn(),
        searchExtensions,
      },
    });
    const exitCode = await runCli(
      ['search', 'python', '--limit', '0'],
      test.dependencies,
    );

    expect(exitCode).toBe(2);
    expect(searchExtensions).not.toHaveBeenCalled();
  });

  it('suggests extensions in text mode when the extension is not found', async () => {
    const test = harness({
      provider: {
        source: 'visual-studio-marketplace',
        getExtension: vi.fn(async () => {
          throw new ScoutError(
            'EXTENSION_NOT_FOUND',
            'Extension "ms-python.python" was not found.',
          );
        }),
        searchExtensions: vi.fn(async () => SEARCH_RESULTS),
      },
    });
    const exitCode = await runCli(
      ['versions', 'ms-python.python'],
      test.dependencies,
    );
    const stderr = test.output().stderr;

    expect(exitCode).toBe(3);
    expect(stderr).toContain('Error [EXTENSION_NOT_FOUND]');
    expect(stderr).toContain('Did you mean?');
    expect(stderr).toContain('ms-python.python');
  });

  it('suggests extensions for a bare keyword without changing the exit code', async () => {
    const test = harness({
      provider: {
        source: 'visual-studio-marketplace',
        getExtension: vi.fn(),
        searchExtensions: vi.fn(async () => SEARCH_RESULTS),
      },
    });
    const exitCode = await runCli(
      ['versions', 'python', '--json'],
      test.dependencies,
    );
    const output = JSON.parse(test.output().stderr) as {
      error: {
        code: string;
        details: { suggestions?: Array<{ id: string }> };
      };
    };

    expect(exitCode).toBe(2);
    expect(output.error.code).toBe('INVALID_INPUT');
    expect(output.error.details.suggestions?.[0]?.id).toBe('ms-python.python');
  });

  it('omits suggestions when the suggestion search returns nothing', async () => {
    const test = harness({
      provider: {
        source: 'visual-studio-marketplace',
        getExtension: vi.fn(async () => {
          throw new ScoutError(
            'EXTENSION_NOT_FOUND',
            'Extension "zzzz.nothing" was not found.',
          );
        }),
        searchExtensions: vi.fn(async () => []),
      },
    });
    const exitCode = await runCli(
      ['versions', 'zzzz.nothing'],
      test.dependencies,
    );

    expect(exitCode).toBe(3);
    expect(test.output().stderr).not.toContain('Did you mean?');
  });

  it('accepts the argument separator forwarded by pnpm scripts', async () => {
    const test = harness();
    const exitCode = await runCli(
      [
        '--',
        'resolve',
        'example.extension',
        '--vscode',
        '1.95.0',
        '--platform',
        'linux-x64',
      ],
      test.dependencies,
    );

    expect(exitCode).toBe(0);
    expect(test.output().stdout).toContain('Extension: example.extension');
    expect(test.output().stderr).toBe('');
  });
});
