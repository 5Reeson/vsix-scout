# VSIX Scout 项目定义与开发记录

> **项目状态：** `v0.1.0` 已正式发布；Phase 5 纯静态 Web UI MVP 已完成本地验收，待 GitHub Pages 生产部署
>
> **仓库：** `vsix-scout`
>
> **CLI 命令：** `vsix-scout`
>
> **最后更新：** 2026-08-12
>
> **文档性质：** 本文件是项目定义、范围、阶段计划与关键决策的唯一初始基线；实施过程中持续更新。

## 1. 项目定义

**一句话定义：** 输入 VS Code 版本、目标平台和 Extension ID，找出并下载最新且兼容的官方 VSIX。

**英文 tagline：** Find the right extension version for your VS Code.

VSIX Scout 是一个面向离线、内网和受控开发环境的开源工具。它查询 Visual Studio Marketplace 的历史扩展元数据，按照 VS Code engine、发布渠道和目标平台进行可解释的兼容性解析，并输出可审计的官方 VSIX 下载信息。

它的核心价值不是“拼接下载链接”，而是回答并证明以下问题：

> 对指定 VS Code 版本和运行平台，某个扩展最新的兼容版本是哪一个，为什么选择它，文件来自哪里，下载后如何验证？

## 2. 背景与问题

公司内网通常固定使用较旧版本的 VS Code，并且不能直接访问 Extension Marketplace。扩展需要在外网环境下载，通过企业审批或文件传输流程进入内网，再手动安装。

当前最直接的实际流程是：每位开发者在可访问公网的 OA 电脑上查找自己需要的扩展，手工判断与内网 VS Code 版本和平台兼容的扩展版本，下载 VSIX 后再通过 SFTP 传入开发环境安装。公司的基础设施和扩展需求较分散，现阶段不适合先以统一 lockfile、集中审批或批量资产管理作为主要产品入口；一个无需安装 CLI、可从 OA 电脑或手机访问的查询页面更能立即降低使用门槛。

现有流程存在以下困难：

- Marketplace 页面不适合检索完整历史版本。
- 扩展的最新版本经常要求更高版本的 VS Code。
- Release notes、扩展版本和 `engines.vscode` 并不总是一一对应。
- 同一扩展版本可能发布多个平台包，也可能仅提供 universal 包。
- Stable、pre-release、extension dependencies 和 extension packs 增加了选择复杂度。
- 即使通过 `@vscode/vsce show` 找到版本，仍需人工解析属性、定位资源并验证下载文件。
- 人工过程难以复现、复核和纳入企业审批。

VSIX Scout 将这一过程压缩为一次明确、可复现、可验证的解析和下载操作。

## 3. 目标用户与核心场景

### 3.1 目标用户

- 在隔离网络或 air-gapped 环境中工作的开发者。
- 维护固定 VS Code 基线的企业 IT、开发平台和安全团队。
- 需要为多台设备准备一致扩展集的工具链维护者。
- 需要为扩展下载保留来源、版本和哈希记录的审批人员。

### 3.2 核心用户故事

1. 作为开发者，我可以输入扩展 ID、VS Code 版本和平台，获得最新兼容版本及选择原因。
2. 作为没有安装 CLI 的用户，我可以在公网浏览器中完成同样的兼容版本查询，并从微软官方地址下载 VSIX。
3. 作为工具链维护者，我可以查看历史版本的兼容性，或固定选择某个确切版本。
4. 作为安全审批人员，我可以获得官方来源 URL、SHA-256 和结构化 JSON，而不必执行扩展。
5. 作为环境管理员，我可以为一组扩展生成可复现的 lockfile，供审批和离线导入使用。

## 4. 产品原则

1. **正确优先于“最新”：** 只有满足 engine、channel 和 platform 条件的版本才可入选。
2. **解释优先于黑盒结果：** 每次解析都应给出入选条件、fallback 和未命中原因。
3. **官方来源优先：** 使用 Marketplace 元数据提供的资源；经过测试的 URL 模板仅作为 fallback。
4. **安全是产品能力：** 校验输入和跳转、限制下载、原子落盘、计算哈希，且永不执行 VSIX。
5. **核心与界面解耦：** resolver 是纯业务逻辑，CLI、Web 和未来 provider 都只是适配层。
6. **脚本友好且可复现：** 人类可读输出与稳定 JSON schema 同等重要。
7. **诚实表达兼容性：** `engines.vscode` 匹配是必要条件，不代表外部运行时依赖一定可用。

