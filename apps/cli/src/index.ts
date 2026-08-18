import { join, resolve as resolvePath } from 'node:path';
import { parseArgs } from 'node:util';

import {
  ScoutError,
  needsManifestForNewerCandidate,
  resolutionDownloadLinks,
  resolveExtension,
  validateExactExtensionVersion,
  validateResolutionRequest,
  type ErrorCode,
  type ExtensionProvider,
  type ExtensionRecord,
  type NormalizedResolutionRequest,
  type ReleaseChannel,
} from '@vsix-scout/core';
import {
  MarketplaceProvider,
  parseMarketplaceExtensionReference,
  type IncrementalExtensionProvider,
} from '@vsix-scout/marketplace';
import {
  CLI_NAME,
  PROJECT_VERSION,
  REQUESTED_TARGET_PLATFORMS,
  type MarketplaceSearchResult,
} from '@vsix-scout/shared';

import { SafeVsixDownloader, type VsixDownloader } from './download.js';
import {
  filterVersions,
  formatJson,
  inspectJson,
  renderInspection,
  renderResolution,
  renderSearch,
  renderVersions,
  resolutionJson,
  searchJson,
  versionsJson,
  type VersionFilters,
} from './output.js';

const COMMANDS = [
  'resolve',
  'versions',
  'inspect',
  'download',
  'search',
] as const;
type CommandName = (typeof COMMANDS)[number];

