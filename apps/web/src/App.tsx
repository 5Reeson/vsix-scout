import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import type { ReleaseChannel, ResolutionReason } from '@vsix-scout/core';
import {
  MarketplaceProvider,
  browserMarketplaceRequestAdapter,
} from '@vsix-scout/marketplace';
import {
  REQUESTED_TARGET_PLATFORMS,
  type RequestedTargetPlatform,
} from '@vsix-scout/shared';

import { webErrorMessage, type WebErrorMessage } from './error-message.js';
import {
  resolveWebQuery,
  type WebResolution,
  type WebResolvedVersion,
} from './web-resolution.js';

const provider = new MarketplaceProvider({
  requestAdapter: browserMarketplaceRequestAdapter,
});

const DEFAULT_VSCODE = '1.95.0';
const DEFAULT_PLATFORM: RequestedTargetPlatform = 'win32-x64';
const INITIAL_VISIBLE_VERSIONS = 8;
// After resolving, park the result title this far down the viewport so the
// query form above and the result below stay visible at the same time.
const RESULT_SCROLL_FRACTION = 0.35;

const ASCII_TEXTURE = String.raw`
0  1   1 0 1   1   101 1 0            0 1 1 1 1 -----◇
0 1 1. 1  ----- ◇   ←-01.0        ◇  -----------◇
0 1 1 1 0                             └--------┐
1 .95.0      0----------  1.101.0          1.1101.0
1 1 1 2 1.1  -----------  0.011111.1        │

{  }  <---->     ┌───────────────────────────────┐
0 -------->  ┌─  │ { ext: ms-python.python  ---->│
1 ---○---->  │   │   id: ms-python.python   ---->│
0 -------->  │ ↓ │   publisher: microsoft  -----│
1 ---○---->  └───│   type: extension       ---->│
                  │   engines.vscode ^1.101.0     │
0 1 1 1       ┌──┴──────────────┬────────────────┤
1.101.0       │   ┌──────────┐  │ versions: [   │
0 ------>     │   │  ╲       │  │   12.4.0      │
1 ------>     │   │    ╲     │  │   12.3.1      │
0 ------>     │   └──────────┘  │   12.2.0      │
               └────────────────┴───────────────┘
`;

interface FormState {
  readonly extension: string;
  readonly vscode: string;
  readonly platform: RequestedTargetPlatform;
  readonly channel: ReleaseChannel;
}

type QueryState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: WebResolution }
  | { readonly status: 'error'; readonly error: WebErrorMessage };

function isPlatform(value: string | null): value is RequestedTargetPlatform {
  return (
    value !== null &&
    REQUESTED_TARGET_PLATFORMS.includes(value as RequestedTargetPlatform)
  );
}

function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function initialFormState(): FormState {
  const params = new URLSearchParams(window.location.search);
  const savedPlatform = readPreference('vsix-scout.platform');
  const platformParam = params.get('platform');
  const channelParam = params.get('channel');

  return {
    extension: params.get('extension') ?? '',
    vscode:
      params.get('vscode') ??
      readPreference('vsix-scout.vscode') ??
      DEFAULT_VSCODE,
    platform: isPlatform(platformParam)
      ? platformParam
      : isPlatform(savedPlatform)
        ? savedPlatform
        : DEFAULT_PLATFORM,
    channel: channelParam === 'pre-release' ? 'pre-release' : 'stable',
  };
}

function savePreferences(form: FormState): void {
  try {
    window.localStorage.setItem('vsix-scout.vscode', form.vscode);
    window.localStorage.setItem('vsix-scout.platform', form.platform);
  } catch {
    // Browser privacy settings may disable localStorage. Querying still works.
  }
}

function saveShareableQuery(form: FormState): void {
  const params = new URLSearchParams({
    extension: form.extension.trim(),
    vscode: form.vscode.trim(),
    platform: form.platform,
    channel: form.channel,
  });
  const url = new URL(window.location.href);
  url.search = params.toString();
  window.history.replaceState(null, '', url);
}

function reasonText(
  reason: ResolutionReason,
  item: WebResolvedVersion,
): string {
  const { resolution } = item;
  switch (reason.code) {
    case 'channel-match':
      return `版本属于请求的 ${resolution.target.channel} channel。`;
    case 'engine-compatible':
      return `VS Code ${resolution.target.vscode} 满足 engines.vscode ${resolution.compatibility.engine}。`;
    case 'engine-from-manifest':
      return 'Marketplace metadata 缺少 Engine，engines.vscode 来自该版本的官方 manifest。';
    case 'exact-platform-match':
      return `包的平台与 ${resolution.target.platform} 精确匹配。`;
    case 'universal-platform-fallback':
      return `该版本没有更优的 ${resolution.target.platform} 变体，使用 universal 包。`;
    case 'exact-version-selected':
      return `版本与指定的 ${resolution.target.version ?? resolution.selected.version} 完全一致。`;
    case 'latest-compatible-selected':
      return '这是完成 channel、平台和 engine 过滤后的最高兼容版本。';
  }
}

function formatPublishedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date);
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard === undefined) {
    throw new Error('Clipboard API unavailable.');
  }
  await navigator.clipboard.writeText(value);
}

function scrollToResult(): void {
  const title = document.getElementById('result-title');
  if (title === null) return;
  const titleTop = title.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({
    top: Math.max(0, titleTop - window.innerHeight * RESULT_SCROLL_FRACTION),
    behavior: 'smooth',
  });
}

export function App() {
  const [form, setForm] = useState<FormState>(initialFormState);
  const [query, setQuery] = useState<QueryState>({ status: 'idle' });
  const [visibleVersions, setVisibleVersions] = useState(
    INITIAL_VISIBLE_VERSIONS,
  );
  const [copyStatus, setCopyStatus] = useState('');
  const initialQueryStarted = useRef(false);

  async function runQuery(nextForm: FormState): Promise<void> {
    setQuery({ status: 'loading' });
    setVisibleVersions(INITIAL_VISIBLE_VERSIONS);
    setCopyStatus('');
    savePreferences(nextForm);
    saveShareableQuery(nextForm);

    try {
      const data = await resolveWebQuery(provider, nextForm);
      setQuery({ status: 'success', data });
    } catch (error) {
      setQuery({ status: 'error', error: webErrorMessage(error) });
    }
  }

  useEffect(() => {
    if (initialQueryStarted.current) return;
    initialQueryStarted.current = true;
    const params = new URLSearchParams(window.location.search);
    if (
      params.has('extension') &&
      params.has('vscode') &&
      params.has('platform')
    ) {
      const platform = params.get('platform');
      const channel = params.get('channel');
      if (
        !isPlatform(platform) ||
        (channel !== null && channel !== 'stable' && channel !== 'pre-release')
      ) {
        setQuery({
          status: 'error',
          error: {
            title: '输入无效',
            detail: '分享链接包含不支持的平台或 channel。请重新选择后查询。',
            retryable: false,
          },
        });
        return;
      }
      void runQuery(form);
    }
  }, []);

  // Scroll as soon as the loading state is committed, so the viewport moves on
  // the very first query too. Scroll after render rather than synchronously in
  // runQuery: at click time React has not committed the loading UI yet, and a
  // layout change mid-scroll can cancel the first smooth scroll.
  useLayoutEffect(() => {
    if (query.status === 'loading') {
      scrollToResult();
    }
  }, [query]);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void runQuery(form);
  }

  async function handleCopy(value: string, label: string): Promise<void> {
    try {
      await copyText(value);
      setCopyStatus(`${label}已复制。`);
    } catch {
      setCopyStatus(`${label}复制失败，请手动选择文本。`);
    }
  }

  const isLoading = query.status === 'loading';

  return (
    <div className="page-shell">
      <DotMatrixRails />
      <SiteHeader />
      <main>
        <HeroAsciiReveal />
        <SectionDivider />

        <section className="workflow-section" aria-labelledby="query-title">
          <div className="workflow-content">
            <header className="section-heading">
              <h2 id="query-title">兼容性查询</h2>
              <p>输入扩展信息和目标环境，找到最新兼容版本。</p>
            </header>
            <ResolveForm
              form={form}
              isLoading={isLoading}
              onChange={setForm}
              onSubmit={submit}
              hasError={query.status === 'error'}
            />
          </div>
        </section>

        <SectionDivider />

        <section
          className="result-section"
          aria-labelledby="result-title"
          aria-live="polite"
        >
          <div className="workflow-content">
            <h2 id="result-title">推荐结果</h2>
            {query.status === 'idle' && <IdleState />}
            {query.status === 'loading' && <LoadingState />}
            {query.status === 'error' && <ErrorState error={query.error} />}
            {query.status === 'success' && (
              <RecommendedResult
                data={query.data}
                visibleVersions={visibleVersions}
                onShowMore={() =>
                  setVisibleVersions(
                    (value) => value + INITIAL_VISIBLE_VERSIONS,
                  )
                }
                onCopy={handleCopy}
              />
            )}
            <p className="copy-status" role="status" aria-live="polite">
              {copyStatus}
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href={import.meta.env.BASE_URL}>
          VSIX Scout
        </a>
        <nav aria-label="网站导航">
          <button className="nav-placeholder" type="button" disabled>
            中 / EN
          </button>
          <a href="#about">About</a>
          <a
            href="https://github.com/5Reeson/vsix-scout"
            target="_blank"
            rel="noopener noreferrer external"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}

