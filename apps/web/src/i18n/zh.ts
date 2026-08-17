// 中文字典：作为键集合的类型基准。
// MessageKey 由 `keyof typeof zh` 推导，en.ts 用 `satisfies Record<MessageKey, string>`
// 保证两种语言键完整、类型安全（漏译会编译报错）。
// 键按命名空间用点号分组（form.* / result.* / error.* …）。
export const zh = {
  brand: 'VSIX Scout',

  'nav.about': 'About',
  'nav.langToggle': '切换语言',
  'nav.langSwitchTo': 'Switch to English',

  'hero.lead': '帮你找到适合当前 Visual Studio Code 的官方 VSIX 包',
  'hero.support': '直接查询 Marketplace，在浏览器内找到匹配的官方 VSIX 版本。',

  'section.queryTitle': '查找兼容的插件',
  'section.queryDescription':
    '输入扩展信息和目标环境，找到与你的 Visual Studio Code 版本匹配的官方 VSIX 版本。',
  'section.resultTitle': '推荐结果',

  'form.extensionLabel': 'Extension ID 或 Marketplace URL',
  'form.extensionPlaceholder': 'ms-python.python',
  'form.vscodeLabel': 'Visual Studio Code 完整版本号',
  'form.vscodePlaceholder': '1.95.0',
  'form.platformLabel': '目标平台',
  'form.channelLegend': 'Channel',
  'form.resolve': '开始查找',
  'form.resolving': '查找中...',
  'form.note':
    '只查询，不下载。最近使用的 Visual Studio Code 版本和平台仅保存在本机。',
  'form.requiredExtension': '请输入扩展 ID 或 Marketplace URL。',
  'form.requiredVersion': '请输入完整的 Visual Studio Code 版本号。',

  'reason.channelMatch': '版本属于请求的 {channel} channel。',
  'reason.engineCompatible':
    'Visual Studio Code {vscode} 满足 engines.vscode {engine}。',
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
  'result.download': 'Download official VSIX',
  'result.copyMarketplace': '复制 Marketplace 链接',
  'result.copyMarketplaceLabel': 'Marketplace 链接',
  'result.copyCdn': '复制 CDN 链接',
  'result.copyCdnLabel': 'CDN 链接',
  'result.hashLabel': 'Marketplace reported SHA-256',
  'result.hashNote': 'Marketplace metadata 报告值，浏览器未验证下载文件。',
  'result.copySha': '复制 SHA-256',

  'versions.summary': '查看其他兼容版本',
  'versions.none': '没有其他版本同时满足当前条件。',
  'versions.showMore': '显示更多',
  'versions.loadingMore': '正在查询更早版本',
  'versions.officialVsix': '官方 VSIX ↗',

  'suggestions.title': '你是不是在找「{keyword}」？',
  'suggestions.loading': '正在搜索相近的扩展…',
  'suggestions.empty': '没有找到与「{keyword}」相近的扩展。',
  'suggestions.installs': '{count} 次安装',
  'suggestions.use': '使用此扩展',

  'footer.line1':
    'VSIX Scout 根据 Marketplace 的 engines.vscode、channel 和平台信息选择兼容版本。',
  'footer.line2': '不代理、不缓存、不执行 VSIX。下载直接来自 Microsoft。',

  'about.title': '关于 VSIX Scout',
  'about.lead':
    '一个在浏览器里就能找到匹配 Visual Studio Code 版本的官方 VSIX 包的小工具。',
  'about.back': '返回查询页',

  'about.background.title': '背景',
  'about.background.body':
    '在内网或离线环境里无法访问官方 Marketplace，只能手动下载 VSIX 离线安装；但要对照 engines.vscode、平台和渠道找到匹配自己 Visual Studio Code 的那个版本，很容易选错。VSIX Scout 在浏览器里完成这一步，直接告诉你该下载哪个版本。',

  'about.forWhom.title': '适合谁',
  'about.forWhom.1': '内网或离线开发环境、无法访问官方 Marketplace 的开发者。',
  'about.forWhom.2':
    '需要固定扩展版本、配合特定 Visual Studio Code 版本做统一镜像或部署的团队。',
  'about.forWhom.3':
    '想在下载之前确认扩展与 Visual Studio Code 是否兼容的普通用户。',

  'about.how.title': '它做了什么',
  'about.how.1':
    '在浏览器中直接查询 Microsoft Marketplace 元数据，不经过任何中间服务器。',
  'about.how.2':
    '综合 engines.vscode、目标平台和发布渠道，从历史版本中选出兼容的官方 VSIX。',
  'about.how.3':
    '给出推荐版本、选择原因和官方下载链接；下载直接来自 Microsoft，本工具不代理、不缓存、也不执行 VSIX。',

  'about.privacy.title': '隐私',
  'about.privacy':
    '除查询 Marketplace 所必需的网络请求外，不向任何第三方发送数据。最近使用的版本和平台仅保存在你的浏览器本地。',

  'error.shareInvalid.title': '输入无效',
  'error.shareInvalid.detail':
    '分享链接包含不支持的平台或 channel。请重新选择后查询。',

  'error.unexpected.title': '发生了未预期的错误',
  'error.unexpected.detail':
    '请刷新页面后重试。若问题持续存在，请在 GitHub 提交问题。',
  'error.invalidInput.title': '输入无效',
  'error.invalidInput.detail':
    '请输入完整的 publisher.extension 或官方 Marketplace URL，并填写完整 Visual Studio Code 版本号。若输入的是关键词，请从下方推荐中选择。',
  'error.notFound.title': '没有找到这个扩展',
  'error.notFound.detail':
    '请检查 publisher 和 extension 名称是否准确，或从下方「你是不是在找」中选择。',
  'error.noCompatible.title': '没有兼容版本',
  'error.noCompatible.detail':
    'Marketplace 历史版本中没有同时匹配当前 Visual Studio Code、平台和 channel 的版本。',
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
