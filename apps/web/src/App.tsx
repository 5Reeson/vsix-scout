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
  useLanguage,
  type Interpolation,
  type Locale,
  type MessageKey,
} from './i18n/index.js';
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
const MANIFEST_BATCH_SIZE = 20;
// After resolving, park the result title this far down the viewport so the
// query form above and the result below stay visible at the same time.
const RESULT_SCROLL_FRACTION = 0.35;

const ASCII_SCENE = String.raw`
0  1   101 1 0       0 1 1 1 1 -----◇             1.95.0 -----> 1.101.0               0 1 1 0 1       ◇---------◇
1 1. 1 -----◇   ←-01.0        └------┐         { } <---->       0.011111.1           1 0 1 1 0         └------┐
0 1 1 1 0         0----------        │             ◇------------◇                     1.1101.0                │
1.92.2 ----> stable    0 1 0 1 1 ----┘        manifest.get() --> engine             universal ----> win32-x64

┌──────────────────────────────────┐             0 ------->   1 ------->           ┌──────────────────────────────────┐
│ { ext: ms-python.python  ------->│                                                     │ { target: win32-x64          ---->│
│   id: ms-python.python   ------->│             0 1 1 1   1.101.0                  │   channel: stable             ---->│
│   publisher: microsoft  ---------│             ┌───────────────┐                  │   vscode: 1.95.0              ---->│
│   type: extension        ------->│             │ resolve()     │                  │   source: marketplace         ---->│
│   engines.vscode ^1.101.0        │             └───────┬───────┘                  │   official: true                   │
└───────────────┬──────────────────┘                     │                          └─────────────────┬────────────────┘
                └-------------> compatible <-------------┘                                            │
0x01 0x10 0x11      asset: VSIXPackage ------------->            schema: v1        │       official.source = true

0 1 1 1       ┌──────────────────┬──────────────────┐          ◇--------◇          ┌──────────────────┴────────────────┐
1.101.0       │   ┌──────────┐   │ versions: [     │       1 0 1 0 1 1            │ selected: 2024.18.1              │
0 ------>     │   │  ╲       │   │   2024.18.1     │       0 --------->            │ platform: win32-x64              │
1 ------>     │   │    ╲     │   │   2024.16.0     │       1 ---○----->            │ download: official VSIX  ------>│
0 ------>     │   └──────────┘   │   2024.14.0     │       0 --------->            └───────────────────────────────────┘
              └──────────────────┴──────────────────┘          0.011111.1                  1 0 1 1 0 1  ----->
sha256.reported ----> 9f 2a 71 0c       0 1 0 0 1 1        fallback: universal      cache.ttl ----> 300s
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
  | {
      readonly status: 'success';
      readonly data: WebResolution;
      readonly submittedForm: FormState;
    }
  | { readonly status: 'error'; readonly error: WebErrorMessage };

type ChannelQueryState = Readonly<Record<ReleaseChannel, QueryState>>;
type ChannelNumberState = Readonly<Record<ReleaseChannel, number>>;

const IDLE_QUERIES: ChannelQueryState = {
  stable: { status: 'idle' },
  'pre-release': { status: 'idle' },
};

function queryScope(form: FormState): string {
  return JSON.stringify([
    form.extension.trim().toLowerCase(),
    form.vscode.trim(),
    form.platform,
  ]);
}

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
  t: (key: MessageKey, params?: Interpolation) => string,
  reason: ResolutionReason,
  item: WebResolvedVersion,
): string {
  const { resolution } = item;
  switch (reason.code) {
    case 'channel-match':
      return t('reason.channelMatch', { channel: resolution.target.channel });
    case 'engine-compatible':
      return t('reason.engineCompatible', {
        vscode: resolution.target.vscode,
        engine: resolution.compatibility.engine,
      });
    case 'engine-from-manifest':
      return t('reason.engineFromManifest');
    case 'exact-platform-match':
      return t('reason.exactPlatform', {
        platform: resolution.target.platform,
      });
    case 'universal-platform-fallback':
      return t('reason.universalFallback', {
        platform: resolution.target.platform,
      });
    case 'exact-version-selected':
      return t('reason.exactVersion', {
        version: resolution.target.version ?? resolution.selected.version,
      });
    case 'latest-compatible-selected':
      return t('reason.latestCompatible');
  }
}

function formatPublishedAt(value: string, locale: Locale): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
        dateStyle: 'medium',
      }).format(date);
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
  const { t } = useLanguage();
  const [form, setForm] = useState<FormState>(initialFormState);
  const [queries, setQueries] = useState<ChannelQueryState>(IDLE_QUERIES);
  const [visibleVersions, setVisibleVersions] = useState<ChannelNumberState>({
    stable: INITIAL_VISIBLE_VERSIONS,
    'pre-release': INITIAL_VISIBLE_VERSIONS,
  });
  const [loadingMoreChannel, setLoadingMoreChannel] =
    useState<ReleaseChannel | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const initialQueryStarted = useRef(false);
  const cachedScope = useRef<string | null>(null);
  const requestSequence = useRef<ChannelNumberState>({
    stable: 0,
    'pre-release': 0,
  });

  const query = queries[form.channel];

  function setChannelQuery(channel: ReleaseChannel, next: QueryState): void {
    setQueries((current) => ({ ...current, [channel]: next }));
  }

  async function runQuery(nextForm: FormState): Promise<void> {
    const nextScope = queryScope(nextForm);
    const requestId = requestSequence.current[nextForm.channel] + 1;
    requestSequence.current = {
      ...requestSequence.current,
      [nextForm.channel]: requestId,
    };
    if (cachedScope.current !== nextScope) {
      cachedScope.current = nextScope;
      setQueries({
        ...IDLE_QUERIES,
        [nextForm.channel]: { status: 'loading' },
      });
      setVisibleVersions({
        stable: INITIAL_VISIBLE_VERSIONS,
        'pre-release': INITIAL_VISIBLE_VERSIONS,
      });
    } else {
      setChannelQuery(nextForm.channel, { status: 'loading' });
      setVisibleVersions((current) => ({
        ...current,
        [nextForm.channel]: INITIAL_VISIBLE_VERSIONS,
      }));
    }
    setCopyStatus('');
    savePreferences(nextForm);
    saveShareableQuery(nextForm);

    try {
      const data = await resolveWebQuery(provider, nextForm, {
        manifestLimit: MANIFEST_BATCH_SIZE,
      });
      if (requestSequence.current[nextForm.channel] !== requestId) return;
      setChannelQuery(nextForm.channel, {
        status: 'success',
        data,
        submittedForm: nextForm,
      });
    } catch (error) {
      if (requestSequence.current[nextForm.channel] !== requestId) return;
      setChannelQuery(nextForm.channel, {
        status: 'error',
        error: webErrorMessage(error),
      });
    }
  }

  async function showMore(): Promise<void> {
    if (query.status !== 'success') return;
    const channel = query.submittedForm.channel;
    setLoadingMoreChannel(channel);
    try {
      const data = query.data.hasPendingManifests
        ? await resolveWebQuery(provider, query.submittedForm, {
            manifestLimit: MANIFEST_BATCH_SIZE,
          })
        : query.data;
      setChannelQuery(channel, {
        status: 'success',
        data,
        submittedForm: query.submittedForm,
      });
      setVisibleVersions((current) => ({
        ...current,
        [channel]: current[channel] + INITIAL_VISIBLE_VERSIONS,
      }));
    } catch (error) {
      setChannelQuery(channel, {
        status: 'error',
        error: webErrorMessage(error),
      });
    } finally {
      setLoadingMoreChannel(null);
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
        setChannelQuery(form.channel, {
          status: 'error',
          error: {
            titleKey: 'error.shareInvalid.title',
            detailKey: 'error.shareInvalid.detail',
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
      setCopyStatus(t('copy.copied', { label }));
    } catch {
      setCopyStatus(t('copy.failed', { label }));
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
              <h2 id="query-title">{t('section.queryTitle')}</h2>
              <p>{t('section.queryDescription')}</p>
            </header>
            <ResolveForm
              form={form}
              isLoading={isLoading}
              onChange={(nextForm) => {
                setForm(nextForm);
                setCopyStatus('');
              }}
              onCommit={saveShareableQuery}
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
            <h2 id="result-title">{t('section.resultTitle')}</h2>
            {query.status === 'idle' && <IdleState />}
            {query.status === 'loading' && <LoadingState />}
            {query.status === 'error' && <ErrorState error={query.error} />}
            {query.status === 'success' && (
              <RecommendedResult
                data={query.data}
                visibleVersions={visibleVersions[form.channel]}
                isLoadingMore={loadingMoreChannel === form.channel}
                onShowMore={() => void showMore()}
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
  const { t, locale, setLocale } = useLanguage();
  const nextLocale: Locale = locale === 'zh' ? 'en' : 'zh';
  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href={import.meta.env.BASE_URL}>
          {t('brand')}
        </a>
        <nav aria-label={t('nav.langToggle')}>
          <button
            className="nav-lang-toggle"
            type="button"
            aria-label={t('nav.langSwitchTo')}
            title={t('nav.langSwitchTo')}
            onClick={() => setLocale(nextLocale)}
          >
            <span className={locale === 'zh' ? 'is-active' : undefined}>
              中
            </span>
            <span className="nav-lang-sep" aria-hidden="true">
              /
            </span>
            <span className={locale === 'en' ? 'is-active' : undefined}>
              EN
            </span>
          </button>
          <a href="#about">{t('nav.about')}</a>
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
  const { t } = useLanguage();
  const heroRef = useRef<HTMLElement>(null);

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
        <pre className="ascii-scene">{ASCII_SCENE}</pre>
      </div>
      <div className="ascii-layer ascii-reveal" aria-hidden="true">
        <pre className="ascii-scene">{ASCII_SCENE}</pre>
      </div>
      <div className="hero-copy">
        <h1 id="page-title">VSIX Scout</h1>
        <p className="hero-lead">{t('hero.lead')}</p>
        <p className="hero-support">{t('hero.support')}</p>
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
  onCommit,
  onSubmit,
  hasError,
}: {
  readonly form: FormState;
  readonly isLoading: boolean;
  readonly onChange: (form: FormState) => void;
  readonly onCommit: (form: FormState) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly hasError: boolean;
}) {
  const { t } = useLanguage();
  return (
    <form
      className="query-form"
      onSubmit={onSubmit}
      aria-describedby={hasError ? 'query-feedback' : 'query-note'}
    >
      <div className="field">
        <label htmlFor="extension">{t('form.extensionLabel')}</label>
        <input
          id="extension"
          name="extension"
          type="text"
          required
          autoComplete="off"
          spellCheck="false"
          placeholder={t('form.extensionPlaceholder')}
          value={form.extension}
          onChange={(event) =>
            onChange({ ...form, extension: event.target.value })
          }
          onBlur={(event) =>
            onCommit({ ...form, extension: event.currentTarget.value })
          }
          disabled={isLoading}
        />
      </div>

      <div className="field">
        <label htmlFor="vscode">{t('form.vscodeLabel')}</label>
        <input
          id="vscode"
          name="vscode"
          type="text"
          required
          autoComplete="off"
          spellCheck="false"
          inputMode="decimal"
          placeholder={t('form.vscodePlaceholder')}
          value={form.vscode}
          onChange={(event) =>
            onChange({ ...form, vscode: event.target.value })
          }
          onBlur={(event) =>
            onCommit({ ...form, vscode: event.currentTarget.value })
          }
          disabled={isLoading}
        />
      </div>

      <div className="field">
        <label htmlFor="platform">{t('form.platformLabel')}</label>
        <PlatformSelect
          value={form.platform}
          disabled={isLoading}
          onChange={(platform) => {
            const nextForm = { ...form, platform };
            onChange(nextForm);
            onCommit(nextForm);
          }}
        />
      </div>

      <fieldset className="channel-field" disabled={isLoading}>
        <legend>{t('form.channelLegend')}</legend>
        <div className="channel-tabs">
          {(['stable', 'pre-release'] as const).map((channel) => (
            <label key={channel}>
              <input
                type="radio"
                name="channel"
                value={channel}
                checked={form.channel === channel}
                onChange={() => {
                  const nextForm = { ...form, channel };
                  onChange(nextForm);
                  onCommit(nextForm);
                }}
              />
              <span>{channel}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <button className="command-button" type="submit" disabled={isLoading}>
        <span aria-hidden="true">&gt;</span>
        <span>{isLoading ? t('form.resolving') : t('form.resolve')}</span>
        <span className="command-arrow" aria-hidden="true">
          →
        </span>
      </button>
      <p className="query-note" id="query-note">
        {t('form.note')}
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
  const { t } = useLanguage();
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
          aria-label={t('form.platformLabel')}
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
  const { t } = useLanguage();
  return (
    <div className="state-block idle-state">
      <p className="state-kicker">{t('idle.kicker')}</p>
      <p>{t('idle.body')}</p>
    </div>
  );
}

function LoadingState() {
  const { t } = useLanguage();
  return (
    <div className="loading-state" aria-label={t('loading.aria')}>
      <div className="skeleton skeleton-version" />
      <div className="skeleton skeleton-meta" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line skeleton-short" />
      <div className="skeleton skeleton-action" />
    </div>
  );
}

function ErrorState({ error }: { readonly error: WebErrorMessage }) {
  const { t } = useLanguage();
  return (
    <article id="query-feedback" className="state-block error-state">
      <p className="state-kicker">{t('error.kicker')}</p>
      <h3>{t(error.titleKey)}</h3>
      <p>{t(error.detailKey)}</p>
      {error.retryable && <p className="retry-note">{t('error.retryNote')}</p>}
    </article>
  );
}

function RecommendedResult({
  data,
  visibleVersions,
  isLoadingMore,
  onShowMore,
  onCopy,
}: {
  readonly data: WebResolution;
  readonly visibleVersions: number;
  readonly isLoadingMore: boolean;
  readonly onShowMore: () => void;
  readonly onCopy: (value: string, label: string) => Promise<void>;
}) {
  const { t, locale } = useLanguage();
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
          <span className="tag">{t('result.tagRecommended')}</span>
          <span className="tag tag-success">{resolution.selected.channel}</span>
          {isUniversal && (
            <span className="tag">{t('result.tagUniversalFallback')}</span>
          )}
        </div>
        <p className="result-identity">
          <span>
            {resolution.extension.displayName ?? resolution.extension.name}
          </span>
          <code>{resolution.extension.id}</code>
        </p>
        <p className="result-byline">
          {t('result.publishedOn', {
            date: formatPublishedAt(resolution.selected.publishedAt, locale),
          })}
          <span aria-hidden="true">·</span>
          {t('result.marketplace')}
        </p>
      </div>

      <div className="result-layout">
        <div className="result-details">
          <dl className="result-facts">
            <div>
              <dt>{t('result.factsEngine')}</dt>
              <dd>{resolution.compatibility.engine}</dd>
            </div>
            <div>
              <dt>{t('result.factsChannel')}</dt>
              <dd>{resolution.selected.channel}</dd>
            </div>
            <div>
              <dt>{t('result.factsActualPlatform')}</dt>
              <dd>{resolution.selected.targetPlatform}</dd>
            </div>
            <div>
              <dt>{t('result.factsUniversal')}</dt>
              <dd>{isUniversal ? t('result.yes') : t('result.no')}</dd>
            </div>
          </dl>

          <div className="explanation">
            <h3>{t('result.why')}</h3>
            <ul>
              {resolution.compatibility.reasons.map((reason) => (
                <li key={reason.code}>{reasonText(t, reason, item)}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="result-actions">
          {item.downloadUrl === undefined ? (
            <p className="download-unavailable">{t('result.noDownloadUrl')}</p>
          ) : (
            <>
              <a
                className="download-button"
                href={item.downloadUrl}
                target="_blank"
                rel="noopener noreferrer external"
              >
                <span aria-hidden="true">&gt;</span>
                {t('result.download')}
                <span aria-hidden="true">↗</span>
              </a>
              <button
                className="text-action"
                type="button"
                onClick={() =>
                  void onCopy(item.downloadUrl ?? '', t('result.copyLinkLabel'))
                }
              >
                {t('result.copyLink')}
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
            <span>{t('result.hashLabel')}</span>
            <p>{t('result.hashNote')}</p>
          </div>
          <button
            className="text-action"
            type="button"
            onClick={() =>
              void onCopy(
                resolution.selected.upstreamSha256 ?? '',
                t('result.hashLabel'),
              )
            }
          >
            {t('result.copySha')}
          </button>
          <code>{resolution.selected.upstreamSha256}</code>
        </div>
      )}

      <OtherCompatibleVersions
        versions={shownVersions}
        hasMore={
          shownVersions.length < otherVersions.length ||
          data.hasPendingManifests
        }
        isLoadingMore={isLoadingMore}
        onShowMore={onShowMore}
      />
    </article>
  );
}

function OtherCompatibleVersions({
  versions,
  hasMore,
  isLoadingMore,
  onShowMore,
}: {
  readonly versions: readonly WebResolvedVersion[];
  readonly hasMore: boolean;
  readonly isLoadingMore: boolean;
  readonly onShowMore: () => void;
}) {
  const { t } = useLanguage();
  return (
    <details className="other-versions">
      <summary>{t('versions.summary')}</summary>
      {versions.length === 0 && !hasMore ? (
        <p>{t('versions.none')}</p>
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
            <button
              className="show-more"
              type="button"
              onClick={onShowMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore
                ? t('versions.loadingMore')
                : t('versions.showMore')}
            </button>
          )}
        </>
      )}
    </details>
  );
}

function VersionRow({ item }: { readonly item: WebResolvedVersion }) {
  const { t, locale } = useLanguage();
  const { resolution } = item;
  return (
    <li>
      <div>
        <strong>{resolution.selected.version}</strong>
        <code>{resolution.compatibility.engine}</code>
      </div>
      <div>
        <span>{resolution.selected.targetPlatform}</span>
        <span>
          {formatPublishedAt(resolution.selected.publishedAt, locale)}
        </span>
      </div>
      {item.downloadUrl !== undefined && (
        <a
          href={item.downloadUrl}
          target="_blank"
          rel="noopener noreferrer external"
        >
          {t('versions.officialVsix')}
        </a>
      )}
    </li>
  );
}

function SiteFooter() {
  const { t } = useLanguage();
  return (
    <footer id="about">
      <div className="footer-inner">
        <p>{t('footer.line1')}</p>
        <p>{t('footer.line2')}</p>
      </div>
    </footer>
  );
}
