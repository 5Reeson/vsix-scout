# VSIX Scout 项目定义与开发记录

> **项目状态：** Phase 0 已完成，Phase 1 待开始
>
> **仓库：** `vsix-scout`
>
> **CLI 命令：** `vsix-scout`
>
> **最后更新：** 2026-08-10
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
2. 作为工具链维护者，我可以查看历史版本的兼容性，或固定选择某个确切版本。
3. 作为安全审批人员，我可以获得官方来源 URL、SHA-256 和结构化 JSON，而不必执行扩展。
4. 作为环境管理员，我可以为一组扩展生成可复现的 lockfile，供审批和离线导入使用。

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

- 多扩展 lockfile 与离线审批报告。
- Open VSX、GitHub Releases 或企业内部 catalog provider。
- Marketplace signature manifest 获取和签名验证。
- 扩展依赖图、extension pack 批量解析及冲突说明。
- SBOM 或静态安全检查。
- 轻量 Web 查询界面。

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
│   └── web/                 # 后续阶段
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

- 在核心稳定后提供轻量搜索表单和结果页。
- 服务端调用 resolver；不代理或长期缓存 VSIX 文件。

### 8.2 建议依赖

- `semver`：SemVer range 解析和匹配。
- `zod`：上游响应与 CLI/JSON schema 的运行时验证。
- `commander` 或 `citty`：CLI 命令层，在脚手架阶段用小型原型决定。
- `vitest`：单元测试、fixture 测试和集成测试。
- Web 框架延后选择，避免早期架构被 UI 需求主导。

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

**目标：** 在不依赖网络和 UI 的情况下正确完成版本选择。

**工作：**

- 实现领域模型、SemVer engine 匹配、channel 过滤、平台精确匹配与 universal fallback。
- 实现扩展版本排序、确切版本选择、结构化解释和领域错误。
- 用 fixture 和表驱动测试覆盖所有边界情况。

**退出条件：** 给定归一化 metadata，resolver 对全部规定场景产生确定、可解释、测试通过的结果。

### Phase 2 — Marketplace Provider

**目标：** 将真实 Marketplace 数据可靠、安全地接入 resolver。

**工作：**

- 实现 Extension ID/URL 规范化、API 请求、Zod 校验和 metadata normalization。
- 实现按需 manifest fallback、资源 URL 提取、超时、有限重试和限流错误。
- 隔离原始 API 类型，记录上游 schema 漂移。
- 增加使用真实服务的可选集成测试，默认测试继续依赖 fixture。

**退出条件：** 三个代表性扩展能够端到端解析，网络与数据错误可以被准确分类。

### Phase 3 — CLI MVP 与安全下载

**目标：** 交付可实际使用的本地 CLI。

**工作：**

- 实现 `resolve`、`versions`、`inspect`、`download` 和通用参数。
- 实现表格/文本输出、版本化 JSON schema 和稳定退出码。
- 实现 host/redirect 校验、大小限制、临时文件、原子 rename、清理与 SHA-256。
- 编写 README、安装说明、shell 示例和离线操作流程。

**退出条件：** 用户可用一条命令下载经解析的官方 VSIX，并获得可复核哈希；满足第 10 节 MVP 验收标准。

### Phase 4 — 硬化与首个开源版本

**目标：** 将“能用”提升为可维护、可公开发布。

**工作：**

- 增加 Windows/macOS/Linux CI、打包、版本管理和发布流程。
- 完成威胁建模、依赖审计、日志脱敏、故障注入和文档复核。
- 验证更多热门扩展和异常扩展，建立回归 fixture。
- 增加贡献指南、行为准则、问题模板和安全披露方式。
- 发布 `0.1.0`，JSON schema 在 `1.0.0` 前明确标记兼容策略。

**退出条件：** 可从干净环境安装，发布物可验证，已知限制公开且关键故障均有回归测试。

### Phase 5 — Lockfile 与企业工作流

**目标：** 支持多扩展审批和可复现离线环境。

**工作：**

- 实现 `vsix-scout lock`、lockfile schema、批量解析和部分失败报告。
- 记录每个扩展的版本、engine、平台、来源、SHA-256 和生成上下文。
- 设计 lockfile 校验、更新 diff 和批量下载命令。
- 评估签名验证和审批报告格式。

