import { ScoutError } from '@vsix-scout/core';
import { describe, expect, it } from 'vitest';

import { webErrorMessage } from './error-message.js';
import { zh } from './i18n/zh.js';

describe('webErrorMessage', () => {
  it('distinguishes Marketplace 429 from generic network failures', () => {
    const message = webErrorMessage(
      new ScoutError('UPSTREAM_UNAVAILABLE', 'rate limited', {
        retryable: true,
        details: { resource: 'metadata', status: 429 },
      }),
    );

    expect(message.titleKey).toBe('error.rateLimited.title');
    expect(message.detailKey).toBe('error.rateLimited.detail');
    expect(message.retryable).toBe(true);
  });

  it('distinguishes manifest fallback failures', () => {
    const message = webErrorMessage(
      new ScoutError('UPSTREAM_INVALID_RESPONSE', 'bad manifest', {
        details: { resource: 'manifest' },
      }),
    );

    expect(message.titleKey).toBe('error.manifest.title');
    expect(message.detailKey).toBe('error.manifest.detail');
  });

  it('does not expose unexpected error text', () => {
    const message = webErrorMessage(
      new Error('token=private /Users/example/secret'),
    );

    expect(JSON.stringify(message)).not.toContain('private');
    expect(JSON.stringify(message)).not.toContain('/Users/example');
  });

  it('maps every produced key to a translated string', () => {
    const sample = webErrorMessage(
      new ScoutError('UPSTREAM_INVALID_RESPONSE', 'bad payload', {
        details: { resource: 'metadata', status: 502 },
      }),
    );
    // All keys emitted by webErrorMessage must resolve to a non-empty zh string.
    for (const key of [sample.titleKey, sample.detailKey]) {
      expect(zh[key]).toBeTruthy();
    }
  });
});