const CLI_OPTIONS = {
  vscode: { type: 'string' },
  platform: { type: 'string' },
  stable: { type: 'boolean' },
  'pre-release': { type: 'boolean' },
  version: { type: 'string' },
  json: { type: 'boolean' },
  output: { type: 'string' },
  'no-download': { type: 'boolean' },
  limit: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const;

const COMMON_LIST_OPTIONS = new Set([
  'platform',
  'stable',
  'pre-release',
  'version',
  'json',
  'help',
]);
const ALLOWED_OPTIONS: Readonly<Record<CommandName, ReadonlySet<string>>> = {
  resolve: new Set([...COMMON_LIST_OPTIONS, 'vscode']),
  versions: COMMON_LIST_OPTIONS,
  inspect: COMMON_LIST_OPTIONS,
  download: new Set([
    ...COMMON_LIST_OPTIONS,
    'vscode',
    'output',
    'no-download',
  ]),
  search: new Set(['limit', 'json', 'help']),
};

const EXIT_CODES: Readonly<Record<ErrorCode, number>> = {
  INVALID_INPUT: 2,
  EXTENSION_NOT_FOUND: 3,
  NO_COMPATIBLE_VERSION: 4,
  UPSTREAM_UNAVAILABLE: 5,
  UPSTREAM_INVALID_RESPONSE: 6,
  UNSAFE_RESOURCE_URL: 7,
  DOWNLOAD_FAILED: 8,
  INTERNAL_ERROR: 1,
};

interface ParsedValues {
  readonly vscode?: string;
  readonly platform?: string;
  readonly stable?: boolean;
  readonly 'pre-release'?: boolean;
  readonly version?: string;
  readonly json?: boolean;
  readonly output?: string;
  readonly 'no-download'?: boolean;
  readonly limit?: string;
  readonly help?: boolean;
}

interface ParsedCommand {
  readonly command: CommandName;
  readonly extension?: string;
  readonly values: ParsedValues;
  readonly help: boolean;
}

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

export interface CliDependencies {
  readonly provider?: IncrementalExtensionProvider;
  readonly downloader?: VsixDownloader;
  readonly cwd?: string;
  readonly io?: CliIo;
}

export const cliMetadata = {
  name: CLI_NAME,
  version: PROJECT_VERSION,
  phase: 4,
} as const;

const ROOT_HELP = `VSIX Scout — find the right extension version for your VS Code.

Usage:
  vsix-scout resolve <extension> --vscode <version> --platform <target>
  vsix-scout versions <extension> [filters]
  vsix-scout inspect <extension> [filters]
  vsix-scout download <extension> --vscode <version> --platform <target> [--output <directory>]
  vsix-scout search <keyword> [--limit <count>]

Commands:
  resolve    Select and explain the newest compatible version without downloading
  versions   List normalized historical version variants
  inspect    Show extension metadata; use --json for complete normalized records
  download   Resolve, safely download, and calculate SHA-256
  search     List extensions for a keyword, ranked by Marketplace installs

Common options:
  --vscode <version>       Complete VS Code SemVer (required by resolve/download)
  --platform <target>      win32-x64, win32-arm64, linux-x64, linux-arm64,
                           darwin-x64, darwin-arm64, or universal
  --stable                 Use the stable channel (default)
  --pre-release            Use the pre-release channel
  --version <version>      Select or filter an exact extension SemVer
  --limit <count>          Maximum search results (default: 8)
  --json                   Emit versioned machine-readable JSON
  --output <directory>     Download directory (default: current directory)
  --no-download            Resolve and print a download plan without writing a file
  -h, --help               Show help
`;

function commandHelp(command: CommandName): string {
  const usage = {
    resolve:
      'vsix-scout resolve <extension> --vscode <version> --platform <target>',
    versions: 'vsix-scout versions <extension> [filters]',
    inspect: 'vsix-scout inspect <extension> [filters]',
    download:
      'vsix-scout download <extension> --vscode <version> --platform <target> [--output <directory>]',
    search: 'vsix-scout search <keyword> [--limit <count>]',
  }[command];
  return `Usage: ${usage}\n\nRun ${CLI_NAME} --help for all options.\n`;
}

function invalidInput(
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): ScoutError {
  return new ScoutError('INVALID_INPUT', message, { details });
}

function parseCommandLine(argv: readonly string[]): ParsedCommand | undefined {
  const first = argv[0];
  if (first === undefined || first === '--help' || first === '-h') {
    return undefined;
  }
  if (first === '--version' || first === '-V') {
    return {
      command: 'resolve',
      values: {},
      help: true,
      extension: `__version__:${cliMetadata.version}`,
    };
  }
  if (!COMMANDS.includes(first as CommandName)) {
    throw invalidInput(`Unknown command "${first}".`, { command: first });
  }

  const command = first as CommandName;
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...argv.slice(1)],
      options: CLI_OPTIONS,
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    throw invalidInput(
      error instanceof Error ? error.message : 'Could not parse arguments.',
      { command },
    );
  }

  const values = parsed.values as ParsedValues;
  const allowed = ALLOWED_OPTIONS[command];
  for (const option of Object.keys(values)) {
    if (!allowed.has(option)) {
      throw invalidInput(`--${option} is not valid for ${command}.`, {
        command,
        option,
      });
    }
  }

  if (values.stable === true && values['pre-release'] === true) {
    throw invalidInput('--stable and --pre-release are mutually exclusive.', {
      command,
    });
  }
  if (values.help === true) {
    return { command, values, help: true };
  }
  if (parsed.positionals.length !== 1) {
    throw invalidInput(`${command} expects exactly one extension reference.`, {
      command,
      positionalCount: parsed.positionals.length,
    });
  }

  const extension = parsed.positionals[0];
  if (extension === undefined) {
    throw invalidInput(`${command} expects an extension reference.`, {
      command,
    });
  }

  return {
    command,
    extension,
    values,
    help: false,
  };
}

function channel(values: ParsedValues): ReleaseChannel {
  return values['pre-release'] === true ? 'pre-release' : 'stable';
}

function validatedPlatform(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const platform = value.trim().toLowerCase();
  if (
    !REQUESTED_TARGET_PLATFORMS.includes(
      platform as (typeof REQUESTED_TARGET_PLATFORMS)[number],
    )
  ) {
    throw invalidInput('Unsupported target platform.', {
      field: 'platform',
      value,
      supported: REQUESTED_TARGET_PLATFORMS,
    });
  }
  return platform;
}

function resolutionRequest(values: ParsedValues): NormalizedResolutionRequest {
  if (values.vscode === undefined) {
    throw invalidInput('--vscode is required for resolve and download.', {
      field: 'vscode',
    });
  }
  const platform = validatedPlatform(values.platform);
  if (platform === undefined) {
    throw invalidInput('--platform is required for resolve and download.', {
      field: 'platform',
    });
  }

  return validateResolutionRequest({
    vscode: values.vscode,
    platform,
    channel: channel(values),
    ...(values.version === undefined ? {} : { version: values.version }),
  });
}

