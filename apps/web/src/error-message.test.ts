import { ScoutError } from '@vsix-scout/core';
import { describe, expect, it } from 'vitest';

import { webErrorMessage } from './error-message.js';

describe('webErrorMessage', () => {
  it('distinguishes Marketplace 429 from generic network failures', () => {
    const message = webErrorMessage(
      new ScoutError('UPSTREAM_UNAVAILABLE', 'rate limited', {
        retryable: true,
        details: { resource: 'metadata', status: 429 },
      }),
    );

    expect(message.title).toContain('请求过于频繁');
    expect(message.retryable).toBe(true);
  });

  it('distinguishes manifest fallback failures', () => {
    const message = webErrorMessage(
      new ScoutError('UPSTREAM_INVALID_RESPONSE', 'bad manifest', {
        details: { resource: 'manifest' },
      }),
    );

    expect(message.title).toBe('Manifest fallback 失败');
  });

  it('does not expose unexpected error text', () => {
    const message = webErrorMessage(
      new Error('token=private /Users/example/secret'),
    );

    expect(JSON.stringify(message)).not.toContain('private');
    expect(JSON.stringify(message)).not.toContain('/Users/example');
  });
});