function HeroAsciiReveal() {
  const heroRef = useRef<HTMLElement>(null);
  const texturePanels = ['left', 'center', 'right'] as const;

  function updateSpotlight(event: ReactPointerEvent<HTMLElement>): void {
    const hero = heroRef.current;
    if (hero === null) return;
    const bounds = hero.getBoundingClientRect();
    hero.style.setProperty('--spot-x', `${event.clientX - bounds.left}px`);
    hero.style.setProperty('--spot-y', `${event.clientY - bounds.top}px`);
  }

  function resetSpotlight(): void {
    heroRef.current?.style.setProperty('--spot-x', '50%');
    heroRef.current?.style.setProperty('--spot-y', '68%');
  }

  return (
    <section
      className="hero"
      ref={heroRef}
      onPointerMove={updateSpotlight}
      onPointerLeave={resetSpotlight}
      aria-labelledby="page-title"
    >
      <div className="ascii-layer ascii-base" aria-hidden="true">
        {texturePanels.map((panel) => (
          <pre className={`ascii-panel ascii-panel-${panel}`} key={panel}>
            {ASCII_TEXTURE}
          </pre>
        ))}
      </div>
      <div className="ascii-layer ascii-reveal" aria-hidden="true">
        {texturePanels.map((panel) => (
          <pre className={`ascii-panel ascii-panel-${panel}`} key={panel}>
            {ASCII_TEXTURE}
          </pre>
        ))}
      </div>
      <div className="hero-copy">
        <h1 id="page-title">VSIX Scout</h1>
        <p className="hero-lead">帮你找到适合当前 VS Code 的官方 VSIX 包</p>
        <p className="hero-support">
          直接查询 Marketplace，在浏览器内完成兼容性解析。
        </p>
      </div>
    </section>
  );
}

function DotMatrixRails() {
  return (
    <div className="dot-matrix" aria-hidden="true">
      <span className="dot-rail dot-rail-left" />
      <span className="dot-rail dot-rail-right" />
    </div>
  );
}

function SectionDivider() {
  return <div className="section-divider" aria-hidden="true" />;
}