function searchLimit(values: ParsedValues): number | undefined {
  if (values.limit === undefined) {
    return undefined;
  }
  const limit = Number(values.limit);
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw invalidInput('--limit must be a positive integer.', {
      field: 'limit',
      value: values.limit,
    });
  }
  return limit;
}

/** True when the input is a bare keyword rather than an extension reference. */
function isSearchKeyword(value: string): boolean {
  if (value.includes('://')) {
    return false;
  }
  try {
    parseMarketplaceExtensionReference(value);
    return false;
  } catch {
    return true;
  }
}

function versionFilters(values: ParsedValues): VersionFilters {
  const platform = validatedPlatform(values.platform);
  const version =
    values.version === undefined
      ? undefined
      : validateExactExtensionVersion(values.version);
  return {
    channel: channel(values),
    ...(platform === undefined ? {} : { platform }),
    ...(version === undefined ? {} : { version }),
  };
}

function ensureMatchingVersions(
  record: ExtensionRecord,
  filters: VersionFilters,
) {
  const versions = filterVersions(record, filters);
  if (versions.length === 0) {
    throw new ScoutError(
      'NO_COMPATIBLE_VERSION',
      `No ${filters.channel} versions of ${record.extension.id} matched the requested filters.`,
      { details: { extensionId: record.extension.id, filters } },
    );
  }
  return versions;
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '');
}

function vsixFileName(
  extensionId: string,
  version: string,
  platform: string,
): string {
  return `${safeFilePart(extensionId)}-${safeFilePart(version)}-${safeFilePart(platform)}.vsix`;
}

function defaultIo(): CliIo {
  return {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  };
}

function internalError(error: unknown): ScoutError {
  return new ScoutError(
    'INTERNAL_ERROR',
    'An unexpected internal error occurred.',
    {
      cause: error,
    },
  );
}

const EXAMPLE_EXTENSION = 'ms-python.python';
const EXAMPLE_VSCODE = '1.95.0';
const EXAMPLE_PLATFORM = 'linux-x64';

/** A complete, runnable example for the command, used in error hints. */
function commandExample(command: string): string {
  switch (command) {
    case 'versions':
      return `vsix-scout versions ${EXAMPLE_EXTENSION} --platform ${EXAMPLE_PLATFORM}`;
    case 'inspect':
      return `vsix-scout inspect ${EXAMPLE_EXTENSION} --platform ${EXAMPLE_PLATFORM}`;
    case 'download':
      return `vsix-scout download ${EXAMPLE_EXTENSION} --vscode ${EXAMPLE_VSCODE} --platform ${EXAMPLE_PLATFORM}`;
    case 'search':
      return 'vsix-scout search python';
    default:
      return `vsix-scout resolve ${EXAMPLE_EXTENSION} --vscode ${EXAMPLE_VSCODE} --platform ${EXAMPLE_PLATFORM}`;
  }
}

/**
 * A copy-pasteable example appended to invalid-input errors. Required
 * arguments for `resolve`/`download` are all-or-nothing (--vscode and
 * --platform are both required), so a single-flag example would only invite
 * the next error; a complete command example unblocks the user in one step.
 */
function errorHintLines(
  error: ScoutError,
  command: CommandName | undefined,
): readonly string[] {
  if (error.code !== 'INVALID_INPUT') return [];

  const hintCommand =
    typeof error.details?.command === 'string'
      ? error.details.command
      : (command ?? 'resolve');
  return [`Example: ${commandExample(hintCommand)}`];
}

function renderError(
  error: ScoutError,
  json: boolean,
  command: CommandName | undefined,
): string {
  if (json) {
    return formatJson(error.toJSON());
  }
  const detailText =
    error.details === undefined
      ? ''
      : `\nDetails: ${JSON.stringify(error.details)}`;
  const hintLines = errorHintLines(error, command);
  const hintText = hintLines.length === 0 ? '' : `\n${hintLines.join('\n')}\n`;
  return `Error [${error.code}]: ${error.message}${detailText}${hintText}\n`;
}

async function extensionRecord(
  extension: string,
  provider: ExtensionProvider,
): Promise<ExtensionRecord> {
  const reference = parseMarketplaceExtensionReference(extension);
  return provider.getExtension(reference);
}

const CLI_MANIFEST_BATCH_SIZE = 20;

