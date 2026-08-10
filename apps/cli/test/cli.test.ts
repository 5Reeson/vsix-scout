import {
  ScoutError,
  type ExtensionProvider,
  type ExtensionRecord,
} from '@vsix-scout/core';
import { describe, expect, it, vi } from 'vitest';

import {
  runCli,
  type CliDependencies,
  type CliIo,
  type VsixDownloader,
} from '../src/index.js';

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
      selected: { version: '2.0.0', targetPlatform: 'universal' },
    });
    expect(test.output().stderr).toBe('');
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
    expect(test.downloader.download).toHaveBeenCalledOnce();
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

  it('prints root and command help without network access', async () => {
    const root = harness();
    const command = harness();

    expect(await runCli(['--help'], root.dependencies)).toBe(0);
    expect(await runCli(['download', '--help'], command.dependencies)).toBe(0);
    expect(root.output().stdout).toContain('vsix-scout resolve');
    expect(command.output().stdout).toContain('vsix-scout download');
    expect(root.provider.getExtension).not.toHaveBeenCalled();
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