## 5. 范围

### 5.1 MVP 必须支持

- 接受规范的 `publisher.extension` ID 或已知 Marketplace URL。
- 接受目标 VS Code 完整版本号。
- 支持 `win32-x64`、`win32-arm64`、`linux-x64`、`linux-arm64`、`darwin-x64`、`darwin-arm64` 和 `universal`。
- 查询 Visual Studio Marketplace 的完整历史版本 metadata 和 version properties。
- 读取扩展版本、`engines.vscode`、stable/pre-release、target platform、发布时间、资源 URL、dependencies 和 extension pack members。
- 在 engine property 缺失时，从该版本 manifest 获取 `engines.vscode`。
- 使用 SemVer range 判断兼容性，而不是只比较最低版本。
- 精确平台优先，缺失时回退到 universal，绝不把其他平台包视为兼容。
- 默认选择最新兼容 stable 版本，并支持显式 pre-release 或确切版本选择。
- 展示选择依据和兼容性限制。
- 从允许的官方 Marketplace/CDN 主机下载 VSIX。
- 安全写入文件并计算 SHA-256。
- 提供稳定的 JSON 输出和有意义的退出码。

### 5.2 MVP 不做

- 不搭建、运营或公开提供第三方 VSIX 镜像。
- 不永久托管、修改、重打包或重新分发第三方 VSIX。
- 不自动安装或执行下载的扩展。
- 不绕过许可证、Marketplace 条款或产品限制。
- 不承诺 Cursor、VSCodium 或其他 VS Code forks 的兼容性。
- 不通过 changelog 或 release notes 推测兼容性。
- 不开发账号、收藏、评论、社区或复杂后台。
- 不在 resolver 稳定前投入复杂 Web UI。

### 5.3 MVP 之后

- 部署于 GitHub Pages 的纯静态 Web 查询界面。
- 多扩展 lockfile、批量安全下载与离线审批报告。
- Open VSX 或企业内部 catalog provider。
- Marketplace signature manifest 获取和签名验证。
- 扩展依赖图、extension pack 批量解析及冲突说明。
- SBOM 或静态安全检查。

## 6. CLI 产品面

计划提供以下命令：

```text
vsix-scout resolve <extension>
vsix-scout versions <extension>
vsix-scout download <extension>
vsix-scout inspect <extension>
vsix-scout lock <input-file>       # MVP 后
```

主要参数：

```text
--vscode <version>
--platform <target>
--stable
--pre-release
--version <exact-version>
--json
--output <directory>
--no-download
```

默认行为约定：

- 默认 channel 为 stable。
- `resolve` 不下载文件，只解析并展示结果。
- `download` 先执行同一套解析，再请求官方资源。
- 用户未传 `--output` 时写入当前目录；JSON 中只返回文件名或用户显式提供的路径，不泄露无关本机路径。
- 自动化场景应使用 `--json`，JSON schema 在稳定版前允许以有记录的方式演进。

## 7. 兼容性解析规范

### 7.1 解析管线

1. 规范化并验证 Extension ID 或 Marketplace URL。
2. 通过 provider 获取完整历史版本、version properties 和资源信息。
3. 将上游响应转换为内部统一模型；业务层不直接读取 Marketplace 原始字段。
4. 对缺少 engine property 的候选版本按需读取 manifest。
5. 按请求的 stable/pre-release channel 过滤。
6. 按平台过滤：精确平台优先；没有精确包时才考虑 universal。
7. 使用 SemVer 判断目标 VS Code 是否满足 `engines.vscode`。
8. 如果指定了确切扩展版本，则只在该版本的合法平台变体中选择；否则按扩展版本倒序选择最新候选。
9. 校验 VSIX asset 是否来自允许的官方主机，并生成结构化选择说明。
10. 没有候选时返回分类明确的失败原因，而不是模糊的“not found”。

### 7.2 必须定义的边界情况

