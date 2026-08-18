import { useCallback, useRef, useState } from 'react';

import type { ExtensionProvider } from '@vsix-scout/core';
import type {
  MarketplaceSearchResult,
  SearchRequestOptions,
} from '@vsix-scout/shared';

export type SuggestionsState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly keyword: string }
  | {
      readonly status: 'success';
      readonly keyword: string;
      readonly items: readonly MarketplaceSearchResult[];
    }
  | { readonly status: 'error'; readonly keyword: string };

/**
 * Runs `provider.searchExtensions` for a keyword and guards against stale
 * results when the user keeps typing or submits again. Resolve failures that
 * are not suggestion-worthy never reach this hook.
 */
export function useSearchSuggestions(provider: ExtensionProvider) {
  const [state, setState] = useState<SuggestionsState>({ status: 'idle' });
  const sequence = useRef(0);

  const search = useCallback(
    async (keyword: string, options?: SearchRequestOptions) => {
      const requestId = sequence.current + 1;
      sequence.current = requestId;
      setState({ status: 'loading', keyword });
      try {
        const items =
          (await provider.searchExtensions?.(keyword, options)) ?? [];
        if (sequence.current !== requestId) return;
        setState({ status: 'success', keyword, items });
      } catch {
        if (sequence.current !== requestId) return;
        setState({ status: 'error', keyword });
      }
    },
    [provider],
  );

  const reset = useCallback(() => {
    sequence.current += 1;
    setState({ status: 'idle' });
  }, []);

  return { state, search, reset };
}