/**
 * Two-phase resolution: first resolve from known Engine properties only (no
 * manifest requests). Only fetch missing manifests (newest first) when a newer
 * missing-engine version could displace the selection or when no compatible
 * version is found. Manifest failures are tolerated by the provider.
 */
async function resolveRecordWithMinimalManifests(
  extension: string,
  request: NormalizedResolutionRequest,
  provider: IncrementalExtensionProvider,
): Promise<ExtensionRecord> {
  const reference = parseMarketplaceExtensionReference(extension);
  const baseOptions = { channel: request.channel, platform: request.platform };

  let record = await provider.getExtension(reference, {
    ...baseOptions,
    manifestLimit: 0,
  });
  for (;;) {
    let selectedVersion: string | undefined;
    try {
      selectedVersion = resolveExtension(record, request).selected.version;
    } catch (error) {
      if (
        !(error instanceof ScoutError) ||
        error.code !== 'NO_COMPATIBLE_VERSION'
      ) {
        throw error;
      }
      selectedVersion = undefined;
    }
    const selectionCertain =
      selectedVersion !== undefined &&
      !needsManifestForNewerCandidate(record, request, selectedVersion);
    if (selectionCertain) break;
    const hasPending =
      provider.hasPendingManifests?.(reference, baseOptions) ?? false;
    if (!hasPending) break;
    record = await provider.getExtension(reference, {
      ...baseOptions,
      manifestLimit: CLI_MANIFEST_BATCH_SIZE,
    });
  }
  return record;
}

async function searchSuggestions(
  extension: string | undefined,
  error: ScoutError,
  provider: ExtensionProvider,
): Promise<readonly MarketplaceSearchResult[] | undefined> {
  if (provider.searchExtensions === undefined || extension === undefined) {
    return undefined;
  }
  const isNotFound = error.code === 'EXTENSION_NOT_FOUND';
  // The extension-reference parser reports INVALID_INPUT without a `field`;
  // validation errors for --vscode/--platform/--limit all carry one.
  const isKeyword =
    error.code === 'INVALID_INPUT' &&
    error.details?.field === undefined &&
    isSearchKeyword(extension);
  if (!isNotFound && !isKeyword) {
    return undefined;
  }
  try {
    return await provider.searchExtensions(extension);
  } catch {
    // A failed suggestion lookup must not replace the primary error.
    return undefined;
  }
}

function renderSuggestionLines(
  results: readonly MarketplaceSearchResult[],
): string {
  const lines = results.map((result) => {
    const label = result.displayName ?? result.name;
    return `  ${result.id}  ${label} (${result.installCount.toLocaleString('en-US')} installs)`;
  });
  return `\nDid you mean?\n${lines.join('\n')}\n`;
}

/** Returns a copy of the error with suggestions merged into `details`. */
function withSuggestionsInDetails(
  error: ScoutError,
  results: readonly MarketplaceSearchResult[],
): ScoutError {
  return new ScoutError(error.code, error.message, {
    retryable: error.retryable,
    details: {
      ...(error.details ?? {}),
      suggestions: results.map((result) => ({
        id: result.id,
        ...(result.displayName === undefined
          ? {}
          : { displayName: result.displayName }),
        installCount: result.installCount,
      })),
    },
  });
}

