# VSIX Scout 社区调研与发布计划

> 记录日期：2026-08-12
>
> 用途：为 v0.2.0 纯静态 Web UI 准备社区沟通、项目发布与页面文案。

## 1. 定位

VSIX Scout 不是 VSIX 镜像或普通下载器。它的核心价值是：用户输入扩展 ID、VS Code 完整版本、目标平台和 channel 后，工具从 Visual Studio Marketplace 历史 metadata 中解析出最新兼容版本，解释选择原因，并给出 Microsoft Marketplace/CDN 的官方 VSIX 链接。

适合的场景包括：

- 固定或较旧版本的 VS Code。
- 受管设备、跳板机和需要离线传输的环境。
- 多平台扩展包，尤其是需要区分精确平台包和 universal fallback 的扩展。
- 需要下载地址保持官方来源、而不愿使用第三方镜像的用户。

Web 版应持续明确以下安全边界：浏览器直接请求 Marketplace，页面不托管、不代理、不重新打包、不读取 VSIX；页面可展示 `Marketplace reported SHA-256`，但不声称已验证下载文件。

## 2. 社区讨论清单

建议不要批量回复旧帖。优先选择仍有近期活动或与产品问题高度一致的 5-8 个帖子，写能独立解决问题的回复。Stack Overflow 只能提交完整技术答案，不能只留下产品链接。

### 优先参与

