import { describe, expect, it } from 'vitest';
import en from '../i18n/locales/en.json';
import ja from '../i18n/locales/ja.json';

function leafKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) => (
    leafKeys(child, prefix ? `${prefix}.${key}` : key)
  ));
}

describe('i18n locale parity', () => {
  it('keeps the complete English and Japanese translation key sets equal', () => {
    expect(leafKeys(en).sort()).toEqual(leafKeys(ja).sort());
  });
});