export async function runCli(
  argv: readonly string[],
  dependencies: CliDependencies = {},
): Promise<number> {
  const io = dependencies.io ?? defaultIo();
  const commandArguments = argv[0] === '--' ? argv.slice(1) : argv;
  const provider = dependencies.provider ?? new MarketplaceProvider();
  let parsed: ParsedCommand | undefined;

  try {
    parsed = parseCommandLine(commandArguments);
    if (parsed === undefined) {
      io.stdout(ROOT_HELP);
      return 0;
    }
    if (parsed.extension?.startsWith('__version__:') === true) {
      io.stdout(`${cliMetadata.version}\n`);
      return 0;
    }
    if (parsed.help) {
      io.stdout(commandHelp(parsed.command));
      return 0;
    }

    const extension = parsed.extension;
    if (extension === undefined) {
      throw internalError(new Error('Parsed command had no extension.'));
    }
    const json = parsed.values.json === true;

    if (parsed.command === 'resolve' || parsed.command === 'download') {
      const request = resolutionRequest(parsed.values);
      const record = await resolveRecordWithMinimalManifests(
        extension,
        request,
        provider,
      );
      const result = resolveExtension(record, request);

      if (parsed.command === 'resolve') {
        io.stdout(
          json
            ? formatJson(resolutionJson('resolve', result))
            : renderResolution(result),
        );
        return 0;
      }

      // The deterministic Marketplace endpoint (Pattern B) always exists for a
      // resolved version; the metadata CDN asset (Pattern A) is only a fallback.
      const links = resolutionDownloadLinks(result);
      const plannedSourceUrl = links.primary;
      const fileName = vsixFileName(
        record.extension.id,
        result.selected.version,
        result.selected.targetPlatform,
      );
      const outputOption = parsed.values.output;
      const displayPath =
        outputOption === undefined ? fileName : join(outputOption, fileName);
      const baseOutput = resolutionJson('download', result);

      if (parsed.values['no-download'] === true) {
        const planned = {
          ...baseOutput,
          download: {
            status: 'planned',
            fileName,
            path: displayPath,
            sourceUrl: plannedSourceUrl,
          },
        };
        io.stdout(
          json
            ? formatJson(planned)
            : `${renderResolution(result)}\nDownload plan: ${displayPath}\nNo file was written (--no-download).\n`,
        );
        return 0;
      }

      const downloader = dependencies.downloader ?? new SafeVsixDownloader();
      const download = await downloader.download({
        preferredUrl: links.primary,
        ...(result.selected.assets.vsix === undefined
          ? {}
          : { asset: result.selected.assets.vsix }),
        ...(result.selected.upstreamSha256 === undefined
          ? {}
          : { expectedSha256: result.selected.upstreamSha256 }),
        outputDirectory: resolvePath(
          dependencies.cwd ?? process.cwd(),
          outputOption ?? '.',
        ),
        fileName,
      });
      const completed = {
        ...baseOutput,
        download: {
          status: 'downloaded',
          fileName,
          path: displayPath,
          sourceUrl: download.sourceUrl,
          size: download.size,
          sha256: download.sha256,
        },
      };
      io.stdout(
        json
          ? formatJson(completed)
          : `${renderResolution(result)}\nDownloaded: ${displayPath}\nSize:       ${download.size} bytes\nSHA-256:    ${download.sha256}\n`,
      );
      return 0;
    }

    if (parsed.command === 'search') {
      const keyword = extension.trim();
      if (keyword === '') {
        throw invalidInput('search expects a non-empty keyword.', {
          command: 'search',
        });
      }
      if (provider.searchExtensions === undefined) {
        throw new ScoutError(
          'INTERNAL_ERROR',
          'The configured provider does not support keyword search.',
          { details: { command: 'search' } },
        );
      }
      const limit = searchLimit(parsed.values);
      const results = await provider.searchExtensions(keyword, {
        ...(limit === undefined ? {} : { limit }),
      });
      io.stdout(
        json
          ? formatJson(searchJson(keyword, results))
          : renderSearch(keyword, results),
      );
      return 0;
    }

    const filters = versionFilters(parsed.values);
    const record = await extensionRecord(extension, provider);
    const versions = ensureMatchingVersions(record, filters);
    if (parsed.command === 'versions') {
      io.stdout(
        json
          ? formatJson(versionsJson(record, versions, filters))
          : renderVersions(record, versions),
      );
      return 0;
    }

    io.stdout(
      json
        ? formatJson(inspectJson(record, versions, filters))
        : renderInspection(record, versions),
    );
    return 0;
  } catch (error) {
    const scoutError =
      error instanceof ScoutError ? error : internalError(error);
    const json =
      parsed?.values.json === true || commandArguments.includes('--json');
    const command = parsed?.command;
    const suggestions = await searchSuggestions(
      parsed?.extension,
      scoutError,
      provider,
    );
    if (json && suggestions !== undefined && suggestions.length > 0) {
      io.stderr(
        renderError(
          withSuggestionsInDetails(scoutError, suggestions),
          json,
          command,
        ),
      );
    } else {
      io.stderr(renderError(scoutError, json, command));
      if (suggestions !== undefined && suggestions.length > 0) {
        io.stderr(renderSuggestionLines(suggestions));
      }
    }
    return EXIT_CODES[scoutError.code];
  }
}

export * from './download.js';
export * from './output.js';