- 最新扩展不兼容，但较早版本兼容。
- stable 与 pre-release 混合。
- 同一版本含多个 target platform variant。
- 精确平台缺失但 universal 存在。
- engine property 缺失、manifest 可用或同样缺失。
- caret、tilde、比较符、区间、OR 等合法 SemVer range。
- 目标 VS Code 或扩展版本不是合法 SemVer。
- 没有兼容版本、扩展下架、资源缺失或上游数据异常。
- Marketplace 超时、限流、部分响应和重试耗尽。

### 7.3 结果模型（概念）

```ts
interface ResolutionResult {
  extension: { id: string; publisher: string; name: string };
  target: {
    vscode: string;
    platform: string;
    channel: 'stable' | 'pre-release';
  };
  selected: {
    version: string;
    engine: string;
    targetPlatform: string;
    publishedAt?: string;
    assetUrl: string;
    manifestUrl?: string;
  };
  source: { provider: 'visual-studio-marketplace'; official: true };
  compatibility: {
    compatible: true;
    platformMatch: 'exact' | 'universal';
    reasons: string[];
    limitations: string[];
  };
  integrity?: { sha256: string; size: number };
}
```

解析失败使用独立的、可序列化错误模型，至少区分输入错误、扩展不存在、无兼容版本、上游不可用、上游数据无效、资源不安全和下载失败。

## 8. 技术架构

采用 Node.js 20+、TypeScript 和 pnpm workspace 的 monorepo：

```text
vsix-scout/
├── apps/
│   ├── cli/
│   └── web/                 # Phase 5 纯静态 Web UI
├── packages/
│   ├── core/
│   ├── marketplace/
│   └── shared/
├── tests/
│   ├── fixtures/
│   ├── unit/
│   └── integration/
├── docs/
├── PROJECT.md
├── README.md
├── LICENSE
└── package.json
```

### 8.1 包职责

**`packages/core`**

- 纯业务模型和 resolver。
- SemVer、channel、platform 过滤和排序。
- 兼容性说明与领域错误。
- 不依赖 CLI、Web 或 Marketplace 的具体响应格式。

**`packages/marketplace`**

- 实现 provider interface。
- 输入解析、API 请求、schema validation 和 metadata normalization。
- manifest fallback、asset URL 解析、超时、重试和短期缓存。
- 隔离所有非公开或可能变化的 Marketplace 字段。

**`packages/shared`**

- 跨应用使用的稳定 schema、常量和安全工具。
- 不成为无边界的通用工具集合。

**`apps/cli`**

- 命令和参数解析、人类可读输出、JSON 输出、退出码。
- 安全下载、临时文件、原子 rename、大小限制和 SHA-256。

**`apps/web`**

- 提供轻量查询表单、兼容版本结果和官方 VSIX 下载链接。
- 浏览器直接请求 Visual Studio Marketplace，并在客户端复用现有 provider normalization 与 core resolver。
- 作为纯静态站点部署到 GitHub Pages；不引入 Worker、Serverless API、SSR、数据库或下载代理。
- 不读取、缓存、托管或重新分发 VSIX；用户点击后直接访问经过 allowlist 校验的微软官方资源。

### 8.2 建议依赖

- `semver`：SemVer range 解析和匹配。
- `zod`：上游响应与 CLI/JSON schema 的运行时验证。
- `commander` 或 `citty`：CLI 命令层，在脚手架阶段用小型原型决定。
- `vitest`：单元测试、fixture 测试和集成测试。
- Phase 5 Web 默认采用 React、Vite 和 TypeScript；最终依赖选择以保持轻量、可访问和 GitHub Pages 子路径兼容为准。

## 9. 安全、隐私与合规边界

- 只接受规范 ID 或已识别的 Marketplace URL，不请求用户提供的任意 URL。
- Marketplace/CDN host 使用显式 allowlist；每次 redirect 后重新校验协议与主机。
- 仅允许 HTTPS，限制 redirect 次数、响应时间和最大下载大小。
- 下载写入同目录临时文件，成功校验后原子 rename；失败清理临时文件。
- 不解压、不安装、不加载、不执行 VSIX 中的代码。
- 输出 publisher、extension ID、版本、来源、文件大小和 SHA-256。
- 日志与 JSON 不包含令牌、无关请求头或无关的绝对本机路径。
- 网站默认不保存搜索历史，不托管 VSIX，下载优先跳转到官方资源。
- 文档明确提醒用户遵守 Marketplace 条款、扩展许可证和企业安全政策。
- 正式公开发布前复核当时有效的 Marketplace Terms of Use；本项目文档不构成法律意见。

