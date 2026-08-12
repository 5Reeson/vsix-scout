import { ScoutError } from '@vsix-scout/core';

import type { MessageKey } from './i18n/index.js';

export interface WebErrorMessage {
  /** 标题的 i18n 键，由组件层用 t() 渲染。 */
  readonly titleKey: MessageKey;
  /** 详情的 i18n 键，由组件层用 t() 渲染。 */
  readonly detailKey: MessageKey;
  readonly retryable: boolean;
}

export function webErrorMessage(error: unknown): WebErrorMessage {
  if (!(error instanceof ScoutError)) {
    return {
      titleKey: 'error.unexpected.title',
      detailKey: 'error.unexpected.detail',
      retryable: true,
    };
  }

  const resource = error.details?.resource;
  const status = error.details?.status;

  if (error.code === 'INVALID_INPUT') {
    return {
      titleKey: 'error.invalidInput.title',
      detailKey: 'error.invalidInput.detail',
      retryable: false,
    };
  }
  if (error.code === 'EXTENSION_NOT_FOUND') {
    return {
      titleKey: 'error.notFound.title',
      detailKey: 'error.notFound.detail',
      retryable: false,
    };
  }
  if (error.code === 'NO_COMPATIBLE_VERSION') {
    return {
      titleKey: 'error.noCompatible.title',
      detailKey: 'error.noCompatible.detail',
      retryable: false,
    };
  }
  if (error.code === 'UNSAFE_RESOURCE_URL') {
    return {
      titleKey: 'error.unsafeUrl.title',
      detailKey: 'error.unsafeUrl.detail',
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      titleKey: 'error.rateLimited.title',
      detailKey: 'error.rateLimited.detail',
      retryable: true,
    };
  }
  if (resource === 'manifest') {
    return {
      titleKey: 'error.manifest.title',
      detailKey: 'error.manifest.detail',
      retryable: error.retryable,
    };
  }
  if (error.code === 'UPSTREAM_INVALID_RESPONSE') {
    return {
      titleKey: 'error.upstreamInvalid.title',
      detailKey: 'error.upstreamInvalid.detail',
      retryable: false,
    };
  }
  if (error.code === 'UPSTREAM_UNAVAILABLE') {
    return {
      titleKey: 'error.upstreamUnavailable.title',
      detailKey: 'error.upstreamUnavailable.detail',
      retryable: true,
    };
  }

  return {
    titleKey: 'error.queryFailed.title',
    detailKey: 'error.queryFailed.detail',
    retryable: error.retryable,
  };
}