**退出条件：** 同一 lockfile 能够校验并重建一致的扩展文件集合，差异可审计。

### Phase 6 — Web 与 Provider 扩展

**目标：** 在稳定核心之上扩展可访问性和数据源。

**工作：**

- 建设轻量 Web 搜索与结果页，复用同一 resolver 和 schema。
- Web 不托管 VSIX，仅展示结果并链接/重定向到已校验的官方资源。
- 按真实需求评估 Open VSX、GitHub Releases 和企业 catalog provider。
- 增加依赖图、extension pack 和签名验证等能力。

**退出条件：** 新界面和新 provider 不复制兼容逻辑，且不削弱既有安全边界。

## 12. 风险与应对

| 风险                             | 影响                           | 应对                                                 |
| -------------------------------- | ------------------------------ | ---------------------------------------------------- |
| Marketplace API 非正式或字段变化 | 解析中断或误选                 | provider 隔离、运行时校验、fixtures、schema 漂移错误 |
| engine metadata 缺失或不准确     | 无法判定或理论兼容但实际不可用 | manifest fallback；明确“声明兼容”的局限              |
| 平台变体与版本排序复杂           | 下载错误包                     | 以版本变体为候选实体；精确平台优先并充分测试         |
| URL/redirect 被滥用              | SSRF 或下载非官方内容          | 输入收敛、HTTPS、逐跳 allowlist、大小与超时限制      |
| 上游限流或网络不稳               | CLI 体验不稳定                 | 有限重试、超时、短期 metadata cache、可诊断错误      |
| Marketplace/扩展许可证限制       | 发布或使用风险                 | 不镜像、不重分发；公开发布前复核条款并明确定位       |
| 过早开发 Web                     | 核心逻辑不稳、重复实现         | Phase 1–4 只以 core/provider/CLI 为主                |

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

| 日期       | 决策                                              | 理由                                                     | 状态                   |
| ---------- | ------------------------------------------------- | -------------------------------------------------------- | ---------------------- |
| 2026-08-10 | 项目命名为 VSIX Scout，CLI 为 `vsix-scout`        | 名称直接表达“寻找正确 VSIX”的用途                        | 已接受                 |
| 2026-08-10 | MVP 只支持 Visual Studio Marketplace              | 收敛协议、测试和合规范围                                 | 已接受                 |
| 2026-08-10 | TypeScript monorepo，Node.js 20+，pnpm workspace  | 共享 core/provider/schema，同时隔离 CLI 与未来 Web       | 初始决定，Phase 0 验证 |
| 2026-08-10 | 先 core/provider/CLI，后 Web                      | 兼容性正确性和脚本能力是首要价值                         | 已接受                 |
| 2026-08-10 | 默认选择 stable，pre-release 必须显式请求         | 默认行为更适合企业稳定环境                               | 已接受                 |
| 2026-08-10 | 精确平台优先，缺失时才使用 universal              | 防止误选其他平台包，同时保留官方通用包 fallback          | 已接受                 |
| 2026-08-10 | 只从官方 allowlist 来源下载，不托管 VSIX          | 维持来源可信度并降低供应链与合规风险                     | 已接受                 |
| 2026-08-10 | Phase 0 先进行真实数据探针                        | Marketplace 字段和边界需要证据验证，不能仅按理想模型实现 | 已接受                 |
| 2026-08-10 | Provider 接受上游额外平台值，CLI 单独限制用户目标 | 实际数据还包含 alpine、web 和 linux-armhf 等平台         | 已接受                 |
| 2026-08-10 | 资源模型同时保留 primary 和 fallback URL          | 已确认部分历史 CDN asset 失效，但官方 fallback 仍可用    | 已接受                 |

## 15. 变更记录

| 日期       | 变更                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| 2026-08-10 | 根据原始项目交接材料创建项目定义基线，补充目标用户、产品原则、结果模型、验收标准、风险、待验证问题和七阶段路线图。 |
| 2026-08-10 | 完成 Phase 0：建立工程基线、协议探针、内部模型、四类真实 fixtures、CI、安全 URL 策略和自动化验证。                 |