## 10. 质量标准与 MVP 验收

MVP 可发布需要同时满足：

- 三个代表性扩展可以从真实 Marketplace 数据中正确解析历史兼容版本。
- fixture 覆盖第 7.2 节全部边界情况，核心 resolver 的分支有充分测试。
- `resolve`、`versions`、`inspect`、`download` 和 `--json` 行为有 CLI 集成测试。
- 下载只能访问 allowlist 主机，redirect、超时、超限和中断下载均有测试。
- 同一输入和同一份上游 metadata 产生确定性一致的选择结果。
- 成功下载的文件 SHA-256 可由系统工具复核。
- 无兼容版本和上游异常均提供可操作的错误说明及非零退出码。
- README 包含安装、示例、安全边界、数据来源与许可证说明。
- 在 Linux、macOS、Windows 的当前 Node.js LTS 环境通过 CI。

建议的成功指标：

- 对测试 fixture 的版本选择正确率为 100%。
- 在正常网络下，已有 metadata 的单扩展解析可在数秒内完成。
- 用户从输入到获得带 SHA-256 的文件只需一条命令。
- JSON 输出足以支持审批脚本，无需再解析终端表格文本。

## 11. 开发阶段

### Phase 0 — 事实验证与工程基线

**状态：** 已于 2026-08-10 完成。

**目标：** 在写完整产品代码前，验证 Marketplace 数据是否足够支持设计。

**工作：**

- 建立 pnpm/TypeScript/Vitest monorepo、lint、format、CI 和开源许可证。
- 用少量真实扩展验证 Marketplace 请求、历史 properties、manifest 与 asset URL。
- 保存去敏 fixture，记录实际字段差异和异常样本。
- 确定 provider interface、内部模型、JSON 错误模型和 host allowlist。
- 形成一份最小协议说明，避免后续逻辑散落在网络请求中。

**退出条件：** 至少覆盖普通 universal、多平台、pre-release 和 engine fallback 四类真实样本，且能够稳定归一化为内部模型。

### Phase 1 — 纯核心 Resolver

**状态：** 已于 2026-08-10 完成。

**目标：** 在不依赖网络和 UI 的情况下正确完成版本选择。

**工作：**

- 实现领域模型、SemVer engine 匹配、channel 过滤、平台精确匹配与 universal fallback。
- 实现扩展版本排序、确切版本选择、结构化解释和领域错误。
- 用 fixture 和表驱动测试覆盖所有边界情况。

**退出条件：** 给定归一化 metadata，resolver 对全部规定场景产生确定、可解释、测试通过的结果。

### Phase 2 — Marketplace Provider

**状态：** 已于 2026-08-10 完成。

**目标：** 将真实 Marketplace 数据可靠、安全地接入 resolver。

**工作：**

- 实现 Extension ID/URL 规范化、API 请求、Zod 校验和 metadata normalization。
- 实现按需 manifest fallback、资源 URL 提取、超时、有限重试和限流错误。
- 隔离原始 API 类型，记录上游 schema 漂移。
- 增加使用真实服务的可选集成测试，默认测试继续依赖 fixture。

**退出条件：** 三个代表性扩展能够端到端解析，网络与数据错误可以被准确分类。

### Phase 3 — CLI MVP 与安全下载

**状态：** 已于 2026-08-10 完成。

**目标：** 交付可实际使用的本地 CLI。

**工作：**

- 实现 `resolve`、`versions`、`inspect`、`download` 和通用参数。
- 实现表格/文本输出、版本化 JSON schema 和稳定退出码。
- 实现 host/redirect 校验、大小限制、临时文件、原子 rename、清理与 SHA-256。
- 编写 README、安装说明、shell 示例和离线操作流程。

**退出条件：** 用户可用一条命令下载经解析的官方 VSIX，并获得可复核哈希；满足第 10 节 MVP 验收标准。

### Phase 4 — 硬化与首个开源版本

**状态：** 已于 2026-08-11 完成，`v0.1.0`、npm 包和 GitHub Release 均已正式发布。

**目标：** 将“能用”提升为可维护、可公开发布。

**工作：**