1. [GitHub: No download link for extensions under Version History #1135](https://github.com/microsoft/vsmarketplace/issues/1135)
   - Marketplace 网页下载入口消失，讨论包含 air-gapped、跳板机和受管环境。

2. [Stack Overflow: How can I download .vsix files now that Marketplace no longer supplies them in-browser?](https://stackoverflow.com/questions/79359919/how-can-i-download-vsix-files-now-that-the-visual-studio-code-marketplace-no-lo/79565372)
   - 近期评论提出 Marketplace Version History 只展示少量版本、用户无法找到正确历史版本的问题。

3. [Reddit: How to download a .vsix file? Was this option removed?](https://www.reddit.com/r/vscode/comments/1i4afwa)
   - 用户直接询问 Marketplace 网页下载能力是否被移除。

4. [Reddit: Need help finding how to download the vsix file for extensions](https://www.reddit.com/r/vscode/comments/1i2v8u2)
   - 安全系统中需要先扫描 VSIX，再传入目标环境的明确场景。

5. [Reddit: Can't download VSIX extensions from the web Marketplace anymore?](https://www.reddit.com/r/vscode/comments/1i6k7gf)
   - 用户依赖手工拼接下载 URL 或脚本。

6. [Reddit: How to install latest VSIX files?](https://www.reddit.com/r/vscode/comments/1m31bp3)
   - 离线电脑、历史版本和手工 URL 的综合问题。

7. [Reddit: VSIXHub safe?](https://www.reddit.com/r/vscode/comments/1kl4mov)
   - 可强调 VSIX Scout 不镜像文件，下载直接跳转 Microsoft 官方域名。

8. [GitHub: Unable to install extension on VS Code 1.73.1](https://github.com/microsoft/vscode-python/discussions/20283)
   - 展现 `engines.vscode`、stable/pre-release 和旧版 VS Code 的兼容性选择难题。

### 用于需求研究，或仅在有人继续提问时参与

9. [Stack Overflow: VSCode Download Older version of an Extension](https://stackoverflow.com/questions/69398500/vscode-download-older-version-of-an-extension)

10. [Stack Overflow: Get Older Visual Studio Code Extension VSIX File](https://stackoverflow.com/questions/75198962/get-older-visual-studio-code-extension-vsix-file)

11. [GitHub: How do we install older version of this extension? #1979](https://github.com/microsoft/vscode-remote-release/issues/1979)

12. [GitHub: Visual Studio Provided URL for Extension Manual Install #169483](https://github.com/microsoft/vscode/issues/169483)

13. [GitHub: C/C++ extension installed does not match your system #10104](https://github.com/microsoft/vscode-cpptools/issues/10104)

14. [Reddit: How do I install an older version of an extension?](https://www.reddit.com/r/vscode/comments/1agmz3o)

15. [Reddit: Installing older version of VS Code along with extensions](https://www.reddit.com/r/vscode/comments/14tx9uh)

16. [Reddit: How to copy extensions in internet less computer](https://www.reddit.com/r/vscode/comments/1dt1cv8)

中文互联网中，命中的直接讨论较少，更多是脚本或工具介绍。可参考 [VS Code Extension Downloader](https://scriptcat.org/zh-CN/script-show-page/4972)，但更适合自行在中文开发者社区首发，而不是对低质量旧帖做推广式回复。

## 3. 社区回复模板

发布前将 `[live link]` 和 `[source code]` 替换为实际链接。只在帖子问题确实对应时使用，不自动或批量发布。

```text
I built VSIX Scout for this exact workflow: managed or offline target machines
with an older VS Code version.

It queries Marketplace history directly in the browser, then selects the newest
version compatible with the VS Code version, requested channel, and target
platform. It also explains whether it chose an exact platform package or a
universal fallback.

The download link goes directly to Microsoft Marketplace/CDN. VSIX Scout does
not mirror, proxy, or inspect the VSIX file.

[live link] · [source code]
```

对于 Stack Overflow，答案应先给出通用技术方法和限制，再把 VSIX Scout 作为开源实现示例。对于 GitHub 和 Reddit，优先回答提问者的具体环境、VS Code 版本、平台和 channel 问题。

## 4. 发布计划

### 发布前准备

- 完成公开可试的 GitHub Pages 页面，保持零注册。
- README 第一屏提供真实示例，例如 `VS Code 1.73 + ms-python.python + linux-x64`。
- 提供一张流程图：输入版本和平台 -> 浏览器读取 Marketplace 历史 -> resolver 选择版本 -> Microsoft 官方链接下载。
- 在 README 和 Web 页明确安全边界：无后端、无账号、不镜像、不代理、不读取 VSIX。
- 建立 GitHub issue template 或 Discussions，收集“不支持的扩展”和“结果不符合预期”的案例。

### 首发顺序

1. 在第 2 节的高意图讨论中发布有帮助的回复。
2. 在 V2EX 的 `vscode` 或“分享创造”节点发布。V2EX 明确欢迎独立开发者发布新作品，但应选择与内容相符的节点。
3. 在掘金发布技术文章：`Microsoft Marketplace 不再提供网页下载后，如何为旧版 VS Code 找到正确的历史 VSIX`。
4. 向阮一峰科技爱好者周刊推荐。在项目有真实用户反馈、在线 Demo 和完整 README 后投递。
5. 发布 Show HN。项目应在发布时可直接试用、无需注册，作者需要在线回答问题。

### Show HN

建议标题：

```text
Show HN: VSIX Scout - find a VSIX compatible with your VS Code version
```

正文重点：

- Marketplace 网页历史下载体验退化。
- 手工拼 URL 容易选错扩展版本、channel 或平台。
- 项目不做镜像，直接给出 Microsoft 官方 URL。
- resolver 是开源、可检查、可复现的实现。

不要把页面写成营销落地页。Show HN 需要一个可当场使用的产品，并且不要请求朋友集中点赞或评论。

### 后续内容

每 2-3 周发布一篇真正帮助用户的内容，而不是重复推广：

- 为什么最新扩展不一定兼容旧版 VS Code。
- `engines.vscode`、stable/pre-release 与 SemVer 如何决定结果。
- 多平台 VSIX 为什么不能随意下载其他平台包。
- 如何在 OA 电脑下载后传入离线环境安装。

早期不必加入网站行为追踪。可通过 GitHub stars、issues、Discussion 中的问题类型和外链来源判断用户需求。

## 5. Web 页面文案

### 首屏中文

**Eyebrow**

```text
为固定版本 VS Code 选择正确的扩展包
```

**H1**

```text
不猜版本。找到真正兼容的官方 VSIX。
```

**正文**

```text
输入扩展 ID、VS Code 版本、目标平台和 channel。VSIX Scout 从 Marketplace
历史版本中找出最新兼容结果，并直接给出 Microsoft 官方下载链接。
```

**主按钮**

```text
查找兼容版本
```

**辅助说明**

```text
适合旧版 VS Code、受管设备，以及需要先下载再离线安装的工作流。
```

### 信任与差异化文案

**不是镜像站**

```text
下载链接直接指向 Microsoft Marketplace 或官方 CDN。VSIX Scout 不托管、不代理、不重新打包 VSIX。
```

**不只找“最新”**

```text
按 engines.vscode、stable/pre-release、目标平台和 universal fallback 选择，而不是猜测版本号。
```

**结果可解释**

```text
显示匹配到的 engine、实际包平台、发布时间，以及选择该版本的原因。
```

**完整性说明**

```text
可展示 Marketplace reported SHA-256。浏览器不会读取或验证已下载的 VSIX 文件。
```

### 结果区标签

```text
推荐版本
为什么选择这个版本
精确平台匹配
使用 universal fallback
Microsoft 官方 VSIX 下载
复制官方下载 URL
查看其他兼容版本
Marketplace reported SHA-256
浏览器未验证下载文件
```

### 英文首屏

```text
Find the right VSIX for the VS Code you actually run.

Resolve Marketplace history by VS Code version, platform, and release channel.
Download directly from Microsoft.
```

## 6. 事实依据

- [VS Code 官方文档：从 VSIX 安装扩展](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace)
- [Visual Studio Marketplace issue #1135：网页下载链接缺失](https://github.com/microsoft/vsmarketplace/issues/1135)
- [Show HN Guidelines](https://news.ycombinator.com/showhn.html)
- [V2EX 节点说明](https://www.v2ex.com/help/node)

## 7. 待办

- [ ] 深入研究第 2 节列出的社区帖子，记录每个帖子的具体用户环境、已尝试方案、仍未解决的问题、适合 VSIX Scout 回应的角度，以及社区规则或回复时机。
- [ ] 优先完成 [Marketplace 网页 Version History 没有下载链接 #1135](https://github.com/microsoft/vsmarketplace/issues/1135) 的讨论梳理：核对维护者的产品决定、受影响场景、现有 workaround、未解决缺口和适合公开回复的内容。
