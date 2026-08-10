import { JSON_SCHEMA_VERSION } from '@vsix-scout/shared';
import { rcompare, satisfies, valid, validRange } from 'semver';

import { ScoutError } from './errors.js';
import type {
  ExtensionRecord,
  ExtensionVersionCandidate,
  ReleaseChannel,
} from './model.js';

export const REJECTION_CODES = [
  'invalid-extension-version',
  'exact-version-mismatch',
  'channel-mismatch',
  'platform-mismatch',
  'missing-engine',
  'invalid-engine-range',
  'incompatible-engine',
] as const;

export type RejectionCode = (typeof REJECTION_CODES)[number];

export type PlatformMatch = 'exact' | 'universal';

export interface ResolutionRequest {
  readonly vscode: string;
  readonly platform: string;
  /** Defaults to stable. Pre-release is an explicit, strict channel. */
  readonly channel?: ReleaseChannel;
  /** Select only this extension version after SemVer normalization. */
  readonly version?: string;
}

export interface ResolutionReason {
  readonly code:
    | 'channel-match'
    | 'engine-compatible'
    | 'engine-from-manifest'
    | 'exact-platform-match'
    | 'universal-platform-fallback'
    | 'exact-version-selected'
    | 'latest-compatible-selected';
  readonly message: string;
}

export interface ResolutionDiagnostics {
  readonly examinedCandidates: number;
  readonly compatibleCandidates: number;
  /** Each rejected candidate is counted by its first failing rule. */
  readonly rejectionCounts: Readonly<Record<RejectionCode, number>>;
}

export interface ResolutionResult {
  readonly schemaVersion: typeof JSON_SCHEMA_VERSION;
  readonly extension: ExtensionRecord['extension'];
  readonly target: {
    readonly vscode: string;
    readonly platform: string;
    readonly channel: ReleaseChannel;
    readonly version?: string;
  };
  readonly selected: ExtensionVersionCandidate;
  readonly source: {
    readonly provider: ExtensionRecord['source'];
    readonly official: true;
  };
  readonly compatibility: {
    readonly compatible: true;
    readonly engine: string;
    readonly platformMatch: PlatformMatch;
    readonly reasons: readonly ResolutionReason[];
    readonly limitations: readonly string[];
  };
  readonly diagnostics: ResolutionDiagnostics;
}

interface NormalizedRequest {
  readonly vscode: string;
  readonly platform: string;
  readonly channel: ReleaseChannel;
  readonly version?: string;
}

interface EligibleCandidate {
  readonly candidate: ExtensionVersionCandidate;
  readonly engine: string;
  readonly normalizedVersion: string;
  readonly platformMatch: PlatformMatch;
  readonly originalIndex: number;
}

function invalidInput(
  message: string,
  details: Readonly<Record<string, unknown>>,
): never {
  throw new ScoutError('INVALID_INPUT', message, { details });
}

function normalizeRequest(request: ResolutionRequest): NormalizedRequest {
  const vscode = valid(request.vscode);
  if (vscode === null) {
    invalidInput('Target VS Code version must be a complete valid SemVer.', {
      field: 'vscode',
      value: request.vscode,
    });
  }

  const platform = request.platform.trim().toLowerCase();
  if (platform === '') {
    invalidInput('Target platform must not be empty.', {
      field: 'platform',
      value: request.platform,
    });
  }

  const channel = request.channel ?? 'stable';
  if (channel !== 'stable' && channel !== 'pre-release') {
    invalidInput('Channel must be stable or pre-release.', {
      field: 'channel',
      value: channel,
    });
  }

  let extensionVersion: string | undefined;
  if (request.version !== undefined) {
    extensionVersion = valid(request.version) ?? undefined;
    if (extensionVersion === undefined) {
      invalidInput('Requested extension version must be a valid SemVer.', {
        field: 'version',
        value: request.version,
      });
    }
  }

  return {
    vscode,
    platform,
    channel,
    ...(extensionVersion === undefined ? {} : { version: extensionVersion }),
  };
}

function emptyRejectionCounts(): Record<RejectionCode, number> {
  return Object.fromEntries(REJECTION_CODES.map((code) => [code, 0])) as Record<
    RejectionCode,
    number
  >;
}

function platformMatch(
  candidatePlatform: string,
  targetPlatform: string,
): PlatformMatch | undefined {
  const normalizedCandidatePlatform = candidatePlatform.toLowerCase();
  if (normalizedCandidatePlatform === targetPlatform) {
    return 'exact';
  }
  if (normalizedCandidatePlatform === 'universal') {
    return 'universal';
  }
  return undefined;
}