- 增加 Windows/macOS/Linux CI、打包、版本管理和发布流程。
- 完成威胁建模、依赖审计、日志脱敏、故障注入和文档复核。
- 验证更多热门扩展和异常扩展，建立回归 fixture。
- 增加贡献指南、行为准则、问题模板和安全披露方式。
- 发布 `0.1.0`，JSON schema 在 `1.0.0` 前明确标记兼容策略。

**退出条件：** 可从干净环境安装，发布物可验证，已知限制公开且关键故障均有回归测试。

### Phase 5 — 纯静态 Web UI MVP

**状态：** 工程实现与本地验收已于 2026-08-12 完成；待维护者启用 GitHub Pages Actions source 并确认生产部署。目标版本为 `v0.2.0`。

**目标：** 将 CLI 已验证的单扩展兼容性解析能力提供给无需安装本地工具的用户，直接改善 OA 电脑查询、官方下载、SFTP 转移和内网安装流程。

**确定的用户流程：**

1. 用户输入规范的 `publisher.extension` ID 或 Marketplace URL。
2. 用户输入目标 VS Code 完整版本，选择平台和 stable/pre-release channel。
3. 浏览器直接调用 Visual Studio Marketplace `extensionquery`，按需直接读取官方 manifest。
4. Web 复用现有 normalization、SemVer、channel、platform、universal fallback、排序和选择解释逻辑。
5. 页面展示最新兼容版本、engine、平台匹配、选择原因和其他兼容版本。
6. 页面提供 Marketplace metadata 返回并经过 allowlist 校验的官方 VSIX URL；用户点击后直接访问微软网站/CDN 下载。

**已确认的架构边界：**

- 仅构建纯静态前端并部署到 GitHub Pages，首个地址按项目站点 `/vsix-scout/` 子路径设计。
- 浏览器直接请求 Marketplace；不引入 Cloudflare Workers、Pages Functions、Serverless API、自建后端、SSR 或数据库。
- 不为当前可接受的 CORS、schema 漂移、上游大响应、重试、缓存和限流风险预先增加代理层。
- 2026-08-12 已实测 Marketplace query 的 CORS preflight 和 POST 可用，manifest 与 VSIX CDN 均允许跨域访问；若实现时事实变化，应停止并汇报，而不是自行扩展架构。
- 不实现关键词搜索；第一版只接受精确 Extension ID 或已知 Marketplace URL。
- 不通过固定模板凭空构造下载目标；优先使用 Marketplace 返回的 `Microsoft.VisualStudio.Services.VSIXPackage` URL，现有受测 fallback 仅在既定 provider 策略中使用。
- 不使用 `fetch`、Blob 或 ArrayBuffer 下载 VSIX，不在浏览器中计算整个文件的 SHA-256，不代理、缓存或托管 VSIX。
- 可以展示 Marketplace 提供的 SHA-256，但必须标记为上游报告值，不能声称 Web 已验证实际下载文件；完整下载校验仍由 CLI 提供。
- Marketplace 数据是外部 trust boundary：复用 Zod schema、normalization、SemVer 解析和 URL allowlist 即可，不增加第二数据源；扩展名称等内容只按文本渲染，不执行上游 HTML。
- Web 与 CLI 必须对同一 fixture 产生一致的解析结果，不能复制或分叉 resolver 规则。

**工作：**

- 在 `apps/web` 建立 React、Vite、TypeScript 应用，并保证 GitHub Pages `/vsix-scout/` 子路径正确。
- 使 Marketplace Provider 的共享逻辑兼容浏览器，隔离 `User-Agent`、redirect 等 Node/浏览器差异，同时保持 CLI 行为不变。
- 实现输入表单、加载/错误状态、推荐结果、选择解释、兼容版本列表和官方 VSIX 链接。
- 支持复制下载 URL 和 Marketplace reported SHA-256；使用 URL 查询参数分享查询，可选用 `localStorage` 保存本机默认 VS Code 版本和平台。
- 提供响应式布局、键盘操作、表单 label、focus、错误关联和基础颜色对比。
- 增加共享 fixture 一致性测试、Web 单元/组件测试、production build 验证和至少一个真实浏览器端到端 Marketplace 查询。
- 增加 GitHub Pages Actions workflow；本地实现和验证完成后再由维护者确认生产部署设置。

**明确不做：**

- Worker、后端 API、数据库、账号、服务端历史、VSIX 文件处理、批量下载、lockfile、审批、Open VSX、企业 catalog、插件推荐和目录浏览。