function ResolveForm({
  form,
  isLoading,
  onChange,
  onSubmit,
  hasError,
}: {
  readonly form: FormState;
  readonly isLoading: boolean;
  readonly onChange: (form: FormState) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly hasError: boolean;
}) {
  return (
    <form
      className="query-form"
      onSubmit={onSubmit}
      aria-describedby={hasError ? 'query-feedback' : 'query-note'}
    >
      <div className="field">
        <label htmlFor="extension">Extension ID 或 Marketplace URL</label>
        <input
          id="extension"
          name="extension"
          type="text"
          required
          autoComplete="off"
          spellCheck="false"
          placeholder="ms-python.python"
          value={form.extension}
          onChange={(event) =>
            onChange({ ...form, extension: event.target.value })
          }
          disabled={isLoading}
        />
      </div>

      <div className="field">
        <label htmlFor="vscode">VS Code 完整版本号</label>
        <input
          id="vscode"
          name="vscode"
          type="text"
          required
          autoComplete="off"
          spellCheck="false"
          inputMode="decimal"
          placeholder="1.95.0"
          value={form.vscode}
          onChange={(event) =>
            onChange({ ...form, vscode: event.target.value })
          }
          disabled={isLoading}
        />
      </div>

      <div className="field">
        <label htmlFor="platform">目标平台</label>
        <PlatformSelect
          value={form.platform}
          disabled={isLoading}
          onChange={(platform) => onChange({ ...form, platform })}
        />
      </div>

      <fieldset className="channel-field" disabled={isLoading}>
        <legend>Channel</legend>
        <div className="channel-tabs">
          {(['stable', 'pre-release'] as const).map((channel) => (
            <label key={channel}>
              <input
                type="radio"
                name="channel"
                value={channel}
                checked={form.channel === channel}
                onChange={() => onChange({ ...form, channel })}
              />
              <span>{channel}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <button className="command-button" type="submit" disabled={isLoading}>
        <span aria-hidden="true">&gt;</span>
        <span>
          {isLoading ? 'Resolving compatibility' : 'Resolve compatibility'}
        </span>
        <span className="command-arrow" aria-hidden="true">
          →
        </span>
      </button>
      <p className="query-note" id="query-note">
        只查询，不下载。最近使用的 VS Code 版本和平台仅保存在本机。
      </p>
    </form>
  );
}

function PlatformSelect({
  value,
  disabled,
  onChange,
}: {
  readonly value: RequestedTargetPlatform;
  readonly disabled: boolean;
  readonly onChange: (platform: RequestedTargetPlatform) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Record<number, HTMLLIElement | null>>({});
  const selectedIndex = REQUESTED_TARGET_PLATFORMS.indexOf(value);
  const [activeIndex, setActiveIndex] = useState(
    selectedIndex === -1 ? 0 : selectedIndex,
  );

  const listboxId = 'platform-listbox';

  function close(): void {
    setOpen(false);
  }

  function openList(): void {
    if (disabled) return;
    setActiveIndex(selectedIndex === -1 ? 0 : selectedIndex);
    setOpen(true);
  }

  function selectOption(index: number): void {
    const platform = REQUESTED_TARGET_PLATFORMS[index];
    if (platform !== undefined) {
      onChange(platform);
    }
    close();
  }

  function moveActive(delta: number): void {
    const count = REQUESTED_TARGET_PLATFORMS.length;
    setActiveIndex((current) => (current + delta + count) % count);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent): void {
      if (rootRef.current?.contains(event.target as Node) === false) {
        close();
      }
    }
    function onDocumentKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  function handleTriggerKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (open) moveActive(1);
        else openList();
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (open) moveActive(-1);
        else openList();
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(REQUESTED_TARGET_PLATFORMS.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) selectOption(activeIndex);
        else openList();
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
      default:
        break;
    }
  }

  return (
    <div className="platform-select" ref={rootRef}>
      <button
        id="platform"
        name="platform"
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={
          open ? `platform-option-${activeIndex}` : undefined
        }
        className="platform-trigger"
        onClick={() => (open ? close() : openList())}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
      >
        <span className="platform-trigger-value">{value}</span>
        <span className="platform-trigger-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="目标平台"
          className="platform-menu"
        >
          {REQUESTED_TARGET_PLATFORMS.map((platform, index) => (
            <li
              key={platform}
              id={`platform-option-${index}`}
              role="option"
              aria-selected={platform === value}
              className={[
                'platform-option',
                index === activeIndex ? 'is-active' : '',
                platform === value ? 'is-selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              onPointerMove={() => setActiveIndex(index)}
              onPointerDown={() => {
                setActiveIndex(index);
                selectOption(index);
              }}
            >
              <span>{platform}</span>
              {platform === value && (
                <span className="platform-check" aria-hidden="true">
                  ✓
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IdleState() {
  return (
    <div className="state-block idle-state">
      <p className="state-kicker">等待查询</p>
      <p>提交上方信息后，这里会显示推荐版本、选择原因和官方下载链接。</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="loading-state" aria-label="正在查询 Marketplace">
      <div className="skeleton skeleton-version" />
      <div className="skeleton skeleton-meta" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line skeleton-short" />
      <div className="skeleton skeleton-action" />
    </div>
  );
}

function ErrorState({ error }: { readonly error: WebErrorMessage }) {
  return (
    <article id="query-feedback" className="state-block error-state">
      <p className="state-kicker">Query failed</p>
      <h3>{error.title}</h3>
      <p>{error.detail}</p>
      {error.retryable && <p className="retry-note">请稍后再次 Resolve。</p>}
    </article>
  );
}

function RecommendedResult({
  data,
  visibleVersions,
  onShowMore,
  onCopy,
}: {
  readonly data: WebResolution;
  readonly visibleVersions: number;
  readonly onShowMore: () => void;
  readonly onCopy: (value: string, label: string) => Promise<void>;
}) {
  const item = data.selected;
  const { resolution } = item;
  const otherVersions = data.compatibleVersions.slice(1);
  const shownVersions = otherVersions.slice(0, visibleVersions);
  const isUniversal = resolution.compatibility.platformMatch === 'universal';

  return (
    <article className="result-content">
      <div className="result-summary">
        <div className="result-version-line">
          <strong>{resolution.selected.version}</strong>
          <span className="tag">Recommended</span>
          <span className="tag tag-success">{resolution.selected.channel}</span>
          {isUniversal && <span className="tag">universal fallback</span>}
        </div>
        <p className="result-identity">
          <span>
            {resolution.extension.displayName ?? resolution.extension.name}
          </span>
          <code>{resolution.extension.id}</code>
        </p>
        <p className="result-byline">
          发布于 {formatPublishedAt(resolution.selected.publishedAt)}
          <span aria-hidden="true">·</span>
          Microsoft Marketplace
        </p>
      </div>

      <div className="result-layout">
        <div className="result-details">
          <dl className="result-facts">
            <div>
              <dt>engines.vscode</dt>
              <dd>{resolution.compatibility.engine}</dd>
            </div>
            <div>
              <dt>Channel</dt>
              <dd>{resolution.selected.channel}</dd>
            </div>
            <div>
              <dt>实际平台</dt>
              <dd>{resolution.selected.targetPlatform}</dd>
            </div>
            <div>
              <dt>Universal fallback</dt>
              <dd>{isUniversal ? 'Yes' : 'No'}</dd>
            </div>
          </dl>

          <div className="explanation">
            <h3>选择原因</h3>
            <ul>
              {resolution.compatibility.reasons.map((reason) => (
                <li key={reason.code}>{reasonText(reason, item)}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="result-actions">
          {item.downloadUrl === undefined ? (
            <p className="download-unavailable">
              Marketplace metadata 没有提供可用的 VSIXPackage URL。
            </p>
          ) : (
            <>
              <a
                className="download-button"
                href={item.downloadUrl}
                target="_blank"
                rel="noopener noreferrer external"
              >
                <span aria-hidden="true">&gt;</span>
                Download official VSIX
                <span aria-hidden="true">↗</span>
              </a>
              <button
                className="text-action"
                type="button"
                onClick={() => void onCopy(item.downloadUrl ?? '', '下载 URL')}
              >
                复制下载链接
              </button>
            </>
          )}
        </div>
      </div>

      {item.downloadUrl !== undefined && (
        <code className="resource-value">{item.downloadUrl}</code>
      )}

      {resolution.selected.upstreamSha256 !== undefined && (
        <div className="hash-block">
          <div>
            <span>Marketplace reported SHA-256</span>
            <p>Marketplace metadata 报告值，浏览器未验证下载文件。</p>
          </div>
          <button
            className="text-action"
            type="button"
            onClick={() =>
              void onCopy(
                resolution.selected.upstreamSha256 ?? '',
                'Marketplace reported SHA-256',
              )
            }
          >
            复制 SHA-256
          </button>
          <code>{resolution.selected.upstreamSha256}</code>
        </div>
      )}

      <OtherCompatibleVersions
        versions={shownVersions}
        total={otherVersions.length}
        hasMore={shownVersions.length < otherVersions.length}
        onShowMore={onShowMore}
      />
    </article>
  );
}

function OtherCompatibleVersions({
  versions,
  total,
  hasMore,
  onShowMore,
}: {
  readonly versions: readonly WebResolvedVersion[];
  readonly total: number;
  readonly hasMore: boolean;
  readonly onShowMore: () => void;
}) {
  return (
    <details className="other-versions">
      <summary>查看其他兼容版本 ({total})</summary>
      {total === 0 ? (
        <p>没有其他版本同时满足当前条件。</p>
      ) : (
        <>
          <ol className="version-list">
            {versions.map((version) => (
              <VersionRow
                key={`${version.resolution.selected.version}-${version.resolution.selected.targetPlatform}`}
                item={version}
              />
            ))}
          </ol>
          {hasMore && (
            <button className="show-more" type="button" onClick={onShowMore}>
              显示更多
            </button>
          )}
        </>
      )}
    </details>
  );
}

function VersionRow({ item }: { readonly item: WebResolvedVersion }) {
  const { resolution } = item;
  return (
    <li>
      <div>
        <strong>{resolution.selected.version}</strong>
        <code>{resolution.compatibility.engine}</code>
      </div>
      <div>
        <span>{resolution.selected.targetPlatform}</span>
        <span>{formatPublishedAt(resolution.selected.publishedAt)}</span>
      </div>
      {item.downloadUrl !== undefined && (
        <a
          href={item.downloadUrl}
          target="_blank"
          rel="noopener noreferrer external"
        >
          官方 VSIX ↗
        </a>
      )}
    </li>
  );
}

function SiteFooter() {
  return (
    <footer id="about">
      <div className="footer-inner">
        <p>
          VSIX Scout 根据 Marketplace 的 engines.vscode、channel
          和平台信息选择兼容版本。
        </p>
        <p>不代理、不缓存、不执行 VSIX。下载直接来自 Microsoft。</p>
      </div>
    </footer>
  );
}
