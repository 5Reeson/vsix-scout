import type { MessageKey } from './zh.js';

// 英文字典：形状与 zh 完全一致。
// `satisfies Record<MessageKey, string>` 在编译期保证每个键都有英文翻译，
// 漏译或多键都会报错。
export const en = {
  brand: 'VSIX Scout',

  'nav.about': 'About',
  'nav.langToggle': 'Switch language',
  'nav.langSwitchTo': '切换到中文',

  'hero.lead': 'Find the official VSIX that fits your VS Code',
  'hero.support':
    'Query the Marketplace directly and resolve compatibility in your browser.',

  'section.queryTitle': 'Compatibility lookup',
  'section.queryDescription':
    'Enter the extension and target environment to find the latest compatible version.',
  'section.resultTitle': 'Recommended result',

  'form.extensionLabel': 'Extension ID or Marketplace URL',
  'form.extensionPlaceholder': 'ms-python.python',
  'form.vscodeLabel': 'Full VS Code version',
  'form.vscodePlaceholder': '1.95.0',
  'form.platformLabel': 'Target platform',
  'form.channelLegend': 'Channel',
  'form.resolve': 'Resolve compatibility',
  'form.resolving': 'Resolving compatibility',
  'form.note':
    'Lookup only — no downloads. Your most recently used VS Code version and platform are stored only on this device.',

  'reason.channelMatch':
    'This version belongs to the requested {channel} channel.',
  'reason.engineCompatible':
    'VS Code {vscode} satisfies engines.vscode {engine}.',
  'reason.engineFromManifest':
    'Marketplace metadata lacks an Engine, so engines.vscode comes from that version’s official manifest.',
  'reason.exactPlatform': 'The package platform exactly matches {platform}.',
  'reason.universalFallback':
    'No better {platform} variant exists for this version, so the universal package is used.',
  'reason.exactVersion': 'The version matches the requested {version} exactly.',
  'reason.latestCompatible':
    'This is the highest compatible version after channel, platform, and engine filtering.',

  'idle.kicker': 'Ready',
  'idle.body':
    'After you submit the form above, the recommended version, reasoning, and official download link will appear here.',
  'loading.aria': 'Querying the Marketplace',
  'error.kicker': 'Query failed',
  'error.retryNote': 'Please try Resolve again shortly.',
  'copy.copied': '{label} copied.',
  'copy.failed': 'Failed to copy {label}. Please select the text manually.',

  'result.tagRecommended': 'Recommended',
  'result.tagUniversalFallback': 'universal fallback',
  'result.publishedOn': 'Published {date}',
  'result.marketplace': 'Microsoft Marketplace',
  'result.factsEngine': 'engines.vscode',
  'result.factsChannel': 'Channel',
  'result.factsActualPlatform': 'Actual platform',
  'result.factsUniversal': 'Universal fallback',
  'result.yes': 'Yes',
  'result.no': 'No',
  'result.why': 'Why this version',
  'result.noDownloadUrl':
    'Marketplace metadata did not provide a usable VSIXPackage URL.',
  'result.download': 'Download official VSIX',
  'result.copyLink': 'Copy download link',
  'result.copyLinkLabel': 'Download URL',
  'result.hashLabel': 'Marketplace reported SHA-256',
  'result.hashNote':
    'Value reported by Marketplace metadata; the browser has not verified the downloaded file.',
  'result.copySha': 'Copy SHA-256',

  'versions.summary': 'See other compatible versions ({count})',
  'versions.none': 'No other version satisfies the current criteria.',
  'versions.showMore': 'Show more',
  'versions.officialVsix': 'Official VSIX ↗',

  'footer.line1':
    'VSIX Scout picks a compatible version from Marketplace engines.vscode, channel, and platform metadata.',
  'footer.line2':
    'No proxying, no caching, no executing VSIX. Downloads come straight from Microsoft.',

  'error.shareInvalid.title': 'Invalid input',
  'error.shareInvalid.detail':
    'The shared link contains an unsupported platform or channel. Please reselect and query again.',

  'error.unexpected.title': 'An unexpected error occurred',
  'error.unexpected.detail':
    'Please refresh and try again. If the issue persists, file it on GitHub.',
  'error.invalidInput.title': 'Invalid input',
  'error.invalidInput.detail':
    'Enter a full publisher.extension or an official Marketplace URL, along with a complete VS Code version.',
  'error.notFound.title': 'Extension not found',
  'error.notFound.detail':
    'Check that the publisher and extension names are correct. Keyword search is not supported in this first version.',
  'error.noCompatible.title': 'No compatible version',
  'error.noCompatible.detail':
    'No version in Marketplace history matches the current VS Code, platform, and channel together.',
  'error.unsafeUrl.title': 'Download URL failed security checks',
  'error.unsafeUrl.detail':
    'Marketplace returned a resource URL outside the allowlist, so the page blocked the link.',
  'error.rateLimited.title': 'Marketplace requests are rate limited',
  'error.rateLimited.detail':
    'Microsoft Marketplace returned a 429. Please retry shortly.',
  'error.manifest.title': 'Manifest fallback failed',
  'error.manifest.detail':
    'Marketplace metadata is missing an engine and the browser failed to read the official manifest. Please retry shortly.',
  'error.upstreamInvalid.title': 'Unexpected Marketplace response format',
  'error.upstreamInvalid.detail':
    'Upstream data failed schema or response-size checks. The page did not use the raw payload.',
  'error.upstreamUnavailable.title': 'Cannot reach the Marketplace',
  'error.upstreamUnavailable.detail':
    'The request timed out or the network failed. Confirm this network can reach the Visual Studio Marketplace.',
  'error.queryFailed.title': 'Query failed',
  'error.queryFailed.detail':
    "The page couldn't complete this lookup. Please retry shortly.",
} satisfies Record<MessageKey, string>;