**退出条件：** 用户可在 GitHub Pages 上完成与 CLI `resolve` 等价的单扩展查询，看到可解释结果，并通过允许的微软官方 URL 下载正确平台和版本的 VSIX；现有 CLI、CI 和打包流程保持通过。

**实现与本地验收结果：**

- 已建立 `apps/web` React/Vite/TypeScript 静态应用，production assets 使用 `/vsix-scout/` base。
- 已提供 Node/browser Marketplace request adapter；共享 provider 继续负责 timeout、重试、流式大小限制、schema、normalization、manifest fallback 和缓存。
- 已实现全部 MVP 输入、结果、复制、其他兼容版本、URL 参数、本机偏好、加载和分类错误状态；外部内容只按文本渲染。
- Web 下载仅渲染通过 allowlist 的 metadata URL；真实浏览器请求记录确认页面未 fetch VSIX。
- fixture parity 覆盖 stable、pre-release、精确平台和 universal fallback；`pnpm check` 共 106 个测试通过。
- `pnpm release:check`、Web production build、CLI release bundle/package/clean install 均通过。
- Chromium production preview 已直连真实 Marketplace：`esbenp.prettier-vscode`、VS Code `1.101.0`、`darwin-arm64`、stable 解析为 `12.4.0` universal，并生成允许的 `esbenp.gallerycdn.vsassets.io` 官方 URL。
- 手机视口无水平溢出，light/dark 均完成视觉检查；Lighthouse 为 Performance 99、Accessibility 100、Best Practices 96、SEO 100。

### Phase 6 — Lockfile 与企业工作流

**目标：** 在出现多人、多机器、CI、合规审查或统一离线环境需求时，支持多扩展审批和可复现交付。

**工作：**

- 实现 `vsix-scout lock`、lockfile schema、批量解析和部分失败报告。
- 记录每个扩展的版本、engine、平台、来源、SHA-256 和生成上下文。
- 设计 lockfile 校验、更新 diff、批量安全下载和审批记录。
- 评估签名验证和审批报告格式。

**退出条件：** 同一 lockfile 能够校验并重建一致的扩展文件集合，差异可审计。

### Phase 7 — Provider 扩展

**目标：** 在 Marketplace、CLI 和 Web 边界稳定后，按真实需求增加其他数据源。

**工作：**

- 评估并实现 Open VSX 和企业 catalog provider。
- 保持 provider 只负责上游协议与 normalization，所有兼容性判断继续复用 core resolver。
- 按需求增加依赖图、extension pack、GitHub Releases 或签名验证等能力。

**退出条件：** 新 provider 不复制兼容逻辑，输出统一内部模型，并且不削弱现有来源和 URL 安全边界。

## 12. 风险与应对

| 风险                             | 影响                           | 应对                                                   |
| -------------------------------- | ------------------------------ | ------------------------------------------------------ |
| Marketplace API 非正式或字段变化 | 解析中断或误选                 | provider 隔离、运行时校验、fixtures、schema 漂移错误   |
| engine metadata 缺失或不准确     | 无法判定或理论兼容但实际不可用 | manifest fallback；明确“声明兼容”的局限                |
| 平台变体与版本排序复杂           | 下载错误包                     | 以版本变体为候选实体；精确平台优先并充分测试           |
| URL/redirect 被滥用              | SSRF 或下载非官方内容          | 输入收敛、HTTPS、逐跳 allowlist、大小与超时限制        |
| 上游限流或网络不稳               | CLI 体验不稳定                 | 有限重试、超时、短期 metadata cache、可诊断错误        |
| Marketplace/扩展许可证限制       | 发布或使用风险                 | 不镜像、不重分发；公开发布前复核条款并明确定位         |
| 浏览器直连 Marketplace 发生变化  | Web 查询失效                   | 共享 schema/fixtures；明确错误；事实变化时再评估代理层 |
| Web 与 CLI 解析逻辑分叉          | 相同输入产生不同版本           | 共享 provider normalization、core resolver 和 fixtures |

## 13. 待验证问题

以下问题不阻塞项目启动，但必须在对应阶段得到答案并记录：

