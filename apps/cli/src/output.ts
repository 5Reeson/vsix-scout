import type {
  ExtensionAsset,
  ExtensionRecord,
  ExtensionVersionCandidate,
  ResolutionResult,
} from '@vsix-scout/core';
import { JSON_SCHEMA_VERSION } from '@vsix-scout/shared';

export interface VersionFilters {
  readonly channel: 'stable' | 'pre-release';
  readonly platform?: string;
  readonly version?: string;
}

export function preferredAssetUrl(
  asset: ExtensionAsset | undefined,
): string | undefined {
  return asset?.fallbackUri ?? asset?.primaryUri;
}

export function filterVersions(
  record: ExtensionRecord,
  filters: VersionFilters,
): readonly ExtensionVersionCandidate[] {
  return record.versions.filter(
    (candidate) =>
      candidate.channel === filters.channel &&
      (filters.version === undefined ||
        candidate.version === filters.version) &&
      (filters.platform === undefined ||
        candidate.targetPlatform === filters.platform ||
        (filters.platform !== 'universal' &&
          candidate.targetPlatform === 'universal')),
  );
}

export function resolutionJson(
  command: 'resolve' | 'download',
  result: ResolutionResult,
): Readonly<Record<string, unknown>> {
  const vsixUrl = preferredAssetUrl(result.selected.assets.vsix);
  const manifestUrl = preferredAssetUrl(result.selected.assets.manifest);

  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    command,
    extension: result.extension,
    target: result.target,
    selected: {
      version: result.selected.version,
      engine: result.compatibility.engine,
      targetPlatform: result.selected.targetPlatform,
      channel: result.selected.channel,
      publishedAt: result.selected.publishedAt,
      ...(vsixUrl === undefined ? {} : { assetUrl: vsixUrl }),
      ...(manifestUrl === undefined ? {} : { manifestUrl }),
      ...(result.selected.upstreamSha256 === undefined
        ? {}
        : { upstreamSha256: result.selected.upstreamSha256 }),
    },
    source: result.source,
    compatibility: result.compatibility,
    diagnostics: result.diagnostics,
  };
}

function versionJson(candidate: ExtensionVersionCandidate) {
  return {
    version: candidate.version,
    channel: candidate.channel,
    targetPlatform: candidate.targetPlatform,
    publishedAt: candidate.publishedAt,
    ...(candidate.engine === undefined ? {} : { engine: candidate.engine }),
    engineSource: candidate.engineSource,
    hasVsix: candidate.assets.vsix !== undefined,
  };
}

export function versionsJson(
  record: ExtensionRecord,
  versions: readonly ExtensionVersionCandidate[],
  filters: VersionFilters,
): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    command: 'versions',
    extension: record.extension,
    source: { provider: record.source, official: true },
    filters,
    versions: versions.map(versionJson),
  };
}

export function inspectJson(
  record: ExtensionRecord,
  versions: readonly ExtensionVersionCandidate[],
  filters: VersionFilters,
): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    command: 'inspect',
    extension: record.extension,
    source: { provider: record.source, official: true },
    filters,
    summary: {
      variantCount: versions.length,
      distinctVersionCount: new Set(
        versions.map((candidate) => candidate.version),
      ).size,
      platforms: [
        ...new Set(versions.map((candidate) => candidate.targetPlatform)),
      ].sort(),
      missingEngineCount: versions.filter(
        (candidate) => candidate.engineSource === 'missing',
      ).length,
    },
    versions,
  };
}

export function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function formatTable(rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) {
    return '';
  }

  const columnCount = Math.max(...rows.map((row) => row.length));
  const widths = Array.from({ length: columnCount }, (_, index) =>
    Math.max(...rows.map((row) => row[index]?.length ?? 0)),
  );
  return rows
    .map((row, rowIndex) => {
      const line = row
        .map((cell, index) =>
          index === row.length - 1 ? cell : cell.padEnd(widths[index] ?? 0),
        )
        .join('  ');
      if (rowIndex !== 0) {
        return line;
      }
      const separator = widths.map((width) => '-'.repeat(width)).join('  ');
      return `${line}\n${separator}`;
    })
    .join('\n');
}

export function renderResolution(result: ResolutionResult): string {
  const lines = [
    `Extension: ${result.extension.id}`,
    `Version:   ${result.selected.version}`,
    `Channel:   ${result.selected.channel}`,
    `Engine:    ${result.compatibility.engine}`,
    `Platform:  ${result.selected.targetPlatform} (${result.compatibility.platformMatch})`,
    `Published: ${result.selected.publishedAt}`,
    `VSIX:      ${preferredAssetUrl(result.selected.assets.vsix) ?? 'unavailable'}`,
    '',
    'Selection:',
    ...result.compatibility.reasons.map((reason) => `  - ${reason.message}`),
  ];

  if (result.compatibility.limitations.length > 0) {
    lines.push(
      '',
      'Limitations:',
      ...result.compatibility.limitations.map((item) => `  - ${item}`),
    );
  }

  return `${lines.join('\n')}\n`;
}

export function renderVersions(
  record: ExtensionRecord,
  versions: readonly ExtensionVersionCandidate[],
): string {
  const rows = [
    ['VERSION', 'CHANNEL', 'PLATFORM', 'ENGINE', 'PUBLISHED'],
    ...versions.map((candidate) => [
      candidate.version,
      candidate.channel,
      candidate.targetPlatform,
      candidate.engine ?? 'missing',
      candidate.publishedAt,
    ]),
  ];
  return `Extension: ${record.extension.id}\nVariants:  ${versions.length}\n\n${formatTable(rows)}\n`;
}

export function renderInspection(
  record: ExtensionRecord,
  versions: readonly ExtensionVersionCandidate[],
): string {
  const distinctVersions = new Set(
    versions.map((candidate) => candidate.version),
  ).size;
  const platforms = [
    ...new Set(versions.map((candidate) => candidate.targetPlatform)),
  ].sort();
  const missingEngines = versions.filter(
    (candidate) => candidate.engineSource === 'missing',
  ).length;

  return [
    `Extension:         ${record.extension.id}`,
    `Display name:      ${record.extension.displayName ?? '-'}`,
    `Source:            ${record.source}`,
    `Variants:          ${versions.length}`,
    `Distinct versions: ${distinctVersions}`,
    `Platforms:         ${platforms.join(', ') || '-'}`,
    `Missing engines:   ${missingEngines}`,
    '',
    'Use --json for complete normalized version, dependency, asset, and hash metadata.',
    '',
  ].join('\n');
}
