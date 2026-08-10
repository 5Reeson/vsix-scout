import { describe, expect, it } from 'vitest';

import { ScoutError } from '../src/index.js';

describe('ScoutError', () => {
  it('serializes to the stable JSON error envelope', () => {
    const error = new ScoutError(
      'UPSTREAM_UNAVAILABLE',
      'Marketplace timeout',
      {
        retryable: true,
        details: { status: 503 },
      },
    );

    expect(error.toJSON()).toEqual({
      schemaVersion: 1,
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'Marketplace timeout',
        retryable: true,
        details: { status: 503 },
      },
    });
  });
});
