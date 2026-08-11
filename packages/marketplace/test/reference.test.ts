import type { ScoutError } from '@vsix-scout/core';
import { describe, expect, it } from 'vitest';

import { parseMarketplaceExtensionReference } from '../src/index.js';

describe('parseMarketplaceExtensionReference', () => {
  it.each([
    'MS-Python.Python',
    '  ms-python.python  ',
    'https://marketplace.visualstudio.com/items?itemName=MS-Python.Python',
    'https://marketplace.visualstudio.com/items/?itemName=ms-python.python&utm_source=test',
  ])('normalizes a supported extension reference: %s', (input) => {
    expect(parseMarketplaceExtensionReference(input)).toEqual({
      id: 'ms-python.python',
      publisher: 'ms-python',
      name: 'python',
    });
  });

  it.each([
    'python',
    'publisher.extension.extra',
    'publisher._extension',
    'https://example.com/items?itemName=ms-python.python',
    'http://marketplace.visualstudio.com/items?itemName=ms-python.python',
    'https://marketplace.visualstudio.com.evil.example/items?itemName=ms-python.python',
    'https://marketplace.visualstudio.com/search?itemName=ms-python.python',
    'https://marketplace.visualstudio.com/items',
  ])('rejects an unsupported or unsafe reference: %s', (input) => {
    expect(() => parseMarketplaceExtensionReference(input)).toThrowError(
      expect.objectContaining<ScoutError>({ code: 'INVALID_INPUT' }),
    );
  });
});
