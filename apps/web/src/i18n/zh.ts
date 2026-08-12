// 中文字典：作为键集合的类型基准。
// MessageKey 由 `keyof typeof zh` 推导，en.ts 用 `satisfies Record<MessageKey, string>`
// 保证两种语言键完整、类型安全（漏译会编译报错）。
// 键按命名空间用点号分组（form.* / result.* / error.* …）。
export const zh = {
  brand: 'VSIX Scout',

  'nav.about': 'About',
  'nav.langToggle': '切换语言',
  'nav.langSwitchTo': 'Switch to English',

  'hero.lead': '帮你找到适合当前 VS Code 的官方 VSIX 包',
  'hero.support': '直接查询 Marketplace，在浏览器内完成兼容性解析。',

  'section.queryTitle': '兼容性查询',
  'section.queryDescription': '输入扩展信息和目标环境，找到最新兼容版本。',
  'section.resultTitle': '推荐结果',

  'form.extensionLabel': 'Extension ID 或 Marketplace URL',
  'form.extensionPlaceholder': 'ms-python.python',
  'form.vscodeLabel': 'VS Code 完整版本号',
  'form.vscodePlaceholder': '1.95.0',
  'form.platformLabel': '目标平台',
  'form.channelLegend': 'Channel',
  'form.resolve': '解析兼容性',
  'form.resolving': '正在解析兼容性',
  'form.note': '只查询，不下载。最近使用的 VS Code 版本和平台仅保存在本机。',

  'reason.channelMatch': '版本属于请求的 {channel} channel。',
  'reason.engineCompatible': 'VS Code {vscode} 满足 engines.vscode {engine}。',
  'reason.engineFromManifest':
    'Marketplace metadata 缺少 Engine，engines.vscode 来自该版本的官方 manifest。',
  'reason.exactPlatform': '包的平台与 {platform} 精确匹配。',
  'reason.universalFallback':
    '该版本没有更优的 {platform} 变体，使用 universal 包。',
  'reason.exactVersion': '版本与指定的 {version} 完全一致。',
  'reason.latestCompatible':
    '这是完成 channel、平台和 engine 过滤后的最高兼容版本。',

  'idle.kicker': '等待查询',
  'idle.body': '提交上方信息后，这里会显示推荐版本、选择原因和官方下载链接。',
  'loading.aria': '正在查询 Marketplace',
  'error.kicker': 'Query failed',
  'error.retryNote': '请稍后再次 Resolve。',
  'copy.copied': '{label}已复制。',
  'copy.failed': '{label}复制失败，请手动选择文本。',

  'result.tagRecommended': 'Recommended',
  'result.tagUniversalFallback': 'universal fallback',
  'result.publishedOn': '发布于 {date}',
  'result.marketplace': 'Microsoft Marketplace',
  'result.factsEngine': 'engines.vscode',
  'result.factsChannel': 'Channel',
  'result.factsActualPlatform': '实际平台',
  'result.factsUniversal': 'Universal fallback',
  'result.yes': 'Yes',
  'result.no': 'No',
  'result.why': '选择原因',
  'result.noDownloadUrl':
    'Marketplace metadata 没有提供可用的 VSIXPackage URL。',
  'result.download': 'Download official VSIX',
  'result.copyLink': '复制下载链接',
  'result.copyLinkLabel': '下载 URL',
  'result.hashLabel': 'Marketplace reported SHA-256',
  'result.hashNote': 'Marketplace metadata 报告值，浏览器未验证下载文件。',
  'result.copySha': '复制 SHA-256',

  'versions.summary': '查看其他兼容版本',
  'versions.none': '没有其他版本同时满足当前条件。',
  'versions.showMore': '显示更多',
  'versions.loadingMore': '正在查询更早版本',
  'versions.officialVsix': '官方 VSIX ↗',

  'footer.line1':
    'VSIX Scout 根据 Marketplace 的 engines.vscode、channel 和平台信息选择兼容版本。',
  'footer.line2': '不代理、不缓存、不执行 VSIX。下载直接来自 Microsoft。',

  'error.shareInvalid.title': '输入无效',
  'error.shareInvalid.detail':
    '分享链接包含不支持的平台或 channel。请重新选择后查询。',

  'error.unexpected.title': '发生了未预期的错误',
  'error.unexpected.detail':
    '请刷新页面后重试。若问题持续存在，请在 GitHub 提交问题。',
  'error.invalidInput.title': '输入无效',
  'error.invalidInput.detail':
    '请输入完整的 publisher.extension 或官方 Marketplace URL，并填写完整 VS Code 版本号。',
  'error.notFound.title': '没有找到这个扩展',
  'error.notFound.detail':
    '请检查 publisher 和 extension 名称是否准确。第一版不支持关键词搜索。',
  'error.noCompatible.title': '没有兼容版本',
  'error.noCompatible.detail':
    'Marketplace 历史版本中没有同时匹配当前 VS Code、平台和 channel 的版本。',
  'error.unsafeUrl.title': '下载地址未通过安全校验',
  'error.unsafeUrl.detail':
    'Marketplace 返回了 allowlist 之外的资源地址，因此页面已阻止使用该链接。',
  'error.rateLimited.title': 'Marketplace 请求过于频繁',
  'error.rateLimited.detail': 'Microsoft Marketplace 返回了 429。请稍后重试。',
  'error.manifest.title': 'Manifest fallback 失败',
  'error.manifest.detail':
    'Marketplace metadata 缺少 engine，浏览器读取官方 manifest 时失败。请稍后重试。',
  'error.upstreamInvalid.title': 'Marketplace 响应格式异常',
  'error.upstreamInvalid.detail':
    '上游数据未通过 schema 或响应大小校验。页面没有使用原始 payload。',
  'error.upstreamUnavailable.title': '无法连接 Marketplace',
  'error.upstreamUnavailable.detail':
    '请求超时或网络异常。请确认当前网络可以访问 Visual Studio Marketplace。',
  'error.queryFailed.title': '查询失败',
  'error.queryFailed.detail': '页面无法完成这次解析，请稍后重试。',
} as const;

export type MessageKey = keyof typeof zh;