function evaluateCandidate(
  candidate: ExtensionVersionCandidate,
  request: NormalizedRequest,
  originalIndex: number,
): EligibleCandidate | RejectionCode {
  const normalizedVersion = valid(candidate.version);
  if (normalizedVersion === null) {
    return 'invalid-extension-version';
  }

  if (request.version !== undefined && normalizedVersion !== request.version) {
    return 'exact-version-mismatch';
  }

  if (candidate.channel !== request.channel) {
    return 'channel-mismatch';
  }

  const match = platformMatch(candidate.targetPlatform, request.platform);
  if (match === undefined) {
    return 'platform-mismatch';
  }

  const engine = candidate.engine?.trim();
  if (engine === undefined || engine === '') {
    return 'missing-engine';
  }

  const engineRange = validRange(engine);
  if (engineRange === null) {
    return 'invalid-engine-range';
  }

  if (!satisfies(request.vscode, engineRange)) {
    return 'incompatible-engine';
  }

  return {
    candidate,
    engine,
    normalizedVersion,
    platformMatch: match,
    originalIndex,
  };
}

function publishedTime(candidate: ExtensionVersionCandidate): number {
  const timestamp = Date.parse(candidate.publishedAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function compareCandidates(a: EligibleCandidate, b: EligibleCandidate): number {
  const versionOrder = rcompare(a.normalizedVersion, b.normalizedVersion);
  if (versionOrder !== 0) {
    return versionOrder;
  }

  if (a.platformMatch !== b.platformMatch) {
    return a.platformMatch === 'exact' ? -1 : 1;
  }

  const publishedOrder =
    publishedTime(b.candidate) - publishedTime(a.candidate);
  if (publishedOrder !== 0) {
    return publishedOrder;
  }

  return a.originalIndex - b.originalIndex;
}

function selectionReasons(
  selected: EligibleCandidate,
  request: NormalizedRequest,
): readonly ResolutionReason[] {
  const reasons: ResolutionReason[] = [
    {
      code: 'channel-match',
      message: `The candidate is in the requested ${request.channel} channel.`,
    },
    {
      code: 'engine-compatible',
      message: `VS Code ${request.vscode} satisfies engines.vscode ${selected.engine}.`,
    },
    selected.platformMatch === 'exact'
      ? {
          code: 'exact-platform-match',
          message: `The candidate exactly matches ${request.platform}.`,
        }
      : {
          code: 'universal-platform-fallback',
          message: `No same-version exact platform candidate was preferred; the universal package supports ${request.platform}.`,
        },
    request.version === undefined
      ? {
          code: 'latest-compatible-selected',
          message:
            'This is the highest compatible extension version after filtering.',
        }
      : {
          code: 'exact-version-selected',
          message: `The candidate matches requested extension version ${request.version}.`,
        },
  ];

  if (selected.candidate.engineSource === 'manifest') {
    reasons.splice(2, 0, {
      code: 'engine-from-manifest',
      message:
        'The Marketplace Engine property was missing; engines.vscode came from the version manifest.',
    });
  }

  return reasons;
}

function limitations(selected: ExtensionVersionCandidate): readonly string[] {
  const messages = [
    'Compatibility is based on engines.vscode metadata and does not guarantee that external runtime dependencies will work.',
  ];

  if (selected.assets.vsix === undefined) {
    messages.push(
      'The selected metadata has no VSIX asset; the provider or download phase must verify file availability.',
    );
  }

  return messages;
}

export function resolveExtension(
  record: ExtensionRecord,
  request: ResolutionRequest,
): ResolutionResult {
  const normalizedRequest = normalizeRequest(request);
  const rejectionCounts = emptyRejectionCounts();
  const eligible: EligibleCandidate[] = [];

  record.versions.forEach((candidate, index) => {
    const evaluation = evaluateCandidate(candidate, normalizedRequest, index);
    if (typeof evaluation === 'string') {
      rejectionCounts[evaluation] += 1;
    } else {
      eligible.push(evaluation);
    }
  });

  eligible.sort(compareCandidates);
  const selected = eligible[0];
  const diagnostics: ResolutionDiagnostics = {
    examinedCandidates: record.versions.length,
    compatibleCandidates: eligible.length,
    rejectionCounts,
  };

  if (selected === undefined) {
    throw new ScoutError(
      'NO_COMPATIBLE_VERSION',
      `No compatible version of ${record.extension.id} matched the requested target.`,
      {
        details: {
          extensionId: record.extension.id,
          target: normalizedRequest,
          diagnostics,
        },
      },
    );
  }

  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    extension: record.extension,
    target: normalizedRequest,
    selected: selected.candidate,
    source: {
      provider: record.source,
      official: true,
    },
    compatibility: {
      compatible: true,
      engine: selected.engine,
      platformMatch: selected.platformMatch,
      reasons: selectionReasons(selected, normalizedRequest),
      limitations: limitations(selected.candidate),
    },
    diagnostics,
  };
}