- Marketplace 历史版本查询的分页、数量上限和限流行为是什么？
- stable/pre-release 在所有历史数据中是否有一致、可靠的标记？
- 同一语义版本的平台变体发布时间或资源字段不一致时如何排序和展示？
- 哪些 Microsoft/CDN 主机必须加入最小 allowlist，资源 redirect 的真实链路是什么？
- manifest fallback 的内容类型、压缩形式、大小和失败模式是什么？
- 扩展版本是否总是标准 SemVer；遇到非标准但上游合法的版本应采用何种明确策略？
- Marketplace 是否提供可依赖的 checksum、signature 或 asset size，如何与本地 SHA-256 协同？
- npm 全局安装、独立二进制或两者并行，哪一种最符合目标用户的隔离环境？

## 14. 决策记录

关键决策在此追加，避免只存在于聊天或提交信息中。

| 日期       | 决策                                                     | 理由                                                           | 状态   |
| ---------- | -------------------------------------------------------- | -------------------------------------------------------------- | ------ |
| 2026-08-10 | 项目命名为 VSIX Scout，CLI 为 `vsix-scout`               | 名称直接表达“寻找正确 VSIX”的用途                              | 已接受 |
| 2026-08-10 | MVP 只支持 Visual Studio Marketplace                     | 收敛协议、测试和合规范围                                       | 已接受 |
| 2026-08-10 | TypeScript monorepo，Node.js 20+，pnpm workspace         | 共享 core/provider/schema，同时隔离 CLI 与未来 Web             | 已接受 |
| 2026-08-10 | 先 core/provider/CLI，后 Web                             | 兼容性正确性和脚本能力是首要价值                               | 已接受 |
| 2026-08-10 | 默认选择 stable，pre-release 必须显式请求                | 默认行为更适合企业稳定环境                                     | 已接受 |
| 2026-08-10 | 精确平台优先，缺失时才使用 universal                     | 防止误选其他平台包，同时保留官方通用包 fallback                | 已接受 |
| 2026-08-10 | 只从官方 allowlist 来源下载，不托管 VSIX                 | 维持来源可信度并降低供应链与合规风险                           | 已接受 |
| 2026-08-10 | Phase 0 先进行真实数据探针                               | Marketplace 字段和边界需要证据验证，不能仅按理想模型实现       | 已接受 |
| 2026-08-10 | Provider 接受上游额外平台值，CLI 单独限制用户目标        | 实际数据还包含 alpine、web 和 linux-armhf 等平台               | 已接受 |
| 2026-08-10 | 资源模型同时保留 primary 和 fallback URL                 | 已确认部分历史 CDN asset 失效，但官方 fallback 仍可用          | 已接受 |
| 2026-08-10 | 固定 pnpm 10.34.5 并使用 Node 20 类型定义                | 保留 Node.js 20 运行时支持，同时在编译期约束 API 使用          | 已接受 |
| 2026-08-10 | pre-release 请求采用严格渠道匹配                         | 避免用户明确请求预发布时静默回退到 stable                      | 已接受 |
| 2026-08-10 | 平台精确匹配只在同一扩展版本内优先                       | 保持“最新兼容版本”语义，较新 universal 优于较旧精确包          | 已接受 |
| 2026-08-10 | engine 缺失或 range 非法时 fail closed                   | 没有可靠证据时不得推断兼容                                     | 已接受 |
| 2026-08-10 | Provider 仅缓存成功结果，默认 TTL 为五分钟               | 减少重复大响应，同时避免暂时性错误被持久化                     | 已接受 |
| 2026-08-10 | manifest 仅在 Engine property 缺失时按需读取             | 保持协议正确性并控制历史版本的额外网络请求                     | 已接受 |
| 2026-08-10 | Provider 禁止自动 redirect                               | 防止上游响应静默绕过官方资源 host 边界                         | 已接受 |
| 2026-08-10 | CLI 使用 Node.js `parseArgs`，不增加命令解析依赖         | Node 20 原生能力足够覆盖 MVP，减少运行时依赖面                 | 已接受 |
| 2026-08-10 | 下载默认拒绝覆盖，限制为 512 MiB、120 秒、5 次跳转       | 安全默认值并覆盖常见大型扩展                                   | 已接受 |
| 2026-08-10 | 下载文件通过同目录临时文件和原子 no-clobber 发布         | 保证完整文件才可见，并消除覆盖竞态                             | 已接受 |
| 2026-08-10 | CLI JSON 输出 schemaVersion 固定为 1                     | 为审批脚本提供明确兼容边界                                     | 已接受 |
| 2026-08-10 | 对外只发布单一 `vsix-scout` npm CLI 包                   | monorepo 保留内部边界，用户无需安装 private workspace 包       | 已接受 |
| 2026-08-10 | 0.1.0 发布包将内部模块和运行时依赖打入单文件             | 保持 Node 20 支持并实现干净环境、零运行时依赖安装              | 已接受 |
| 2026-08-10 | CI 覆盖三系统和 Node 20/22/24，Actions 固定 commit       | 验证跨平台兼容性并降低 CI 供应链漂移                           | 已接受 |
| 2026-08-10 | Marketplace 提供 SHA-256 时下载必须匹配                  | 在本地哈希可审计基础上增加上游完整性约束                       | 已接受 |
| 2026-08-11 | `v0.1.0` 使用 annotated tag 触发自动发布                 | 发布流程验证 tag、构建产物、SHA-256、npm provenance 和 Release | 已完成 |
| 2026-08-12 | Phase 5 调整为纯静态 Web UI，企业 lockfile 顺延          | 当前首要需求是让分散用户在 OA 电脑或手机自助查询               | 已接受 |
| 2026-08-12 | Web 首版只部署 GitHub Pages 并由浏览器直连 Marketplace   | 当前 CORS 已实测可用，无需维护服务端或数据库                   | 已接受 |
| 2026-08-12 | Web 下载直接使用经 allowlist 校验的微软官方 URL          | 不承担 VSIX 存储、代理、内存处理和重新分发                     | 已接受 |
| 2026-08-12 | Web 不声称验证下载文件，只标示 Marketplace reported hash | 浏览器不读取完整 VSIX；完整流式校验继续由 CLI 负责             | 已接受 |
| 2026-08-12 | Open VSX 和企业 catalog 拆分为 Phase 7                   | 避免在 Web MVP 中混入暂时没有真实需求的 Provider 扩展          | 已接受 |
| 2026-08-12 | Marketplace Provider 使用 Node/browser request adapter   | 只隔离 User-Agent、redirect 和 fetch receiver 差异，不复制规则 | 已接受 |

