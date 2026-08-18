import type { MessageKey } from './zh.js';

// 英文字典：形状与 zh 完全一致。
// `satisfies Record<MessageKey, string>` 在编译期保证每个键都有英文翻译，
// 漏译或多键都会报错。
export const en = {
  brand: 'VSIX Scout',

  'nav.about': 'About',
  'nav.langToggle': 'Switch language',
  'nav.langSwitchTo': '切换到中文',

  'hero.lead': 'Find the official VSIX that fits your Visual Studio Code',
  'hero.support':
    'Query the Marketplace directly and find the matching official VSIX in your browser.',

  'section.queryTitle': 'Find Compatible Extensions',
  'section.queryDescription':
    'Enter the extension and target environment to find the official VSIX version that matches your Visual Studio Code.',
  'section.resultTitle': 'Recommended result',

  'form.extensionLabel': 'Extension ID or Marketplace URL',
  'form.extensionPlaceholder': 'ms-python.python',
  'form.vscodeLabel': 'Full Visual Studio Code version',
  'form.vscodePlaceholder': '1.95.0',
  'form.platformLabel': 'Target platform',
  'form.channelLegend': 'Channel',
  'form.resolve': 'Go Search',
  'form.resolving': 'searching',
  'form.note':
    'Lookup only, no downloads. Your most recently used Visual Studio Code version and platform are stored only on this device.',
  'form.requiredExtension': 'Enter an extension ID or Marketplace URL.',
  'form.requiredVersion': 'Enter a full Visual Studio Code version.',

  'reason.channelMatch':
    'This version belongs to the requested {channel} channel.',
  'reason.engineCompatible':
    'Visual Studio Code {vscode} satisfies engines.vscode {engine}.',
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
  'result.download': 'Download official VSIX',
  'result.copyMarketplace': 'Copy Marketplace link',
  'result.copyMarketplaceLabel': 'Marketplace link',
  'result.copyCdn': 'Copy CDN link',
  'result.copyCdnLabel': 'CDN link',
  'result.hashLabel': 'Marketplace reported SHA-256',
  'result.hashNote':
    'Value reported by Marketplace metadata; the browser has not verified the downloaded file.',
  'result.copySha': 'Copy SHA-256',

  'versions.summary': 'See other compatible versions',
  'versions.none': 'No other version satisfies the current criteria.',
  'versions.showMore': 'Show more',
  'versions.loadingMore': 'Querying older versions',
  'versions.officialVsix': 'Official VSIX ↗',

  'suggestions.title': 'Did you mean “{keyword}”?',
  'suggestions.loading': 'Searching for similar extensions…',
  'suggestions.empty': 'No extensions matched “{keyword}”.',
  'suggestions.installs': '{count} installs',
  'suggestions.use': 'Use this extension',

  'footer.line1':
    'VSIX Scout picks a compatible version from Marketplace engines.vscode, channel, and platform metadata.',
  'footer.line2':
    'No proxying, no caching, no executing VSIX. Downloads come straight from Microsoft.',

  'about.title': 'About VSIX Scout',
  'about.lead':
    'A small tool that finds the official VSIX package matching your Visual Studio Code version, right in your browser.',
  'about.back': 'Back to the query page',

  'about.background.title': 'Background',
  'about.background.body':
    'On intranets or offline networks the official Marketplace is unreachable, so the only option is to download VSIX files and install them offline. But cross-referencing engines.vscode, platform, and channel by hand to find the version that matches your Visual Studio Code is easy to get wrong. VSIX Scout does that in your browser and tells you which version to download.',

  'about.forWhom.title': 'Who it is for',
  'about.forWhom.1':
    'Developers on intranets or offline networks that cannot reach the official Marketplace.',
  'about.forWhom.2':
    'Teams that need to pin extension versions and mirror a fixed setup against a specific Visual Studio Code version.',
  'about.forWhom.3':
    'Anyone who wants to confirm an extension is compatible with their Visual Studio Code before downloading.',

  'about.how.title': 'What it does',
  'about.how.1':
    'Queries Microsoft Marketplace metadata directly from your browser, through no intermediate server.',
  'about.how.2':
    'Combines engines.vscode, target platform, and release channel to pick a compatible official VSIX from the version history.',
  'about.how.3':
    'Shows the recommended version, the reasoning, and the official download link. Downloads come straight from Microsoft — no proxying, no caching, no executing VSIX.',

  'about.privacy.title': 'Privacy',
  'about.privacy':
    'Apart from the network requests needed to query the Marketplace, nothing is sent to any third party. Your most recently used version and platform are stored only in your browser.',

  'error.shareInvalid.title': 'Invalid input',
  'error.shareInvalid.detail':
    'The shared link contains an unsupported platform or channel. Please reselect and query again.',

  'error.unexpected.title': 'An unexpected error occurred',
  'error.unexpected.detail':
    'Please refresh and try again. If the issue persists, file it on GitHub.',
  'error.invalidInput.title': 'Invalid input',
  'error.invalidInput.detail':
    'Enter a full publisher.extension or an official Marketplace URL, along with a complete Visual Studio Code version. If you typed a keyword, pick from the suggestions below.',
  'error.notFound.title': 'Extension not found',
  'error.notFound.detail':
    'Check that the publisher and extension names are accurate, or pick from the suggestions below.',
  'error.noCompatible.title': 'No compatible version',
  'error.noCompatible.detail':
    'No version in Marketplace history matches the current Visual Studio Code, platform, and channel together.',
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
