import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { en } from './en.js';
import { zh, type MessageKey } from './zh.js';

export type { MessageKey };

export type Locale = 'zh' | 'en';

/** 插值参数：`t(key, { name: value })` 会把键中的 `{name}` 替换为 value。 */
export type Interpolation = Record<string, string | number>;

const LOCALE_STORAGE_KEY = 'vsix-scout.locale';

const dictionaries: Record<Locale, Record<MessageKey, string>> = { zh, en };

export function translate(
  locale: Locale,
  key: MessageKey,
  params?: Interpolation,
): string {
  let text = dictionaries[locale][key];
  if (params !== undefined) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

function detectLocale(): Locale {
  const param = new URLSearchParams(window.location.search).get('lang');
  if (param === 'zh' || param === 'en') return param;

  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    // localStorage 可能被浏览器隐私设置禁用，忽略并走浏览器语言。
  }

  const browser = navigator.language.toLowerCase();
  return browser.startsWith('zh') ? 'zh' : 'en';
}

/** 把当前语言写到 <html lang>、localStorage 和 URL 的 lang 参数（可分享）。 */
function applyLocale(locale: Locale): void {
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // 忽略；查询功能不受影响。
  }
  const url = new URL(window.location.href);
  if (url.searchParams.get('lang') !== locale) {
    url.searchParams.set('lang', locale);
    window.history.replaceState(null, '', url);
  }
}

interface LanguageContextValue {
  readonly locale: Locale;
  /** 绑定当前语言，`t(key, params?)` 返回渲染好的文案。 */
  readonly t: (key: MessageKey, params?: Interpolation) => string;
  readonly setLocale: (locale: Locale) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  useEffect(() => {
    applyLocale(locale);
  }, [locale]);

  const t = useCallback(
    (key: MessageKey, params?: Interpolation) => translate(locale, key, params),
    [locale],
  );

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);

  const value = useMemo(
    () => ({ locale, t, setLocale }),
    [locale, t, setLocale],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (context === null) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
