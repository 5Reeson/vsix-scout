import { describe, expect, it } from 'vitest';

import { en } from './en.js';
import { translate } from './index.js';
import { zh } from './zh.js';

describe('i18n dictionaries', () => {
  it('keeps zh and en key sets identical', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  });

  it('has no empty strings in either locale', () => {
    for (const value of Object.values(zh)) {
      expect(value.length).toBeGreaterThan(0);
    }
    for (const value of Object.values(en)) {
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('interpolates placeholders', () => {
    expect(
      translate('zh', 'reason.exactPlatform', { platform: 'win32-x64' }),
    ).toBe('包的平台与 win32-x64 精确匹配。');
    expect(
      translate('en', 'reason.exactPlatform', { platform: 'win32-x64' }),
    ).toBe('The package platform exactly matches win32-x64.');
  });
});