## 15. 变更记录

| 日期       | 变更                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-10 | 根据原始项目交接材料创建项目定义基线，补充目标用户、产品原则、结果模型、验收标准、风险、待验证问题和七阶段路线图。            |
| 2026-08-10 | 完成 Phase 0：建立工程基线、协议探针、内部模型、四类真实 fixtures、CI、安全 URL 策略和自动化验证。                            |
| 2026-08-10 | 将工具链调整为 pnpm 10.34.5 和 Node 20 类型定义，修复 Node 20 CI 环境兼容性。                                                 |
| 2026-08-10 | 完成 Phase 1：实现纯 resolver、SemVer range、渠道/平台策略、确定性排序、确切版本、结构化解释和失败诊断。                      |
| 2026-08-10 | 完成 Phase 2：实现真实 Marketplace Provider、输入规范化、schema 校验、manifest fallback、网络策略和可选 live test。           |
| 2026-08-10 | 完成 Phase 3：交付四个 CLI 命令、安全下载、流式 SHA-256、版本化 JSON、稳定退出码和端到端真实 VSIX 验证。                      |
| 2026-08-10 | 完成 Phase 4 工程实现：跨平台 CI、安全复核、下载完整性、开源治理文件、可复现 npm 打包与 tag 发布流程；正式发布待确认。        |
| 2026-08-11 | 完成首个公开版本：`v0.1.0` Release Workflow、GitHub Release、npm publish、provenance 和发布资产均验证成功。                   |
| 2026-08-12 | 根据实际 OA/内网工作流调整路线：Phase 5 改为 GitHub Pages 纯静态 Web UI，lockfile 顺延至 Phase 6，Provider 扩展拆为 Phase 7。 |
| 2026-08-12 | 记录 Web MVP 的浏览器直连 Marketplace、官方 URL 跳转、无后端/数据库/VSIX 代理、共享 resolver 与下载校验边界。                 |
| 2026-08-12 | 完成 Phase 5 工程实现和本地验收：Web UI、browser adapter、fixture parity、Pages workflow、真实 Chromium 查询和安全审计通过。  |
